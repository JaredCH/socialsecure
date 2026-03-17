const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const SocialPageConfig = require('../models/SocialPageConfig');
const {
  SOCIAL_DESIGN_TEMPLATES,
  buildDefaultSocialPagePreferences,
  mergeDesignPatch,
  normalizeSocialPagePreferences,
  toPublicSocialPagePreferences
} = require('../utils/socialPagePreferences');

const router = express.Router();

const BG_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
const BG_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const BG_ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const bgUploadRoot = path.join(__dirname, '..', 'uploads', 'backgrounds');
const bgUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BG_UPLOAD_MAX_BYTES, files: 1 }
});

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', async (err, payload) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    const user = await User.findById(payload.userId);
    if (!user || user.registrationStatus !== 'active') {
      return res.status(403).json({ error: 'User not found or inactive' });
    }

    req.user = user;
    next();
  });
};

const getViewerIdFromAuthHeader = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    return payload.userId ? String(payload.userId) : null;
  } catch {
    return null;
  }
};

const normalizeConfigName = (name, fallback = 'Untitled design') => {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return (trimmed || fallback).slice(0, 80);
};

const cloneValue = (value) => JSON.parse(JSON.stringify(value));

const logSocialPageEvent = ({ eventType, userId, req, metadata = {} }) => {
  console.log('[social-page-event]', JSON.stringify({
    eventType,
    userId: userId ? String(userId) : null,
    metadata,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null,
    createdAt: new Date().toISOString()
  }));
};

const serializeConfig = (configDoc, viewerId = null) => ({
  _id: String(configDoc._id),
  name: configDoc.name,
  isShared: Boolean(configDoc.isShared),
  templateId: configDoc.templateId || null,
  sourceConfigId: configDoc.sourceConfigId ? String(configDoc.sourceConfigId) : null,
  sourceOwnerId: configDoc.sourceOwnerId ? String(configDoc.sourceOwnerId) : null,
  isFavorite: viewerId ? (configDoc.favoritedBy || []).some((entry) => String(entry) === String(viewerId)) : false,
  favoritesCount: Array.isArray(configDoc.favoritedBy) ? configDoc.favoritedBy.length : 0,
  owner: configDoc.owner && typeof configDoc.owner === 'object'
    ? {
        _id: String(configDoc.owner._id),
        username: configDoc.owner.username,
        realName: configDoc.owner.realName || ''
      }
    : undefined,
  design: toPublicSocialPagePreferences(configDoc.design, { profileTheme: 'default' }),
  createdAt: configDoc.createdAt,
  updatedAt: configDoc.updatedAt
});

const ensureBootstrapConfig = async (user) => {
  const existingConfigs = await SocialPageConfig.find({ owner: user._id }).sort({ updatedAt: -1 });
  if (existingConfigs.length > 0) {
    if (!user.socialPagePreferences?.activeConfigId) {
      const normalized = normalizeSocialPagePreferences(user.socialPagePreferences, {
        profileTheme: user.profileTheme || 'default'
      }).value || buildDefaultSocialPagePreferences(user.profileTheme || 'default');
      normalized.activeConfigId = String(existingConfigs[0]._id);
      user.socialPagePreferences = normalized;
      await user.save();
    }
    return existingConfigs;
  }

  const normalized = normalizeSocialPagePreferences(user.socialPagePreferences, {
    profileTheme: user.profileTheme || 'default'
  }).value || buildDefaultSocialPagePreferences(user.profileTheme || 'default');

  const config = await SocialPageConfig.create({
    owner: user._id,
    name: 'Current design',
    design: normalized
  });

  user.socialPagePreferences = {
    ...normalized,
    activeConfigId: String(config._id)
  };
  await user.save();

  return [config];
};

const applyConfigToUser = async (user, config) => {
  const normalizedDesign = normalizeSocialPagePreferences(config.design, {
    profileTheme: user.profileTheme || 'default'
  }).value || buildDefaultSocialPagePreferences(user.profileTheme || 'default');
  normalizedDesign.activeConfigId = String(config._id);
  user.socialPagePreferences = normalizedDesign;
  await user.save();
  return normalizedDesign;
};

const findUserByIdentifier = async (identifier) => {
  const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
  if (!normalizedIdentifier) return null;

  const query = [{ username: normalizedIdentifier }];
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    query.push({ _id: identifier });
  }

  return User.findOne({ $or: query }).select('_id username realName profileTheme socialPagePreferences').lean();
};

router.get('/configs', authenticateToken, async (req, res) => {
  try {
    await ensureBootstrapConfig(req.user);

    const [configs, favoriteConfigs] = await Promise.all([
      SocialPageConfig.find({ owner: req.user._id }).sort({ updatedAt: -1 }).lean(),
      SocialPageConfig.find({ isShared: true, favoritedBy: req.user._id })
        .populate('owner', 'username realName')
        .sort({ updatedAt: -1 })
        .lean()
    ]);

    return res.json({
      success: true,
      currentPreferences: toPublicSocialPagePreferences(req.user.socialPagePreferences, {
        profileTheme: req.user.profileTheme || 'default'
      }),
      activeConfigId: req.user.socialPagePreferences?.activeConfigId ? String(req.user.socialPagePreferences.activeConfigId) : null,
      configs: configs.map((config) => serializeConfig(config, req.user._id)),
      favorites: favoriteConfigs.map((config) => serializeConfig(config, req.user._id)),
      templates: SOCIAL_DESIGN_TEMPLATES
    });
  } catch (error) {
    console.error('Error loading social page configs:', error);
    return res.status(500).json({ error: 'Failed to load social page configs' });
  }
});

router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const normalized = normalizeSocialPagePreferences(req.body?.preferences || req.body, {
      profileTheme: req.user.profileTheme || 'default',
      strict: true
    });

    if (normalized.error || !normalized.value) {
      return res.status(400).json({ error: normalized.error || 'Invalid social page preferences' });
    }

    const nextPreferences = normalized.value;
    const syncActiveConfig = req.body?.syncActiveConfig !== false;
    req.user.socialPagePreferences = nextPreferences;

    if (syncActiveConfig) {
      await ensureBootstrapConfig(req.user);
      const activeConfigId = req.user.socialPagePreferences?.activeConfigId || nextPreferences.activeConfigId;
      if (activeConfigId) {
        await SocialPageConfig.updateOne(
          { _id: activeConfigId, owner: req.user._id },
          { $set: { design: nextPreferences } }
        );
        nextPreferences.activeConfigId = String(activeConfigId);
      }
    }

    await req.user.save();

    logSocialPageEvent({
      eventType: 'social_page_preferences_saved',
      userId: req.user._id,
      req,
      metadata: {
        activeConfigId: nextPreferences.activeConfigId || null,
        themePreset: nextPreferences.themePreset
      }
    });

    return res.json({
      success: true,
      preferences: toPublicSocialPagePreferences(req.user.socialPagePreferences, {
        profileTheme: req.user.profileTheme || 'default'
      })
    });
  } catch (error) {
    console.error('Error saving social page preferences:', error);
    return res.status(500).json({ error: 'Failed to save social page preferences' });
  }
});

router.post('/body-background-upload', authenticateToken, bgUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const mimeType = String(req.file.mimetype || '').toLowerCase();
    const ext = path.extname(String(req.file.originalname || '')).toLowerCase();

    if (!BG_ALLOWED_MIME_TYPES.has(mimeType)) {
      return res.status(400).json({ error: 'Unsupported image type. Use JPEG, PNG, GIF, or WebP.' });
    }
    if (!BG_ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: 'Unsupported file extension.' });
    }
    if (req.file.size > BG_UPLOAD_MAX_BYTES) {
      return res.status(400).json({ error: 'Image file is too large (max 3MB).' });
    }

    const userId = String(req.user._id);
    const userDir = path.join(bgUploadRoot, userId);
    await fs.mkdir(userDir, { recursive: true });

    const randomPart = crypto.randomBytes(8).toString('hex');
    const fileName = `${Date.now()}-${randomPart}${ext}`;
    const filePath = path.join(userDir, fileName);
    await fs.writeFile(filePath, req.file.buffer);

    const mediaUrl = `/uploads/backgrounds/${userId}/${fileName}`;

    return res.json({ success: true, mediaUrl, fileSize: req.file.size, mimeType });
  } catch (error) {
    console.error('Error uploading body background:', error);
    return res.status(500).json({ error: 'Failed to upload background image' });
  }
});

router.post('/configs', authenticateToken, async (req, res) => {
  try {
    const apply = Boolean(req.body?.apply);
    const normalized = normalizeSocialPagePreferences(req.body?.design || req.user.socialPagePreferences, {
      profileTheme: req.user.profileTheme || 'default',
      strict: true
    });
    if (normalized.error || !normalized.value) {
      return res.status(400).json({ error: normalized.error || 'Invalid config design' });
    }

    const config = await SocialPageConfig.create({
      owner: req.user._id,
      name: normalizeConfigName(req.body?.name, `Design ${uuidv4().slice(0, 6)}`),
      design: normalized.value,
      templateId: typeof req.body?.templateId === 'string' ? req.body.templateId.trim() : null
    });

    if (apply) {
      await applyConfigToUser(req.user, config);
    }

    logSocialPageEvent({
      eventType: 'social_page_config_created',
      userId: req.user._id,
      req,
      metadata: { configId: String(config._id), apply }
    });

    return res.status(201).json({
      success: true,
      config: serializeConfig(config.toObject(), req.user._id),
      activeConfigId: req.user.socialPagePreferences?.activeConfigId ? String(req.user.socialPagePreferences.activeConfigId) : null
    });
  } catch (error) {
    console.error('Error creating social page config:', error);
    return res.status(500).json({ error: 'Failed to create social page config' });
  }
});

router.patch('/configs/:id', authenticateToken, async (req, res) => {
  try {
    const config = await SocialPageConfig.findOne({ _id: req.params.id, owner: req.user._id });
    if (!config) {
      return res.status(404).json({ error: 'Config not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      config.name = normalizeConfigName(req.body.name, config.name);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'isShared')) {
      config.isShared = Boolean(req.body.isShared);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'design')) {
      const normalized = normalizeSocialPagePreferences(req.body.design, {
        profileTheme: req.user.profileTheme || 'default',
        strict: true
      });
      if (normalized.error || !normalized.value) {
        return res.status(400).json({ error: normalized.error || 'Invalid config design' });
      }
      config.design = normalized.value;
    }

    await config.save();

    if (String(req.user.socialPagePreferences?.activeConfigId || '') === String(config._id) && req.body?.design) {
      await applyConfigToUser(req.user, config);
    }

    return res.json({ success: true, config: serializeConfig(config.toObject(), req.user._id) });
  } catch (error) {
    console.error('Error updating social page config:', error);
    return res.status(500).json({ error: 'Failed to update social page config' });
  }
});

router.post('/configs/:id/apply', authenticateToken, async (req, res) => {
  try {
    const config = await SocialPageConfig.findOne({ _id: req.params.id, owner: req.user._id });
    if (!config) {
      return res.status(404).json({ error: 'Config not found' });
    }

    const preferences = await applyConfigToUser(req.user, config);
    logSocialPageEvent({
      eventType: 'social_page_config_applied',
      userId: req.user._id,
      req,
      metadata: { configId: String(config._id) }
    });

    return res.json({
      success: true,
      activeConfigId: String(config._id),
      preferences: toPublicSocialPagePreferences(preferences, { profileTheme: req.user.profileTheme || 'default' })
    });
  } catch (error) {
    console.error('Error applying social page config:', error);
    return res.status(500).json({ error: 'Failed to apply social page config' });
  }
});

router.post('/configs/:id/duplicate', authenticateToken, async (req, res) => {
  try {
    const config = await SocialPageConfig.findOne({ _id: req.params.id, owner: req.user._id });
    if (!config) {
      return res.status(404).json({ error: 'Config not found' });
    }

    const duplicate = await SocialPageConfig.create({
      owner: req.user._id,
      name: normalizeConfigName(req.body?.name, `${config.name} Copy`),
      design: cloneValue(config.design),
      isShared: false,
      sourceConfigId: config._id,
      sourceOwnerId: req.user._id,
      templateId: config.templateId || null
    });

    if (req.body?.apply) {
      await applyConfigToUser(req.user, duplicate);
    }

    return res.status(201).json({
      success: true,
      config: serializeConfig(duplicate.toObject(), req.user._id),
      activeConfigId: req.user.socialPagePreferences?.activeConfigId ? String(req.user.socialPagePreferences.activeConfigId) : null
    });
  } catch (error) {
    console.error('Error duplicating social page config:', error);
    return res.status(500).json({ error: 'Failed to duplicate social page config' });
  }
});

router.delete('/configs/:id', authenticateToken, async (req, res) => {
  try {
    const config = await SocialPageConfig.findOne({ _id: req.params.id, owner: req.user._id });
    if (!config) {
      return res.status(404).json({ error: 'Config not found' });
    }

    const deletingActive = String(req.user.socialPagePreferences?.activeConfigId || '') === String(config._id);
    await config.deleteOne();

    if (deletingActive) {
      const nextConfig = await SocialPageConfig.findOne({ owner: req.user._id }).sort({ updatedAt: -1 });
      if (nextConfig) {
        await applyConfigToUser(req.user, nextConfig);
      } else {
        req.user.socialPagePreferences = buildDefaultSocialPagePreferences(req.user.profileTheme || 'default');
        await req.user.save();
      }
    }

    return res.json({
      success: true,
      activeConfigId: req.user.socialPagePreferences?.activeConfigId ? String(req.user.socialPagePreferences.activeConfigId) : null
    });
  } catch (error) {
    console.error('Error deleting social page config:', error);
    return res.status(500).json({ error: 'Failed to delete social page config' });
  }
});

router.get('/shared/by-user/:identifier', async (req, res) => {
  try {
    const owner = await findUserByIdentifier(req.params.identifier);
    if (!owner) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viewerId = getViewerIdFromAuthHeader(req);
    const sharedConfigs = await SocialPageConfig.find({ owner: owner._id, isShared: true })
      .populate('owner', 'username realName')
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      success: true,
      owner: {
        _id: String(owner._id),
        username: owner.username,
        realName: owner.realName || ''
      },
      activeConfigId: owner.socialPagePreferences?.activeConfigId ? String(owner.socialPagePreferences.activeConfigId) : null,
      configs: sharedConfigs.map((config) => serializeConfig(config, viewerId))
    });
  } catch (error) {
    console.error('Error loading shared social page configs:', error);
    return res.status(500).json({ error: 'Failed to load shared designs' });
  }
});

router.post('/shared/:id/favorite', authenticateToken, async (req, res) => {
  try {
    const config = await SocialPageConfig.findOne({ _id: req.params.id, isShared: true });
    if (!config) {
      return res.status(404).json({ error: 'Shared design not found' });
    }

    await SocialPageConfig.updateOne({ _id: config._id }, { $addToSet: { favoritedBy: req.user._id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error favoriting shared design:', error);
    return res.status(500).json({ error: 'Failed to favorite shared design' });
  }
});

router.delete('/shared/:id/favorite', authenticateToken, async (req, res) => {
  try {
    const config = await SocialPageConfig.findOne({ _id: req.params.id, isShared: true });
    if (!config) {
      return res.status(404).json({ error: 'Shared design not found' });
    }

    await SocialPageConfig.updateOne({ _id: config._id }, { $pull: { favoritedBy: req.user._id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error unfavoriting shared design:', error);
    return res.status(500).json({ error: 'Failed to unfavorite shared design' });
  }
});

router.post('/shared/:id/clone', authenticateToken, async (req, res) => {
  try {
    const sourceConfig = await SocialPageConfig.findOne({ _id: req.params.id, isShared: true });
    if (!sourceConfig) {
      return res.status(404).json({ error: 'Shared design not found' });
    }

    const design = normalizeSocialPagePreferences(mergeDesignPatch(sourceConfig.design, req.body?.design || {}), {
      profileTheme: req.user.profileTheme || 'default',
      strict: true
    });
    if (design.error || !design.value) {
      return res.status(400).json({ error: design.error || 'Invalid cloned design' });
    }

    const clone = await SocialPageConfig.create({
      owner: req.user._id,
      name: normalizeConfigName(req.body?.name, `${sourceConfig.name} Clone`),
      design: design.value,
      isShared: false,
      sourceConfigId: sourceConfig._id,
      sourceOwnerId: sourceConfig.owner,
      templateId: sourceConfig.templateId || null
    });

    if (req.body?.apply) {
      await applyConfigToUser(req.user, clone);
    }

    logSocialPageEvent({
      eventType: 'social_page_design_cloned',
      userId: req.user._id,
      req,
      metadata: { sourceConfigId: String(sourceConfig._id), cloneConfigId: String(clone._id) }
    });

    return res.status(201).json({
      success: true,
      config: serializeConfig(clone.toObject(), req.user._id),
      activeConfigId: req.user.socialPagePreferences?.activeConfigId ? String(req.user.socialPagePreferences.activeConfigId) : null
    });
  } catch (error) {
    console.error('Error cloning social page design:', error);
    return res.status(500).json({ error: 'Failed to clone social page design' });
  }
});

module.exports = router;
