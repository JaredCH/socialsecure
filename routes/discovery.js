const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Post = require('../models/Post');
const Friendship = require('../models/Friendship');
const BlockList = require('../models/BlockList');

// Stricter rate limiting for discovery endpoints to prevent scraping
const discoveryRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many discovery requests, please try again later.',
  keyGenerator: (req) => req.ip || 'unknown',
  validate: { xForwardedForHeader: false }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Helper: get IDs of viewer's accepted friends
const getViewerFriendIds = async (userId) => {
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }]
  }).select('requester recipient').lean();

  const ids = new Set();
  for (const f of friendships) {
    const r = String(f.requester);
    const p = String(f.recipient);
    ids.add(r === String(userId) ? p : r);
  }
  return ids;
};

// Helper: get IDs of users who have blocked or been blocked by the viewer
const getBlockedIds = async (userId) => {
  const [blocks, blockedBy] = await Promise.all([
    BlockList.find({ userId }).select('blockedUserId').lean(),
    BlockList.find({ blockedUserId: userId }).select('userId').lean()
  ]);

  const ids = new Set();
  for (const b of blocks) ids.add(String(b.blockedUserId));
  for (const b of blockedBy) ids.add(String(b.userId));
  return ids;
};

// Compute location proximity score (0–3 points)
const locationScore = (viewerUser, candidateUser) => {
  if (!viewerUser || !candidateUser) return 0;
  if (viewerUser.city && candidateUser.city && viewerUser.city === candidateUser.city) return 3;
  if (viewerUser.state && candidateUser.state && viewerUser.state === candidateUser.state) return 2;
  if (viewerUser.country && candidateUser.country && viewerUser.country === candidateUser.country) return 1;
  return 0;
};

// Haversine distance in miles between two [lon, lat] coordinate pairs
const distanceMiles = (coords1, coords2) => {
  if (!Array.isArray(coords1) || !Array.isArray(coords2)) return null;
  const toRadians = (d) => (d * Math.PI) / 180;
  const EARTH_RADIUS_MILES = 3958.8;
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;
  if (![lon1, lat1, lon2, lat2].every((v) => Number.isFinite(Number(v)))) return null;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// POST /api/discovery/users/impression - track user suggestion impressions
router.post('/users/impression', authenticateToken, discoveryRateLimit, (req, res) => {
  // Acknowledge analytics event; persistence can be added in future iteration
  res.json({ success: true });
});

// POST /api/discovery/posts/impression - track post suggestion impressions
router.post('/posts/impression', authenticateToken, discoveryRateLimit, (req, res) => {
  res.json({ success: true });
});

/**
 * GET /api/discovery/users
 * Returns a ranked list of suggested users for the authenticated viewer.
 *
 * Ranking signals:
 *   1. Mutual friends  (up to 10 pts) – strongest social signal
 *   2. Location proximity (up to 3 pts) – same city/state/country
 *   3. Account recency  (up to 2 pts) – new members get a small boost
 *
 * Query params: page (default 1), limit (default 20, max 50)
 */
router.get('/users', authenticateToken, discoveryRateLimit, async (req, res) => {
  try {
    const viewerId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    // Concurrently fetch viewer profile, viewer's friends, and blocked users
    const [viewerUser, friendIds, blockedIds] = await Promise.all([
      User.findById(viewerId).select('city state country').lean(),
      getViewerFriendIds(viewerId),
      getBlockedIds(viewerId)
    ]);

    // Users to exclude from suggestions: viewer themselves, existing friends, blocked
    const excludeIds = new Set([String(viewerId), ...friendIds, ...blockedIds]);

    // Build mutual-friend candidate map via a single fan-out query on viewer's friends
    // Find all accepted friendships that involve at least one of the viewer's friends
    const friendFriendships = friendIds.size > 0
      ? await Friendship.find({
          status: 'accepted',
          $or: [
            { requester: { $in: Array.from(friendIds) } },
            { recipient: { $in: Array.from(friendIds) } }
          ]
        }).select('requester recipient').lean()
      : [];

    // mutualMap: candidateId -> number of mutual friends with viewer
    const mutualMap = new Map();
    for (const f of friendFriendships) {
      const r = String(f.requester);
      const p = String(f.recipient);
      // The candidate is the party who is NOT in the viewer's friend set
      for (const candidateId of [r, p]) {
        if (!friendIds.has(candidateId) && !excludeIds.has(candidateId)) {
          mutualMap.set(candidateId, (mutualMap.get(candidateId) || 0) + 1);
        }
      }
    }

    const mutualCandidateIds = Array.from(mutualMap.keys());

    // Fetch both mutual-friend candidates and other active users in parallel
    const [mutualCandidates, otherCandidates] = await Promise.all([
      mutualCandidateIds.length > 0
        ? User.find({ _id: { $in: mutualCandidateIds }, registrationStatus: 'active' })
            .select('username realName bio avatarUrl city state country createdAt')
            .lean()
        : Promise.resolve([]),
      User.find({ _id: { $nin: [...excludeIds, ...mutualCandidateIds] }, registrationStatus: 'active' })
        .sort({ createdAt: -1 })
        .limit(100)
        .select('username realName bio avatarUrl city state country createdAt')
        .lean()
    ]);

    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const scoreCandidate = (user, mutualCount) => {
      let score = 0;
      const reasons = [];

      // Signal 1: Mutual friends
      if (mutualCount > 0) {
        score += Math.min(10, mutualCount * 2);
        reasons.push(`${mutualCount} mutual friend${mutualCount > 1 ? 's' : ''}`);
      }

      // Signal 2: Location proximity
      const locScore = locationScore(viewerUser, user);
      if (locScore === 3) { score += 3; reasons.push('same city'); }
      else if (locScore === 2) { score += 2; reasons.push('same state'); }
      else if (locScore === 1) { score += 1; reasons.push('same country'); }

      // Signal 3: Account recency (new members get a short-lived boost)
      const ageInDays = user.createdAt
        ? (now - new Date(user.createdAt).getTime()) / DAY_MS
        : 9999;
      if (ageInDays < 7) { score += 2; reasons.push('new member'); }
      else if (ageInDays < 30) { score += 1; }

      return { score, reasons };
    };

    // Combine, deduplicate, and score
    const seenIds = new Set();
    const scoredUsers = [];

    for (const u of mutualCandidates) {
      const id = String(u._id);
      if (!seenIds.has(id)) {
        seenIds.add(id);
        const { score, reasons } = scoreCandidate(u, mutualMap.get(id) || 0);
        scoredUsers.push({ user: u, score, reasons });
      }
    }

    for (const u of otherCandidates) {
      const id = String(u._id);
      if (!seenIds.has(id)) {
        seenIds.add(id);
        const { score, reasons } = scoreCandidate(u, 0);
        scoredUsers.push({ user: u, score, reasons });
      }
    }

    // Sort by rank desc; break ties by account creation date (newer first)
    scoredUsers.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.user.createdAt).getTime() - new Date(a.user.createdAt).getTime();
    });

    const total = scoredUsers.length;
    const paginated = scoredUsers.slice(skip, skip + limit);

    res.set('Cache-Control', 'private, max-age=60');
    res.json({
      success: true,
      users: paginated.map(({ user, score, reasons }) => ({
        _id: user._id,
        username: user.username,
        realName: user.realName,
        bio: user.bio || '',
        avatarUrl: user.avatarUrl || '',
        city: user.city,
        state: user.state,
        country: user.country,
        rankScore: score,
        whySuggested: reasons.length > 0 ? reasons.join(' · ') : 'Suggested for you'
      })),
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + limit < total
      }
    });
  } catch (error) {
    console.error('Error in GET /discovery/users:', error);
    res.status(500).json({ error: 'Failed to load user suggestions', details: error.message });
  }
});

/**
 * GET /api/discovery/posts
 * Returns a ranked list of suggested public posts for the authenticated viewer.
 *
 * Ranking signals:
 *   1. Engagement quality (likes + 2×comments, capped at 20 pts)
 *   2. Recency with half-life decay (up to 10 pts)
 *   3. Location proximity (up to 5 pts) – requires latitude/longitude query params
 *   4. From a friend (4 pts)
 *
 * Query params: page (default 1), limit (default 20, max 50),
 *               latitude, longitude (optional, for geo-ranking)
 */
router.get('/posts', authenticateToken, discoveryRateLimit, async (req, res) => {
  try {
    const viewerId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const latitude = parseFloat(req.query.latitude);
    const longitude = parseFloat(req.query.longitude);
    const hasCoords =
      Number.isFinite(latitude) && Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

    const [blockedIds, viewerFriendIds] = await Promise.all([
      getBlockedIds(viewerId),
      getViewerFriendIds(viewerId)
    ]);

    // Fetch recent public posts from non-blocked authors (last 30 days)
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const posts = await Post.find({
      visibility: 'public',
      authorId: { $nin: Array.from(blockedIds) },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      createdAt: { $gte: cutoff }
    })
      .select('authorId content mediaUrls likes comments createdAt location locationRadius')
      .populate('authorId', 'username realName avatarUrl city state country')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();

    const scoredPosts = posts.map((post) => {
      let score = 0;
      const reasons = [];

      // Signal 1: Engagement quality
      const likesCount = Array.isArray(post.likes) ? post.likes.length : 0;
      const commentsCount = Array.isArray(post.comments) ? post.comments.length : 0;
      const engagement = Math.min(20, likesCount + 2 * commentsCount);
      score += engagement;
      if (engagement > 5) reasons.push('popular post');

      // Signal 2: Recency with exponential decay (half-life = 24 h)
      const ageInHours = (now - new Date(post.createdAt).getTime()) / HOUR_MS;
      score += Math.max(0, 10 * (0.5 ** (ageInHours / 24)));

      // Signal 3: Location proximity (requires client-supplied coordinates)
      if (hasCoords && Array.isArray(post.location?.coordinates)) {
        const dist = distanceMiles(post.location.coordinates, [longitude, latitude]);
        if (dist !== null) {
          if (dist < 10) { score += 5; reasons.push('nearby'); }
          else if (dist < 50) { score += 3; reasons.push('nearby'); }
          else if (dist < 200) { score += 1; }
        }
      }

      // Signal 4: Post is from one of the viewer's friends
      const authorId = String(post.authorId?._id || post.authorId);
      if (viewerFriendIds.has(authorId)) {
        score += 4;
        reasons.push('from a friend');
      }

      return { post, score, reasons };
    });

    scoredPosts.sort((a, b) => b.score - a.score);

    const total = scoredPosts.length;
    const paginated = scoredPosts.slice(skip, skip + limit);

    res.set('Cache-Control', 'private, max-age=60');
    res.json({
      success: true,
      posts: paginated.map(({ post, score, reasons }) => ({
        _id: post._id,
        author: post.authorId,
        content: post.content || '',
        mediaUrls: post.mediaUrls || [],
        likesCount: Array.isArray(post.likes) ? post.likes.length : 0,
        commentsCount: Array.isArray(post.comments) ? post.comments.length : 0,
        createdAt: post.createdAt,
        rankScore: score,
        whySuggested: reasons.length > 0 ? reasons.join(' · ') : 'Suggested for you'
      })),
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + limit < total
      }
    });
  } catch (error) {
    console.error('Error in GET /discovery/posts:', error);
    res.status(500).json({ error: 'Failed to load post suggestions', details: error.message });
  }
});

module.exports = router;
