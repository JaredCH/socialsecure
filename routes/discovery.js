const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Post = require('../models/Post');
const Friendship = require('../models/Friendship');
const BlockList = require('../models/BlockList');
const SiteContentFilter = require('../models/SiteContentFilter');
const {
  normalizeRelationshipAudience,
  getViewerRelationshipContext,
  logRelationshipAudienceEvent
} = require('../utils/relationshipAudience');
const { censorMaturityText, normalizeFilterWords } = require('../utils/contentFilter');

const router = express.Router();

const CACHE_TTL_MS = 30 * 1000;
const DISCOVERY_MAX_LIMIT = 25;
const discoveryCache = new Map();

const parsePagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(DISCOVERY_MAX_LIMIT, Math.max(1, Number.parseInt(query.limit, 10) || 10));
  return { page, limit };
};

const parseViewerCoordinates = (query) => {
  const latitude = Number.parseFloat(query.latitude);
  const longitude = Number.parseFloat(query.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return [longitude, latitude];
};

const getCache = (cacheKey) => {
  const entry = discoveryCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    discoveryCache.delete(cacheKey);
    return null;
  }
  return entry.value;
};

const setCache = (cacheKey, value) => {
  discoveryCache.set(cacheKey, {
    createdAt: Date.now(),
    value
  });
};

const getContentFilterConfig = async () => {
  const config = await SiteContentFilter.findOne({ key: 'global' }).lean();
  return {
    maturityCensoredWords: normalizeFilterWords(config?.maturityCensoredWords || [])
  };
};

const getViewerContentFilterPreference = async (viewerId) => {
  if (!viewerId) return true;
  const viewerQuery = User.findById(viewerId).select('enableMaturityWordCensor');
  const viewer = typeof viewerQuery?.lean === 'function'
    ? await viewerQuery.lean()
    : await viewerQuery;
  return viewer?.enableMaturityWordCensor !== false;
};

const getBlockedOrMutedIds = async (viewerId) => {
  const [blocks, blockedByOthers] = await Promise.all([
    BlockList.find({ userId: viewerId }).select('blockedUserId').lean(),
    BlockList.find({ blockedUserId: viewerId }).select('userId').lean()
  ]);

  const blockedOrMuted = new Set();
  for (const row of blocks) blockedOrMuted.add(String(row.blockedUserId));
  for (const row of blockedByOthers) blockedOrMuted.add(String(row.userId));
  return blockedOrMuted;
};

const scoreTextMatch = (needle, username = '', realName = '') => {
  const q = String(needle || '').trim().toLowerCase();
  if (!q) return 0.2;

  const normalizedUsername = String(username || '').toLowerCase();
  const normalizedRealName = String(realName || '').toLowerCase();

  if (normalizedUsername === q) return 1;
  if (normalizedUsername.startsWith(q)) return 0.85;
  if (normalizedRealName.startsWith(q)) return 0.75;
  if (normalizedUsername.includes(q) || normalizedRealName.includes(q)) return 0.55;
  return 0;
};

const scoreLocationAffinity = (viewer, candidate) => {
  if (!viewer || !candidate) return 0;
  let score = 0;
  if (viewer.country && candidate.country && viewer.country === candidate.country) score += 0.3;
  if (viewer.state && candidate.state && viewer.state === candidate.state) score += 0.35;
  if (viewer.city && candidate.city && viewer.city === candidate.city) score += 0.35;
  return Math.min(1, score);
};

const recencyScore = (dateValue, maxDays = 90) => {
  const timestamp = new Date(dateValue || 0).getTime();
  if (!timestamp) return 0;
  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - (ageDays / maxDays));
};

const logDiscoveryEvent = ({ userId, eventType, metadata = {}, req }) => {
  const payload = {
    eventType,
    userId,
    metadata,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null,
    createdAt: new Date().toISOString()
  };
  console.log('[discovery-event]', JSON.stringify(payload));
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
      const user = await User.findById(decoded.userId).select('onboardingStatus city state country');
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      if (user.onboardingStatus !== 'completed') {
        return res.status(403).json({ error: 'Complete onboarding before using discovery', code: 'ONBOARDING_REQUIRED' });
      }

      req.user = { userId: String(user._id) };
      req.viewerProfile = {
        city: user.city || '',
        state: user.state || '',
        country: user.country || ''
      };
      next();
    } catch (lookupError) {
      res.status(500).json({ error: 'Authentication failed' });
    }
  });
};

const discoveryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many discovery requests, please try again shortly.' }
});

router.get('/users', authenticateToken, discoveryLimiter, async (req, res) => {
  try {
    const viewerId = String(req.user.userId);
    const query = String(req.query.q || '').trim();
    const { page, limit } = parsePagination(req.query);
    const cacheKey = `users:${viewerId}:${query}:${page}:${limit}`;

    const cached = getCache(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const [relationshipContext, blockedOrMuted, contentFilter, censorEnabled] = await Promise.all([
      getViewerRelationshipContext(viewerId),
      getBlockedOrMutedIds(viewerId),
      getContentFilterConfig(),
      getViewerContentFilterPreference(viewerId)
    ]);

    const searchFilter = {
      registrationStatus: 'active',
      _id: { $ne: viewerId }
    };
    if (query.length >= 2) {
      const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      searchFilter.$or = [{ username: searchRegex }, { realName: searchRegex }];
    }

    const candidates = await User.find(searchFilter)
      .select('_id username realName city state country friendCount createdAt')
      .sort({ createdAt: -1 })
      .limit(Math.min(300, Math.max(120, limit * 12)))
      .lean();

    const candidateIds = candidates
      .map((candidate) => String(candidate?._id || '').trim())
      .filter(Boolean);

    const pendingByUserId = new Map();
    if (candidateIds.length > 0) {
      const pendingFriendships = await Friendship.find({
        status: 'pending',
        $or: [
          { requester: viewerId, recipient: { $in: candidateIds } },
          { recipient: viewerId, requester: { $in: candidateIds } }
        ]
      }).select('requester recipient').lean();

      for (const friendship of pendingFriendships) {
        const requesterId = String(friendship?.requester || '');
        const recipientId = String(friendship?.recipient || '');
        if (requesterId === viewerId && recipientId) {
          pendingByUserId.set(recipientId, 'outgoing');
        } else if (recipientId === viewerId && requesterId) {
          pendingByUserId.set(requesterId, 'incoming');
        }
      }
    }

    const ranked = candidates
      .filter((candidate) => !blockedOrMuted.has(String(candidate._id)))
      .map((candidate) => {
        const candidateId = String(candidate._id || '');
        const textMatch = scoreTextMatch(query, candidate.username, candidate.realName);
        const socialSignal = Math.min(1, Math.log1p(Number(candidate.friendCount || 0)) / 4);
        const locationSignal = scoreLocationAffinity(req.viewerProfile, candidate);
        const freshness = recencyScore(candidate.createdAt, 120);
        const isAlreadyFriend = relationshipContext.friendIds.has(candidateId);
        const pendingDirection = pendingByUserId.get(candidateId) || null;
        const relationship = isAlreadyFriend
          ? 'accepted'
          : (pendingDirection ? 'pending' : 'none');

        const score =
          (textMatch * 0.4)
          + (socialSignal * 0.25)
          + (locationSignal * 0.2)
          + (freshness * 0.15)
          + (isAlreadyFriend ? 0.05 : 0);

        return {
          ...candidate,
          ranking: {
            score: Number(score.toFixed(4)),
            signals: {
              textMatch: Number(textMatch.toFixed(3)),
              socialSignal: Number(socialSignal.toFixed(3)),
              locationSignal: Number(locationSignal.toFixed(3)),
              freshness: Number(freshness.toFixed(3)),
              alreadyFriend: isAlreadyFriend
            }
          },
          relationship,
          requestDirection: relationship === 'pending' ? pendingDirection : null
        };
      })
      .sort((a, b) => (b.ranking.score - a.ranking.score) || (new Date(b.createdAt) - new Date(a.createdAt)));

    const total = ranked.length;
    const start = (page - 1) * limit;
    const users = ranked.slice(start, start + limit);
    const responsePayload = {
      success: true,
      users,
      page,
      limit,
      total,
      hasMore: start + limit < total,
      rankingSignals: ['textMatch', 'socialSignal', 'locationSignal', 'freshness', 'alreadyFriend'],
      cached: false
    };

    setCache(cacheKey, responsePayload);
    logDiscoveryEvent({
      userId: viewerId,
      eventType: 'discovery_user_impression',
      metadata: { query, page, limit, count: users.length },
      req
    });

    return res.json(responsePayload);
  } catch (error) {
    console.error('User discovery error:', error);
    return res.status(500).json({ error: 'Failed to load user discovery results', details: error.message });
  }
});

router.get('/posts', authenticateToken, discoveryLimiter, async (req, res) => {
  try {
    const viewerId = String(req.user.userId);
    const query = String(req.query.q || '').trim();
    const { page, limit } = parsePagination(req.query);
    const viewerCoordinates = parseViewerCoordinates(req.query);
    const cacheKey = `posts:${viewerId}:${query}:${page}:${limit}:${viewerCoordinates ? viewerCoordinates.join(',') : 'none'}`;

    const cached = getCache(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const [relationshipContext, blockedOrMuted, contentFilter, censorEnabled] = await Promise.all([
      getViewerRelationshipContext(viewerId),
      getBlockedOrMutedIds(viewerId),
      getContentFilterConfig(),
      getViewerContentFilterPreference(viewerId)
    ]);

    const postFilter = {
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    };

    if (query.length >= 2) {
      const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      postFilter.content = searchRegex;
    }

    const candidates = await Post.find(postFilter)
      .sort({ createdAt: -1 })
      .limit(Math.min(300, Math.max(120, limit * 12)))
      .populate('authorId', 'username realName city state country')
      .populate('targetFeedId', 'username realName');

    let secureDeniedCount = 0;
    const ranked = candidates
      .filter((post) => !blockedOrMuted.has(String(post.authorId?._id || post.authorId)))
      .filter((post) => {
        const authorId = String(post.authorId?._id || post.authorId || '');
        const canView = post.canView(viewerId, {
          isFriend: relationshipContext.friendIds.has(authorId),
          isSecureFriend: relationshipContext.secureAudienceOwnerIds.has(authorId),
          viewerCoordinates
        });
        if (!canView && normalizeRelationshipAudience(post.relationshipAudience) === 'secure') {
          secureDeniedCount += 1;
        }
        return canView;
      })
      .map((post) => {
        const authorId = String(post.authorId?._id || post.authorId || '');
        const likesCount = Array.isArray(post.likes) ? post.likes.length : 0;
        const commentsCount = Array.isArray(post.comments) ? post.comments.length : 0;
        const engagement = Math.min(1, (likesCount + (commentsCount * 2)) / 25);
        const freshness = recencyScore(post.createdAt, 30);
        const socialSignal = relationshipContext.friendIds.has(authorId) ? 1 : 0.2;
        const textMatch = scoreTextMatch(query, post.authorId?.username || '', post.content || '');
        const score = (engagement * 0.35) + (freshness * 0.3) + (socialSignal * 0.2) + (textMatch * 0.15);

        return {
          _id: post._id,
          content: censorEnabled ? censorMaturityText(post.content, contentFilter.maturityCensoredWords) : post.content,
          contentCensored: censorMaturityText(post.content, contentFilter.maturityCensoredWords),
          visibility: post.visibility,
          relationshipAudience: normalizeRelationshipAudience(post.relationshipAudience),
          authorId: post.authorId,
          targetFeedId: post.targetFeedId,
          createdAt: post.createdAt,
          likesCount,
          commentsCount,
          ranking: {
            score: Number(score.toFixed(4)),
            signals: {
              engagement: Number(engagement.toFixed(3)),
              freshness: Number(freshness.toFixed(3)),
              socialSignal: Number(socialSignal.toFixed(3)),
              textMatch: Number(textMatch.toFixed(3))
            }
          }
        };
      })
      .sort((a, b) => (b.ranking.score - a.ranking.score) || (new Date(b.createdAt) - new Date(a.createdAt)));

    if (secureDeniedCount > 0) {
      logRelationshipAudienceEvent({
        eventType: 'secure_content_access_denied',
        viewerId,
        req,
        metadata: {
          route: 'discovery_posts',
          secureDeniedCount
        }
      });
    }

    const total = ranked.length;
    const start = (page - 1) * limit;
    const posts = ranked.slice(start, start + limit);
    const responsePayload = {
      success: true,
      posts,
      page,
      limit,
      total,
      hasMore: start + limit < total,
      rankingSignals: ['engagement', 'freshness', 'socialSignal', 'textMatch'],
      cached: false
    };

    setCache(cacheKey, responsePayload);
    const secureVisibleCount = posts.filter((post) => post.relationshipAudience === 'secure').length;
    if (secureVisibleCount > 0) {
      logRelationshipAudienceEvent({
        eventType: 'secure_content_viewed',
        viewerId,
        req,
        metadata: {
          route: 'discovery_posts',
          secureVisibleCount
        }
      });
    }

    logDiscoveryEvent({
      userId: viewerId,
      eventType: 'discovery_post_impression',
      metadata: { query, page, limit, count: posts.length },
      req
    });

    return res.json(responsePayload);
  } catch (error) {
    console.error('Post discovery error:', error);
    return res.status(500).json({ error: 'Failed to load post discovery results', details: error.message });
  }
});

router.post('/events', authenticateToken, discoveryLimiter, async (req, res) => {
  try {
    const eventType = String(req.body?.eventType || '').trim();
    const allowed = new Set([
      'profile_click',
      'post_click',
      'follow_click',
      'social_profile_section_clicked',
      'social_guest_preview_toggled',
      'social_gallery_opened',
      'social_customization_preview_opened',
      'social_customization_saved',
      'social_customization_reset'
    ]);
    if (!allowed.has(eventType)) {
      return res.status(400).json({ error: 'Invalid discovery eventType' });
    }

    const metadata = typeof req.body?.metadata === 'object' && req.body.metadata
      ? req.body.metadata
      : {};

    logDiscoveryEvent({
      userId: String(req.user.userId),
      eventType,
      metadata,
      req
    });

    return res.status(202).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to record discovery event', details: error.message });
  }
});

module.exports = router;
