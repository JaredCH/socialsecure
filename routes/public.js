const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const BlockList = require('../models/BlockList');
const { toPublicSocialPagePreferences } = require('../utils/socialPagePreferences');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MEDIA_URL_MAX_ITEMS = 8;
const MEDIA_URL_MAX_LENGTH = 2048;
const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;
const sanitizeSourceParam = (value) => {
  if (typeof value !== 'string') return 'unknown';
  const trimmed = value.trim().slice(0, 120);
  return trimmed || 'unknown';
};
const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many public requests, please try again shortly.' }
});

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

const publicUserProjection = '_id username realName city state country registrationStatus pgpPublicKey createdAt profileTheme socialPagePreferences';

const toPublicUserProfile = (userDoc) => {
  if (!userDoc) return null;

  return {
    _id: userDoc._id,
    username: userDoc.username,
    realName: userDoc.realName,
    city: userDoc.city || null,
    state: userDoc.state || null,
    country: userDoc.country || null,
    registrationStatus: userDoc.registrationStatus,
    hasPGP: !!userDoc.pgpPublicKey,
    socialPagePreferences: toPublicSocialPagePreferences(userDoc.socialPagePreferences, {
      profileTheme: userDoc.profileTheme || 'default'
    }),
    createdAt: userDoc.createdAt
  };
};

const buildResumeUrl = (username) => `/resume/${encodeURIComponent(String(username || '').trim().toLowerCase())}`;

const toDiscoverableResumeMeta = (userDoc, resumeDoc) => {
  if (!userDoc || !resumeDoc) return null;
  if (resumeDoc.visibility !== 'public') return null;

  return {
    hasPublicResume: true,
    resumeUrl: buildResumeUrl(userDoc.username),
    resumeHeadline: resumeDoc?.basics?.headline || null,
    resumeUpdatedAt: resumeDoc.updatedAt || null
  };
};

const toPublicResumePayload = (resumeDoc) => ({
  visibility: resumeDoc.visibility,
  basics: {
    headline: resumeDoc?.basics?.headline || '',
    summary: resumeDoc?.basics?.summary || ''
  },
  sections: Array.isArray(resumeDoc.sections) ? resumeDoc.sections : [],
  updatedAt: resumeDoc.updatedAt || null,
  createdAt: resumeDoc.createdAt || null
});

const logResumeEvent = ({ eventType, userId, req, metadata = {} }) => {
  const payload = {
    eventType,
    userId,
    metadata,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null,
    createdAt: new Date().toISOString()
  };
  console.log('[resume-event]', JSON.stringify(payload));
};

const getViewerIdFromAuthHeader = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    return decoded.userId ? String(decoded.userId) : null;
  } catch {
    return null;
  }
};

const hasBlockRelationship = async (viewerId, targetId) => {
  if (!viewerId || !targetId) return false;
  const record = await BlockList.findOne({
    $or: [
      { userId: viewerId, blockedUserId: targetId },
      { userId: targetId, blockedUserId: viewerId }
    ]
  }).select('_id').lean();
  return !!record;
};

const findUserByIdOrUsername = async (identifier) => {
  const normalizedIdentifier = String(identifier || '').trim().toLowerCase();

  if (!normalizedIdentifier) return null;

  const lookupQuery = [{ username: normalizedIdentifier }];
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    lookupQuery.push({ _id: identifier });
  }

  return User.findOne({ $or: lookupQuery }).select(publicUserProjection).lean();
};

const publicPostQuery = (userId) => ({
  targetFeedId: userId,
  visibility: 'public',
  $and: [
    socialOrUnsetAudienceQuery('relationshipAudience'),
    {
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    }
  ]
});

const publicPostPopulate = [
  { path: 'authorId', select: 'username realName' },
  { path: 'targetFeedId', select: 'username realName' }
];

const normalizeMediaUrls = (mediaUrlsInput) => {
  if (!Array.isArray(mediaUrlsInput)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const rawUrl of mediaUrlsInput) {
    if (typeof rawUrl !== 'string') continue;

    const trimmed = rawUrl.trim();
    if (!trimmed) continue;
    if (trimmed.length > MEDIA_URL_MAX_LENGTH) continue;
    if (!HTTP_URL_REGEX.test(trimmed)) continue;

    const dedupeKey = trimmed.toLowerCase();
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    normalized.push(trimmed);

    if (normalized.length >= MEDIA_URL_MAX_ITEMS) {
      break;
    }
  }

  return normalized;
};

const toPublicPost = (post) => ({
  _id: post._id,
  authorId: post.authorId,
  targetFeedId: post.targetFeedId,
  content: post.content || null,
  mediaUrls: normalizeMediaUrls(post.mediaUrls),
  visibility: post.visibility,
  relationshipAudience: normalizeRelationshipAudience(post.relationshipAudience),
  visibleToCircles: Array.isArray(post.visibleToCircles) ? post.visibleToCircles : [],
  locationRadius: Number.isFinite(Number(post.locationRadius)) ? Number(post.locationRadius) : null,
  expiresAt: post.expiresAt || null,
  likesCount: Array.isArray(post.likes) ? post.likes.length : 0,
  commentsCount: Array.isArray(post.comments) ? post.comments.length : 0,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt
});

// GET /api/public/users/:username
router.get('/users/:username', publicReadLimiter, async (req, res) => {
  try {
    const user = await findUserByIdOrUsername(req.params.username);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viewerId = getViewerIdFromAuthHeader(req);
    const blocked = await hasBlockRelationship(viewerId, user._id);
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resume = await Resume.findOne({ userId: user._id })
      .select('visibility basics.headline updatedAt')
      .lean();
    const resumeMeta = toDiscoverableResumeMeta(user, resume);

    return res.json({
      success: true,
      user: {
        ...toPublicUserProfile(user),
        ...(resumeMeta || { hasPublicResume: false })
      }
    });
  } catch (error) {
    console.error('Error fetching public user profile:', error);
    return res.status(500).json({ error: 'Failed to fetch public profile' });
  }
});

// GET /api/public/users/:username/resume
router.get('/users/:username/resume', publicReadLimiter, async (req, res) => {
  try {
    const user = await findUserByIdOrUsername(req.params.username);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viewerId = getViewerIdFromAuthHeader(req);
    const blocked = await hasBlockRelationship(viewerId, user._id);
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resume = await Resume.findOne({ userId: user._id })
      .select('visibility basics sections createdAt updatedAt')
      .lean();
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const isOwner = Boolean(viewerId && String(viewerId) === String(user._id));
    const visibility = resume.visibility || 'private';
    const canView = isOwner || visibility === 'public' || visibility === 'unlisted';

    if (!canView) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    logResumeEvent({
      eventType: 'resume_public_viewed',
      userId: String(user._id),
      req,
      metadata: {
        viewerId: viewerId || null,
        visibility,
        isOwner
      }
    });

    return res.json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        realName: user.realName,
        city: user.city || null,
        state: user.state || null,
        country: user.country || null
      },
      canManage: isOwner,
      resumeUrl: buildResumeUrl(user.username),
      resume: toPublicResumePayload(resume)
    });
  } catch (error) {
    console.error('Error fetching public resume:', error);
    return res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

// POST /api/public/users/:username/resume/link-click
router.post('/users/:username/resume/link-click', publicReadLimiter, async (req, res) => {
  try {
    const user = await findUserByIdOrUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viewerId = getViewerIdFromAuthHeader(req);
    const blocked = await hasBlockRelationship(viewerId, user._id);
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resume = await Resume.findOne({ userId: user._id })
      .select('visibility')
      .lean();
    if (!resume || resume.visibility !== 'public') {
      return res.status(404).json({ error: 'Resume not found' });
    }

    logResumeEvent({
      eventType: 'resume_profile_link_clicked',
      userId: String(user._id),
      req,
      metadata: {
        source: sanitizeSourceParam(req.body?.source),
        resumeUrl: buildResumeUrl(user.username)
      }
    });

    return res.status(202).json({ success: true });
  } catch (error) {
    console.error('Error logging resume profile link click:', error);
    return res.status(500).json({ error: 'Failed to record event' });
  }
});

// GET /api/public/users/:userId/feed?page=&limit=
router.get('/users/:userId/feed', publicReadLimiter, async (req, res) => {
  try {
    const user = await findUserByIdOrUsername(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viewerId = getViewerIdFromAuthHeader(req);
    const blocked = await hasBlockRelationship(viewerId, user._id);
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resume = await Resume.findOne({ userId: user._id })
      .select('visibility basics.headline updatedAt')
      .lean();
    const resumeMeta = toDiscoverableResumeMeta(user, resume);

    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }
    const { page, limit, skip } = pagination;
    const query = publicPostQuery(user._id);

    const [posts, total] = await Promise.all([
      Post.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id authorId targetFeedId content visibility relationshipAudience visibleToCircles locationRadius expiresAt mediaUrls likes comments createdAt updatedAt')
        .populate(publicPostPopulate)
        .lean(),
      Post.countDocuments(query)
    ]);

    return res.json({
      success: true,
      user: {
        ...toPublicUserProfile(user),
        ...(resumeMeta || { hasPublicResume: false })
      },
      posts: posts.map(toPublicPost),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching public user feed:', error);
    return res.status(500).json({ error: 'Failed to fetch public feed' });
  }
});

// GET /api/public/users/:userId/gallery?page=&limit=
router.get('/users/:userId/gallery', async (req, res) => {
  try {
    const user = await findUserByIdOrUsername(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }
    const { page, limit, skip } = pagination;
    const viewerId = getViewerIdFromAuthHeader(req);
    const blocked = await hasBlockRelationship(viewerId, user._id);
    if (blocked) {
      return res.status(404).json({ error: 'User not found' });
    }
    const query = {
      ...publicPostQuery(user._id),
      mediaUrls: { $exists: true, $ne: [] }
    };

    const resumePromise = Resume.findOne({ userId: user._id })
      .select('visibility basics.headline updatedAt')
      .lean();

    const [posts, total, resume] = await Promise.all([
      Post.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id authorId targetFeedId content visibility relationshipAudience mediaUrls createdAt updatedAt')
        .populate(publicPostPopulate)
        .lean(),
      Post.countDocuments(query),
      resumePromise
    ]);
    const resumeMeta = toDiscoverableResumeMeta(user, resume);

    const items = posts.map((post) => {
      const normalizedMediaUrls = normalizeMediaUrls(post.mediaUrls);

      return {
        postId: post._id,
        author: post.authorId,
        targetFeed: post.targetFeedId,
        mediaUrls: normalizedMediaUrls,
        normalizedMediaUrls,
        mediaItems: normalizedMediaUrls.map((url, index) => ({
          id: `${String(post._id)}:${index}`,
          url,
          index,
          sourcePostId: post._id
        })),
        sourcePost: {
            _id: post._id,
            content: post.content || null,
            visibility: post.visibility,
            relationshipAudience: normalizeRelationshipAudience(post.relationshipAudience),
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
          author: post.authorId,
          targetFeed: post.targetFeedId
        },
        content: post.content || null,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt
      };
    });

    return res.json({
      success: true,
      user: {
        ...toPublicUserProfile(user),
        ...(resumeMeta || { hasPublicResume: false })
      },
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching public user gallery:', error);
    return res.status(500).json({ error: 'Failed to fetch public gallery' });
  }
});

module.exports = router;
