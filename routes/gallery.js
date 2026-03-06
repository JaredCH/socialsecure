const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const GalleryImage = require('../models/GalleryImage');

const router = express.Router();

const MAX_GALLERY_ITEMS = 24;
const URL_MAX_LENGTH = 2048;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp'
]);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);
const BLOCKED_HOSTNAMES = new Set(['localhost']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_MAX_BYTES,
    files: 1
  }
});

const galleryUploadRoot = path.join(__dirname, '..', 'uploads', 'gallery');

const isHttpUrl = (value) => {
  if (typeof value !== 'string') return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const parsePagination = (query) => {
  const page = Number.parseInt(query.page, 10);
  const limit = Number.parseInt(query.limit, 10);

  if (query.page !== undefined && (!Number.isInteger(page) || page <= 0)) {
    return { error: 'Query parameter "page" must be a positive integer' };
  }

  if (query.limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    return { error: 'Query parameter "limit" must be a positive integer' };
  }

  const normalizedPage = Number.isInteger(page) && page > 0 ? page : DEFAULT_PAGE;
  const normalizedLimit = Number.isInteger(limit) && limit > 0
    ? Math.min(limit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    skip: (normalizedPage - 1) * normalizedLimit
  };
};

const normalizeCaption = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 280);
};

const extractExtensionFromUrl = (urlString) => {
  try {
    const parsed = new URL(urlString);
    const ext = path.extname(parsed.pathname || '').toLowerCase();
    return ext;
  } catch {
    return '';
  }
};

const isPrivateOrLocalIp = (hostname) => {
  if (!hostname) return false;
  const normalized = String(hostname).toLowerCase();
  if (normalized === '::1') return true;
  if (/^127\./.test(normalized)) return true;
  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
  return false;
};

const getRequestedMediaUrl = (body = {}) => {
  if (!body || typeof body !== 'object') return '';
  return body.mediaUrl ?? body.imageUrl ?? body.url ?? '';
};

const validateImageUrl = (urlString) => {
  const normalized = String(urlString || '').trim();

  if (!normalized) {
    return { ok: false, error: 'Image URL is required' };
  }

  if (normalized.length > URL_MAX_LENGTH) {
    return { ok: false, error: `Image URL exceeds max length of ${URL_MAX_LENGTH}` };
  }

  if (!isHttpUrl(normalized)) {
    return { ok: false, error: 'Image URL must be a valid http/https URL' };
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password) {
      return { ok: false, error: 'Image URL cannot include embedded credentials' };
    }

    const hostname = String(parsed.hostname || '').toLowerCase();
    if (BLOCKED_HOSTNAMES.has(hostname) || isPrivateOrLocalIp(hostname)) {
      return { ok: false, error: 'Image URL host is blocked' };
    }

    parsed.hash = '';
    return { ok: true, mediaUrl: parsed.toString() };
  } catch {
    return { ok: false, error: 'Image URL must be a valid http/https URL' };
  }
};

const findOwnerByIdentifier = async (identifier) => {
  const rawIdentifier = String(identifier || '').trim();
  const normalizedUsername = rawIdentifier.toLowerCase();

  const query = [{ username: normalizedUsername }];
  if (mongoose.Types.ObjectId.isValid(rawIdentifier)) {
    query.push({ _id: rawIdentifier });
  }

  return User.findOne({ $or: query }).select('_id username').lean();
};

const toGalleryItem = (image, viewerId) => {
  const { likesCount, dislikesCount } = image.getReactionCounts();

  return {
    _id: image._id,
    ownerId: image.ownerId,
    mediaUrl: image.mediaUrl,
    mediaType: image.mediaType,
    caption: image.caption || '',
    likesCount,
    dislikesCount,
    viewerReaction: image.getViewerReaction(viewerId),
    createdAt: image.createdAt,
    updatedAt: image.updatedAt
  };
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (error, user) => {
    if (error) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    return next();
  });
};

const optionalAuthenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (error, user) => {
    req.user = error ? null : user;
    return next();
  });
};

const ensureOwnerAccess = (ownerId, requesterUserId) => String(ownerId) === String(requesterUserId || '');

router.get('/:ownerId', optionalAuthenticateToken, async (req, res) => {
  try {
    const owner = await findOwnerByIdentifier(req.params.ownerId);
    if (!owner) {
      return res.status(404).json({ error: 'Gallery owner not found' });
    }

    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }

    const { page, limit, skip } = pagination;

    const [images, total] = await Promise.all([
      GalleryImage.find({ ownerId: owner._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      GalleryImage.countDocuments({ ownerId: owner._id })
    ]);

    const viewerId = req.user?.userId ? String(req.user.userId) : null;

    return res.json({
      success: true,
      owner,
      items: images.map((image) => toGalleryItem(image, viewerId)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching gallery:', error);
    return res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});

router.post(
  '/:ownerId',
  authenticateToken,
  upload.single('image'),
  [body('caption').optional().isString().isLength({ max: 280 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const owner = await findOwnerByIdentifier(req.params.ownerId);
      if (!owner) {
        return res.status(404).json({ error: 'Gallery owner not found' });
      }

      const requesterId = String(req.user.userId || '');
      if (!ensureOwnerAccess(owner._id, requesterId)) {
        return res.status(403).json({ error: 'Only the owner can add gallery images' });
      }

      const existingCount = await GalleryImage.countDocuments({ ownerId: owner._id });
      if (existingCount >= MAX_GALLERY_ITEMS) {
        return res.status(400).json({ error: `Gallery can contain up to ${MAX_GALLERY_ITEMS} images` });
      }

      const caption = normalizeCaption(req.body.caption);
      let mediaUrl = null;
      let mediaType = 'url';
      let storageFileName = null;

      if (req.file) {
        const mimeType = String(req.file.mimetype || '').toLowerCase();
        const ext = path.extname(String(req.file.originalname || '')).toLowerCase();

        if (!ALLOWED_MIME_TYPES.has(mimeType)) {
          return res.status(400).json({ error: 'Unsupported image MIME type' });
        }

        if (!ALLOWED_EXTENSIONS.has(ext)) {
          return res.status(400).json({ error: 'Unsupported image file extension' });
        }

        const ownerDir = path.join(galleryUploadRoot, String(owner._id));
        await fs.mkdir(ownerDir, { recursive: true });

        const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
        const absolutePath = path.join(ownerDir, fileName);

        await fs.writeFile(absolutePath, req.file.buffer);

        mediaUrl = `/uploads/gallery/${String(owner._id)}/${fileName}`;
        mediaType = 'upload';
        storageFileName = fileName;
      } else {
        const validation = validateImageUrl(getRequestedMediaUrl(req.body));
        if (!validation.ok) {
          return res.status(400).json({ error: validation.error });
        }
        mediaUrl = validation.mediaUrl;
      }

      const created = await GalleryImage.create({
        ownerId: owner._id,
        mediaUrl,
        mediaType,
        storageFileName,
        caption
      });

      return res.status(201).json({
        success: true,
        item: toGalleryItem(created, requesterId)
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'This image already exists in the owner gallery' });
      }

      console.error('Error creating gallery image:', error);
      return res.status(500).json({ error: 'Failed to create gallery image' });
    }
  }
);

router.patch(
  '/:ownerId/:imageId',
  authenticateToken,
  [
    body('caption').optional().isString().isLength({ max: 280 }),
    body('mediaUrl').optional().isString().isLength({ max: URL_MAX_LENGTH })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const owner = await findOwnerByIdentifier(req.params.ownerId);
      if (!owner) {
        return res.status(404).json({ error: 'Gallery owner not found' });
      }

      const requesterId = String(req.user.userId || '');
      if (!ensureOwnerAccess(owner._id, requesterId)) {
        return res.status(403).json({ error: 'Only the owner can edit gallery images' });
      }

      const image = await GalleryImage.findOne({ _id: req.params.imageId, ownerId: owner._id });
      if (!image) {
        return res.status(404).json({ error: 'Gallery image not found' });
      }

      if (req.body.caption !== undefined) {
        image.caption = normalizeCaption(req.body.caption);
      }

      if (req.body.mediaUrl !== undefined) {
        if (image.mediaType === 'upload') {
          return res.status(400).json({ error: 'Uploaded file URL cannot be edited directly' });
        }

        const validation = validateImageUrl(req.body.mediaUrl);
        if (!validation.ok) {
          return res.status(400).json({ error: validation.error });
        }
        image.mediaUrl = validation.mediaUrl;
      }

      await image.save();

      return res.json({
        success: true,
        item: toGalleryItem(image, requesterId)
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'This image already exists in the owner gallery' });
      }

      console.error('Error editing gallery image:', error);
      return res.status(500).json({ error: 'Failed to edit gallery image' });
    }
  }
);

router.delete('/:ownerId/:imageId', authenticateToken, async (req, res) => {
  try {
    const owner = await findOwnerByIdentifier(req.params.ownerId);
    if (!owner) {
      return res.status(404).json({ error: 'Gallery owner not found' });
    }

    const requesterId = String(req.user.userId || '');
    if (!ensureOwnerAccess(owner._id, requesterId)) {
      return res.status(403).json({ error: 'Only the owner can delete gallery images' });
    }

    const image = await GalleryImage.findOne({ _id: req.params.imageId, ownerId: owner._id });
    if (!image) {
      return res.status(404).json({ error: 'Gallery image not found' });
    }

    if (image.mediaType === 'upload' && image.storageFileName) {
      const uploadPath = path.join(
        galleryUploadRoot,
        String(owner._id),
        String(image.storageFileName)
      );

      await fs.unlink(uploadPath).catch((unlinkError) => {
        if (unlinkError?.code !== 'ENOENT') {
          throw unlinkError;
        }
      });
    }

    await image.deleteOne();

    return res.json({
      success: true,
      message: 'Gallery image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting gallery image:', error);
    return res.status(500).json({ error: 'Failed to delete gallery image' });
  }
});

router.post(
  '/:ownerId/:imageId/reaction',
  authenticateToken,
  [body('type').isIn(['like', 'dislike']).withMessage('Reaction type must be like or dislike')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const owner = await findOwnerByIdentifier(req.params.ownerId);
      if (!owner) {
        return res.status(404).json({ error: 'Gallery owner not found' });
      }

      const image = await GalleryImage.findOne({ _id: req.params.imageId, ownerId: owner._id });
      if (!image) {
        return res.status(404).json({ error: 'Gallery image not found' });
      }

      const userId = String(req.user.userId || '');
      const reactionType = req.body.type;
      const reactionState = image.applyReaction(userId, reactionType);

      await image.save();

      return res.json({
        success: true,
        reaction: reactionState.viewerReaction,
        likesCount: reactionState.likesCount,
        dislikesCount: reactionState.dislikesCount
      });
    } catch (error) {
      console.error('Error reacting to gallery image:', error);
      return res.status(500).json({ error: 'Failed to update gallery reaction' });
    }
  }
);

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: `Image file is too large (max ${UPLOAD_MAX_BYTES} bytes)` });
  }
  return next(error);
});

module.exports = router;
