const express = require('express');
const rateLimit = require('express-rate-limit');

const { getArticlesForLocation } = require('../services/locationCacheService');
const { normalizeLocationInput } = require('../services/locationNormalizer');
const { getLocationTaxonomyPayload } = require('../utils/newsLocationTaxonomy');
const { normalizeRelationshipAudience } = require('../utils/relationshipAudience');
const { SPORTS_TEAMS: SPORTS_CATALOG } = require('../data/news/sportsTeamLocationIndex');
const { guestSessionContext } = require('../utils/guestSessionContext');

const Post = require('../models/Post');
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');

const router = express.Router();

const MAX_DISCOVERY_POSTS_FETCH_LIMIT = 200;
const MIN_DISCOVERY_POSTS_FETCH_LIMIT = 100;
const DISCOVERY_POSTS_FETCH_MULTIPLIER = 10;

const guestReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many guest requests, please try again shortly.' }
});

const parsePagination = (query, defaultLimit = 20, maxLimit = 50) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

const toRoomSummary = (room) => ({
  _id: room?._id,
  name: room?.name || '',
  type: room?.type || '',
  city: room?.city || null,
  county: room?.county || null,
  state: room?.state || null,
  country: room?.country || null,
  zipCode: room?.zipCode || null,
  messageCount: Number(room?.messageCount || 0),
  memberCount: Array.isArray(room?.members) ? room.members.length : 0,
  lastActivity: room?.lastActivity || null
});

const filterNewsFeedArticles = (articles = [], { category = null, maxAgeHours = null } = {}) => {
  const now = Date.now();
  const normalizedCategory = String(category || '').trim().toLowerCase();

  return articles.filter((article) => {
    if (normalizedCategory && normalizedCategory !== 'all') {
      if (String(article.category || '').trim().toLowerCase() !== normalizedCategory) {
        return false;
      }
    }
    if (maxAgeHours) {
      const publishedAt = article?.publishedAt ? new Date(article.publishedAt).getTime() : 0;
      if (!publishedAt || (now - publishedAt) > (Number(maxAgeHours) * 60 * 60 * 1000)) {
        return false;
      }
    }
    return true;
  });
};

router.use(guestSessionContext);
router.use(guestReadLimiter);
router.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return res.status(405).json({ error: 'Guest endpoints are read-only' });
  }
  return next();
});

router.get('/news/feed', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, 20, 50);
    const normalizedLocation = await normalizeLocationInput(req.guestSessionContext);
    if (!normalizedLocation?.locationKey) {
      return res.json({
        articles: [],
        pagination: { page: 1, pages: 0, total: 0 },
        location: null,
        feed: []
      });
    }

    const cacheResult = await getArticlesForLocation(normalizedLocation.locationKey, { normalizedLocation });
    const filteredArticles = filterNewsFeedArticles(cacheResult.articles || [], req.query);
    const start = (page - 1) * limit;
    const pageArticles = filteredArticles.slice(start, start + limit);

    return res.json({
      articles: pageArticles,
      pagination: {
        page,
        pages: Math.ceil(filteredArticles.length / limit),
        total: filteredArticles.length
      },
      location: {
        locationKey: cacheResult.locationKey,
        cacheHit: cacheResult.cacheHit,
        ...normalizedLocation
      },
      sections: page === 1 ? {
        keyword: [],
        local: filteredArticles.filter((article) => article.tier === 'local').slice(0, 6),
        state: filteredArticles.filter((article) => article.tier === 'state').slice(0, 4),
        national: filteredArticles.filter((article) => article.tier === 'national').slice(0, 4),
        trending: []
      } : { keyword: [], local: [], state: [], national: [], trending: [] },
      feed: pageArticles
    });
  } catch (error) {
    console.error('Error building guest news feed:', error);
    return res.status(500).json({ error: 'Failed to build guest news feed' });
  }
});

router.get('/news/preferences', async (req, res) => {
  res.json({
    preferences: {
      locations: [{
        city: req.guestSessionContext.city,
        state: req.guestSessionContext.state,
        zipCode: req.guestSessionContext.zipCode,
        country: 'United States',
        countryCode: req.guestSessionContext.country,
        isPrimary: true
      }],
      hiddenCategories: [],
      followedSportsTeams: []
    },
    registrationAlignment: null
  });
});

router.get('/news/sources', async (req, res) => {
  res.json({ sources: [] });
});

router.get('/news/sports-teams', async (req, res) => {
  const leagues = SPORTS_CATALOG.reduce((acc, team) => {
    const leagueKey = String(team.league || team.id?.split(':')[0] || 'other').toLowerCase();
    if (!acc.has(leagueKey)) {
      acc.set(leagueKey, { id: leagueKey, label: team.league || leagueKey.toUpperCase(), teams: [] });
    }
    acc.get(leagueKey).teams.push(team);
    return acc;
  }, new Map());
  res.json({ leagues: [...leagues.values()] });
});

router.get('/news/location-taxonomy', async (req, res) => {
  const taxonomy = await getLocationTaxonomyPayload({
    preferredStateCode: req.guestSessionContext.state,
    preferredStateName: req.guestSessionContext.state
  });
  res.json({ taxonomy });
});

router.get('/chat/rooms/quick-access', async (req, res) => {
  try {
    await ChatRoom.ensureDefaultDiscoveryRooms();
    const context = req.guestSessionContext;
    const coordinates = Array.isArray(context?.location?.coordinates) ? context.location.coordinates : null;
    const country = context.country || 'US';

    const [stateResult, countyResult, cityRoom] = await Promise.all([
      ChatRoom.findOrCreateByLocation({
        type: 'state',
        state: context.state,
        country,
        coordinates: coordinates || [0, 0]
      }),
      ChatRoom.findOrCreateByLocation({
        type: 'county',
        county: context.county,
        state: context.state,
        country,
        coordinates: coordinates || [0, 0]
      }),
      ChatRoom.findOne({
        type: 'city',
        state: context.state,
        zipCode: context.zipCode
      }).lean()
    ]);

    return res.json({
      success: true,
      rooms: {
        state: stateResult?.room ? toRoomSummary(stateResult.room) : null,
        county: countyResult?.room ? toRoomSummary(countyResult.room) : null,
        zip: cityRoom ? toRoomSummary(cityRoom) : null,
        cities: []
      },
      guestContext: req.guestSessionContext
    });
  } catch (error) {
    console.error('Error loading guest quick-access rooms:', error);
    return res.status(500).json({ error: 'Failed to load guest quick-access rooms' });
  }
});

router.get('/discovery/users', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 10, 25);
    const query = String(req.query.q || '').trim();
    const searchRegex = query.length >= 2 ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const filter = {
      onboardingStatus: 'completed',
      ...(searchRegex ? { $or: [{ username: searchRegex }, { realName: searchRegex }] } : {})
    };

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('_id username realName city state country createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      users: users.map((user) => ({
        ...user,
        relationship: 'none',
        requestDirection: null,
        whySuggested: 'Public profile'
      })),
      page,
      limit,
      total,
      hasMore: (skip + users.length) < total
    });
  } catch (error) {
    console.error('Guest discovery users error:', error);
    return res.status(500).json({ error: 'Failed to load guest user discovery results' });
  }
});

router.get('/discovery/posts', async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, 10, 25);
    const query = String(req.query.q || '').trim();
    const postFilter = {
      visibility: 'public',
      relationshipAudience: 'public',
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    };
    if (query.length >= 2) {
      postFilter.content = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    const candidates = await Post.find(postFilter)
      .sort({ createdAt: -1 })
      .limit(Math.min(
        MAX_DISCOVERY_POSTS_FETCH_LIMIT,
        Math.max(MIN_DISCOVERY_POSTS_FETCH_LIMIT, limit * DISCOVERY_POSTS_FETCH_MULTIPLIER)
      ))
      .populate('authorId', 'username realName city state country')
      .populate('targetFeedId', 'username realName');

    const visible = candidates
      .filter((post) => post.canView(null))
      .map((post) => ({
        _id: post._id,
        content: post.content,
        visibility: post.visibility,
        relationshipAudience: normalizeRelationshipAudience(post.relationshipAudience),
        authorId: post.authorId,
        targetFeedId: post.targetFeedId,
        createdAt: post.createdAt,
        likesCount: Array.isArray(post.likes) ? post.likes.length : 0,
        commentsCount: Array.isArray(post.comments) ? post.comments.length : 0,
        whySuggested: 'Public post'
      }));

    const start = (page - 1) * limit;
    const posts = visible.slice(start, start + limit);
    return res.json({
      success: true,
      posts,
      page,
      limit,
      total: visible.length,
      hasMore: start + limit < visible.length
    });
  } catch (error) {
    console.error('Guest discovery posts error:', error);
    return res.status(500).json({ error: 'Failed to load guest post discovery results' });
  }
});

router.get('/social/:userId/feed', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 20, 100);
    const identifier = String(req.params.userId || '').trim().toLowerCase();
    if (!identifier) {
      return res.status(400).json({ error: 'User identifier is required' });
    }
    const user = await User.findOne({ username: identifier }).select('_id username realName city state country').lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [posts, total] = await Promise.all([
      Post.find({
        targetFeedId: user._id,
        visibility: 'public',
        relationshipAudience: 'public',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id authorId targetFeedId content visibility relationshipAudience mediaUrls likes comments createdAt updatedAt')
        .populate('authorId', 'username realName')
        .populate('targetFeedId', 'username realName')
        .lean(),
      Post.countDocuments({
        targetFeedId: user._id,
        visibility: 'public',
        relationshipAudience: 'public',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
      })
    ]);

    return res.json({
      user,
      posts: posts.map((post) => ({
        ...post,
        relationshipAudience: normalizeRelationshipAudience(post.relationshipAudience)
      })),
      page,
      limit,
      total,
      hasMore: (skip + posts.length) < total
    });
  } catch (error) {
    console.error('Error fetching guest social feed:', error);
    return res.status(500).json({ error: 'Failed to fetch guest social feed' });
  }
});

module.exports = router;
