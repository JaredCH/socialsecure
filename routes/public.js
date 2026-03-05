const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const BlockList = require('../models/BlockList');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MEDIA_URL_MAX_ITEMS = 8;
const MEDIA_URL_MAX_LENGTH = 2048;
const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;

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

const publicUserProjection = '_id username realName city state country registrationStatus pgpPublicKey createdAt';

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
    createdAt: userDoc.createdAt
  };
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
  $or: [
    { expiresAt: null },
    { expiresAt: { $gt: new Date() } }
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
  visibleToCircles: Array.isArray(post.visibleToCircles) ? post.visibleToCircles : [],
  locationRadius: Number.isFinite(Number(post.locationRadius)) ? Number(post.locationRadius) : null,
  expiresAt: post.expiresAt || null,
  likesCount: Array.isArray(post.likes) ? post.likes.length : 0,
  commentsCount: Array.isArray(post.comments) ? post.comments.length : 0,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt
});

// GET /api/public/users/:username
router.get('/users/:username', async (req, res) => {
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

    return res.json({
      success: true,
      user: toPublicUserProfile(user)
    });
  } catch (error) {
    console.error('Error fetching public user profile:', error);
    return res.status(500).json({ error: 'Failed to fetch public profile' });
  }
});

// GET /api/public/users/:userId/feed?page=&limit=
router.get('/users/:userId/feed', async (req, res) => {
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
        .select('_id authorId targetFeedId content visibility visibleToCircles locationRadius expiresAt mediaUrls likes comments createdAt updatedAt')
        .populate(publicPostPopulate)
        .lean(),
      Post.countDocuments(query)
    ]);

    return res.json({
      success: true,
      user: toPublicUserProfile(user),
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
    const query = {
      ...publicPostQuery(user._id),
      mediaUrls: { $exists: true, $ne: [] }
    };

    const [posts, total] = await Promise.all([
      Post.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id authorId targetFeedId content visibility mediaUrls createdAt updatedAt')
        .populate(publicPostPopulate)
        .lean(),
      Post.countDocuments(query)
    ]);

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
      user: toPublicUserProfile(user),
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
