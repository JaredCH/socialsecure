const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const GalleryImage = require('../models/GalleryImage');
const Friendship = require('../models/Friendship');
const {
  RELATIONSHIP_AUDIENCE_VALUES,
  normalizeRelationshipAudience,
  ownerCategorizedViewerAsSecure,
  logRelationshipAudienceEvent
} = require('../utils/relationshipAudience');

const router = express.Router();

const MAX_GALLERY_ITEMS = 50;
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
const galleryCommentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many gallery comments, please try again later.' }
});

const galleryUploadRoot = path.join(__dirname, '..', 'uploads', 'gallery');
const SERVER_UPLOAD_PATH_REGEX = /^\/uploads\/\S+/i;
const SAFE_HOST_HEADER_REGEX = /^[a-z0-9.-]+(?::\d{1,5})?$/i;

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

const normalizeTitle = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 140);
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

  const ext = extractExtensionFromUrl(normalized);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: `Image URL must end with an allowed image extension (${Array.from(ALLOWED_EXTENSIONS).join(', ')})`
    };
  }

  return { ok: true, mediaUrl: normalized };
};

const findOwnerByIdentifier = async (identifier) => {
  const rawIdentifier = String(identifier || '').trim();
  const normalizedUsername = rawIdentifier.toLowerCase();

  const query = [{ username: normalizedUsername }];
  if (mongoose.Types.ObjectId.isValid(rawIdentifier)) {
    query.push({ _id: rawIdentifier });
  }

  return User.findOne({ $or: query }).select('_id username friendListPrivacy topFriendsPrivacy').lean();
};

const isPrivateProfile = (ownerDoc) => (
  ownerDoc?.friendListPrivacy === 'private'
  && ownerDoc?.topFriendsPrivacy === 'private'
);

const toGalleryItem = (image, viewerId) => {
  const { likesCount, dislikesCount } = image.getReactionCounts();
  const comments = Array.isArray(image.comments)
    ? image.comments.map((comment) => ({
      _id: comment?._id || null,
      userId: typeof comment?.userId === 'string'
        ? comment.userId
        : String(comment?.userId?._id || comment?.userId || ''),
      username: typeof comment?.userId === 'object' && comment?.userId?.username
        ? comment.userId.username
        : null,
      content: comment?.content || '',
      createdAt: comment?.createdAt || null
    }))
    : [];

  return {
    _id: image._id,
    ownerId: image.ownerId,
    mediaUrl: image.mediaUrl,
    mediaType: image.mediaType,
    title: image.title || '',
    caption: image.caption || '',
    likesCount,
    dislikesCount,
    viewerReaction: image.getViewerReaction(viewerId),
    comments,
    commentsCount: comments.length,
    relationshipAudience: normalizeRelationshipAudience(image.relationshipAudience),
    createdAt: image.createdAt,
    updatedAt: image.updatedAt
  };
};

const resolveRequestOrigin = (req) => {
  const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim().toLowerCase();
  if (!host || !SAFE_HOST_HEADER_REGEX.test(host)) return '';
  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const requestProtocol = String(req.protocol || '').toLowerCase();
  const protocol = forwardedProto === 'http' || forwardedProto === 'https'
    ? forwardedProto
    : (requestProtocol === 'http' || requestProtocol === 'https' ? requestProtocol : 'https');
  return `${protocol}://${host}`;
};

const resolveStoredMediaUrl = (url, req) => {
  const normalized = typeof url === 'string' ? url.trim() : '';
  if (!normalized) return '';
  let uploadPath = '';
  if (SERVER_UPLOAD_PATH_REGEX.test(normalized)) {
    uploadPath = normalized;
  } else {
    try {
      const parsed = new URL(normalized);
      if (SERVER_UPLOAD_PATH_REGEX.test(parsed.pathname || '')) {
        uploadPath = parsed.pathname;
      }
    } catch {
      return normalized;
    }
  }
  if (!uploadPath) return normalized;
  const origin = resolveRequestOrigin(req);
  return origin ? `${origin}${uploadPath}` : uploadPath;
};

const getGalleryViewerContext = async (ownerId, viewerId) => {
  const normalizedOwnerId = String(ownerId || '');
  const normalizedViewerId = String(viewerId || '');
  if (!normalizedViewerId) {
    return { isOwner: false, isFriend: false, isSecureFriend: false };
  }
  if (normalizedOwnerId && normalizedOwnerId === normalizedViewerId) {
    return { isOwner: true, isFriend: true, isSecureFriend: true };
  }

  const friendship = await Friendship.findOne({
    status: 'accepted',
    $or: [
      { requester: normalizedViewerId, recipient: normalizedOwnerId },
      { requester: normalizedOwnerId, recipient: normalizedViewerId }
    ]
  }).select(
    'status requester recipient requesterRelationshipAudience recipientRelationshipAudience requesterAudience recipientAudience requesterCategory recipientCategory'
  ).lean();

  const isFriend = Boolean(friendship);
  return {
    isOwner: false,
    isFriend,
    isSecureFriend: friendship
      ? ownerCategorizedViewerAsSecure(friendship, normalizedOwnerId, normalizedViewerId)
      : false
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
const normalizeCommentContent = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 1000);
};

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

    const viewerId = req.user?.userId ? String(req.user.userId) : null;
    const viewerContext = await getGalleryViewerContext(owner._id, viewerId);
    if (isPrivateProfile(owner) && !viewerContext.isOwner) {
      return res.json({
        success: true,
        owner: {
          _id: owner._id,
          username: owner.username,
          isPrivateProfile: true
        },
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0
        }
      });
    }

    const query = {
      ownerId: owner._id
    };
    if (!viewerContext.isOwner && !viewerContext.isSecureFriend) {
      if (viewerContext.isFriend) {
        query.$or = [
          { relationshipAudience: 'public' },
          { relationshipAudience: 'social' },
          { relationshipAudience: { $exists: false } },
          { relationshipAudience: null }
        ];
      } else {
        query.relationshipAudience = 'public';
      }
    }

    const [images, total] = await Promise.all([
      GalleryImage.find(query)
        .populate('comments.userId', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      GalleryImage.countDocuments(query)
    ]);
    const secureVisibleCount = images.filter(
      (image) => normalizeRelationshipAudience(image.relationshipAudience) === 'secure'
    ).length;
    if (secureVisibleCount > 0 && viewerId) {
      logRelationshipAudienceEvent({
        eventType: 'secure_content_viewed',
        viewerId,
        ownerId: owner._id,
        req,
        metadata: {
          route: 'gallery_list',
          secureVisibleCount
        }
      });
    }

    return res.json({
      success: true,
      owner,
      items: images.map((image) => ({
        ...toGalleryItem(image, viewerId),
        mediaUrl: resolveStoredMediaUrl(image.mediaUrl, req)
      })),
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
  [
    body('caption').optional().isString().isLength({ max: 280 }),
    body('title').optional().isString().isLength({ max: 140 }),
    body('relationshipAudience').optional().isIn(RELATIONSHIP_AUDIENCE_VALUES).withMessage('Invalid relationship audience')
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
        return res.status(403).json({ error: 'Only the owner can add gallery images' });
      }

      const existingCount = await GalleryImage.countDocuments({ ownerId: owner._id });
      if (existingCount >= MAX_GALLERY_ITEMS) {
        return res.status(400).json({ error: `Gallery can contain up to ${MAX_GALLERY_ITEMS} images` });
      }

      const caption = normalizeCaption(req.body.caption);
      const title = normalizeTitle(req.body.title);
      const relationshipAudience = normalizeRelationshipAudience(req.body.relationshipAudience);
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
        title,
        caption,
        relationshipAudience
      });

      logRelationshipAudienceEvent({
        eventType: 'content_audience_selected',
        viewerId: requesterId,
        ownerId: owner._id,
        req,
        metadata: {
          contentType: 'gallery_image',
          contentId: String(created._id),
          relationshipAudience
        }
      });

      return res.status(201).json({
        success: true,
        item: {
          ...toGalleryItem(created, requesterId),
          mediaUrl: resolveStoredMediaUrl(created.mediaUrl, req)
        }
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
    body('title').optional().isString().isLength({ max: 140 }),
    body('mediaUrl').optional().isString().isLength({ max: URL_MAX_LENGTH }),
    body('relationshipAudience').optional().isIn(RELATIONSHIP_AUDIENCE_VALUES).withMessage('Invalid relationship audience')
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

      if (req.body.title !== undefined) {
        image.title = normalizeTitle(req.body.title);
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

      if (req.body.relationshipAudience !== undefined) {
        image.relationshipAudience = normalizeRelationshipAudience(req.body.relationshipAudience);
        logRelationshipAudienceEvent({
          eventType: 'content_audience_selected',
          viewerId: requesterId,
          ownerId: owner._id,
          req,
          metadata: {
            contentType: 'gallery_image',
            contentId: String(image._id),
            relationshipAudience: image.relationshipAudience
          }
        });
      }

      await image.save();

      return res.json({
        success: true,
        item: {
          ...toGalleryItem(image, requesterId),
          mediaUrl: resolveStoredMediaUrl(image.mediaUrl, req)
        }
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
  '/:ownerId/:imageId/comment',
  galleryCommentLimiter,
  authenticateToken,
  [body('content').isString().isLength({ min: 1, max: 1000 }).withMessage('Comment content is required')],
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
      const viewerContext = await getGalleryViewerContext(owner._id, userId);
      if (!image.canView(userId, viewerContext)) {
        return res.status(404).json({ error: 'Gallery image not found' });
      }

      const content = normalizeCommentContent(req.body.content);
      if (!content) {
        return res.status(400).json({ error: 'Comment content is required' });
      }

      image.comments.push({ userId, content, createdAt: new Date() });
      await image.save();

      const savedComment = image.comments[image.comments.length - 1];
      const commenter = await User.findById(userId).select('username').lean();

      return res.status(201).json({
        success: true,
        comment: {
          _id: savedComment?._id || null,
          userId,
          username: commenter?.username || null,
          content: savedComment?.content || content,
          createdAt: savedComment.createdAt
        },
        commentsCount: image.comments.length
      });
    } catch (error) {
      console.error('Error adding gallery comment:', error);
      return res.status(500).json({ error: 'Failed to add gallery comment' });
    }
  }
);

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
      const viewerContext = await getGalleryViewerContext(owner._id, userId);
      if (!image.canView(userId, viewerContext)) {
        if (normalizeRelationshipAudience(image.relationshipAudience) === 'secure') {
          logRelationshipAudienceEvent({
            eventType: 'secure_content_access_denied',
            viewerId: userId,
            ownerId: owner._id,
            req,
            metadata: {
              route: 'gallery_reaction',
              imageId: String(image._id)
            }
          });
        }
        return res.status(404).json({ error: 'Gallery image not found' });
      }

      if (normalizeRelationshipAudience(image.relationshipAudience) === 'secure') {
        logRelationshipAudienceEvent({
          eventType: 'secure_content_viewed',
          viewerId: userId,
          ownerId: owner._id,
          req,
          metadata: {
            route: 'gallery_reaction',
            imageId: String(image._id)
          }
        });
      }

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
