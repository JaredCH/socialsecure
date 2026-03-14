'use strict';

/**
 * newsFeedBuilder.js
 *
 * Builds the priority-stack news feed for a given user.
 *
 * Feed tiers (returned as flat article array with `tier` field):
 *   0. keyword    — articles matching user's followedKeywords (< 16 h old), any category
 *   1. local      — 2+ articles matching user's city key
 *   2. state      — 1 article: highest viralScore for user's state
 *   3. national   — 1 article: highest viralScore for user's country
 *   4. trending   — articles with viralScore ≥ PROMOTED_THRESHOLD, not already shown
 *   5. feed       — paginated remaining articles for the selected category
 *
 * Category filter applies across all tiers (except when category is 'all').
 * If a tier has no results, extra trending articles fill its slots.
 *
 * Optional options:
 *   followedKeywords  — array of lowercase keyword strings; matching fresh articles float to top
 *   deprioritisedIds  — array of ObjectIDs the user has seen ≥2 times (pushed to back of feed)
 *   regionFilter      — { country?, state?, city? } — override location scope for the entire query
 */

const mongoose = require('mongoose');
const Article = require('../models/Article');
const NewsPreferences = require('../models/NewsPreferences');
const ArticleImpression = require('../models/ArticleImpression');
const User = require('../models/User');

const PROMOTED_THRESHOLD = parseInt(process.env.NEWS_VIRAL_PROMOTED_THRESHOLD || '65', 10);
const DEFAULT_FEED_LIMIT = 20;
const TRENDING_LIMIT = 10;
const MAX_USED_IDS = 500; // cap the exclusion set to avoid huge queries

/**
 * Resolve the user's primary location from their NewsPreferences, falling back
 * to the User profile if no preferences location exists.
 * Returns { cityKey, stateCode, country } or partial nulls.
 *
 * If regionFilter is provided, it takes full precedence.
 */
async function resolveUserLocation(userId, regionFilter = null) {
  // Explicit region override from filter bar / region drill-down
  if (regionFilter && (regionFilter.city || regionFilter.state || regionFilter.country)) {
    let cityKey = null;
    if (regionFilter.city && regionFilter.state) {
      const { buildCityKey } = require('./newsIngestion.local');
      cityKey = buildCityKey(regionFilter.city, regionFilter.state);
    }
    return {
      cityKey,
      stateCode: regionFilter.state ? regionFilter.state.toUpperCase() : null,
      country: regionFilter.country || 'US',
    };
  }

  let cityKey = null;
  let stateCode = null;
  let country = 'US';

  try {
    const prefs = await NewsPreferences.findOne({ user: userId }).lean();
    const primaryLoc = (prefs?.locations || []).find(l => l.isPrimary) || prefs?.locations?.[0];
    if (primaryLoc) {
      cityKey = primaryLoc.cityKey || null;
      stateCode = primaryLoc.stateCode || null;
      country = primaryLoc.country || 'US';
    }

    if (!cityKey) {
      const user = await User.findById(userId).select('city state country zipCode').lean();
      if (user) {
        if (user.city && user.state) {
          const { buildCityKey } = require('./newsIngestion.local');
          cityKey = buildCityKey(user.city, user.state);
        }
        stateCode = stateCode || (user.state ? user.state.toUpperCase() : null);
        country = user.country || country;
      }
    }
  } catch (err) {
    console.error('[feedBuilder] Location resolve error:', err.message);
  }

  return { cityKey, stateCode, country };
}

/**
 * Fetch keyword-promoted articles.
 * Matches any article where title, description, or topics contain at least one
 * of the user's followedKeywords AND the article was published within 16 hours.
 */
async function fetchKeywordTier(keywords, categoryFilter, excludeIds, limit = 10) {
  if (!keywords || keywords.length === 0) return [];

  const cutoff = new Date(Date.now() - 16 * 60 * 60 * 1000);

  // Build regex patterns for each keyword (whole-word, case-insensitive)
  const patterns = keywords
    .filter((k) => k && k.trim())
    .map((k) => new RegExp(k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

  if (patterns.length === 0) return [];

  const orClauses = patterns.flatMap((re) => [
    { title: re },
    { description: re },
    { topics: re },
  ]);

  const query = {
    $or: orClauses,
    publishedAt: { $gte: cutoff },
    ...categoryFilter,
    _id: { $nin: excludeIds },
    isActive: { $ne: false },
  };

  return Article.find(query)
    .sort({ viralScore: -1, publishedAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * Build the base Article query filters shared across tiers.
 */
function baseCategoryFilter(category) {
  if (!category || category === 'all') return {};
  return { category };
}

/**
 * Fetch local tier articles (matching cityKey).
 */
async function fetchLocalTier(cityKey, categoryFilter, excludeIds, minCount = 2) {
  if (!cityKey) return [];

  const query = {
    pipeline: 'local',
    cityKey,
    ...categoryFilter,
    _id: { $nin: excludeIds },
    isActive: { $ne: false },
  };

  return Article.find(query)
    .sort({ viralScore: -1, publishedAt: -1 })
    .limit(Math.max(minCount, 3))
    .lean();
}

/**
 * Fetch state tier — single highest viralScore article for the given state.
 */
async function fetchStateTier(stateCode, categoryFilter, excludeIds) {
  if (!stateCode) return [];

  const query = {
    'locationTags.states': stateCode.toLowerCase(),
    pipeline: { $in: ['local', 'category'] },
    ...categoryFilter,
    _id: { $nin: excludeIds },
    isActive: { $ne: false },
  };

  const articles = await Article.find(query)
    .sort({ viralScore: -1, publishedAt: -1 })
    .limit(1)
    .lean();

  return articles;
}

/**
 * Fetch national tier — single highest viralScore article for the given country.
 */
async function fetchNationalTier(country, categoryFilter, excludeIds) {
  const countryLower = (country || 'US').toLowerCase();

  const query = {
    $or: [
      { 'locationTags.countries': countryLower },
      { localityLevel: 'country' },
      { pipeline: 'category', category: { $in: ['politics', 'business', 'breaking', 'general'] } },
    ],
    ...categoryFilter,
    _id: { $nin: excludeIds },
    isActive: { $ne: false },
  };

  return Article.find(query)
    .sort({ viralScore: -1, publishedAt: -1 })
    .limit(1)
    .lean();
}

/**
 * Fetch trending tier — articles above promoted threshold, sorted by viralScore.
 */
async function fetchTrendingTier(categoryFilter, excludeIds, limit = TRENDING_LIMIT) {
  const query = {
    viralScore: { $gte: PROMOTED_THRESHOLD },
    ...categoryFilter,
    _id: { $nin: excludeIds },
    isActive: { $ne: false },
  };

  return Article.find(query)
    .sort({ viralScore: -1, publishedAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * Fetch the paginated main feed articles.
 */
async function fetchFeedTier(categoryFilter, excludeIds, page = 1, limit = DEFAULT_FEED_LIMIT) {
  const skip = (page - 1) * limit;

  const query = {
    ...categoryFilter,
    _id: { $nin: excludeIds },
    isActive: { $ne: false },
  };

  const [articles, total] = await Promise.all([
    Article.find(query)
      .sort({ publishedAt: -1, viralScore: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Article.countDocuments(query),
  ]);

  return { articles, total };
}

/**
 * Main entry point: build the full priority-stack feed for a user.
 *
 * @param {string|ObjectId} userId
 * @param {object} options
 * @param {string}   [options.category]         — Category key or 'all'. Default: 'all'
 * @param {number}   [options.page]             — Page number for feed tier. Default: 1
 * @param {number}   [options.limit]            — Articles per page for feed tier. Default: 20
 * @param {string[]} [options.teamIds]          — Sports team IDs to filter sports articles
 * @param {string[]} [options.followedKeywords] — Keywords to inject at the top of the feed
 * @param {boolean}  [options.includeDeprioritised] — If true, suppress deprioritisation lookup
 * @param {object}   [options.regionFilter]     — { country?, state?, city? } location override
 * @returns {object} { sections, feed, total, page, category, location, triggeredIngest? }
 */
async function buildFeed(userId, options = {}) {
  const {
    category = 'all',
    page = 1,
    limit = DEFAULT_FEED_LIMIT,
    teamIds = [],
    followedKeywords = [],
    includeDeprioritised = false,
    regionFilter = null,
  } = options;

  const categoryFilter = baseCategoryFilter(category);

  // Resolve user location (may use regionFilter override)
  const location = await resolveUserLocation(userId, regionFilter);

  // Gather article IDs the user has already seen ≥2 times (deprioritise in feed)
  let deprioritisedIds = [];
  if (!includeDeprioritised) {
    try {
      deprioritisedIds = await ArticleImpression.getDeprioritisedArticleIds(userId, 2);
    } catch (err) {
      console.error('[feedBuilder] Impression lookup error:', err.message);
    }
  }

  const usedIds = [];

  // Helper to push IDs and cap set size
  const trackUsed = (articles) => {
    articles.forEach(a => {
      if (usedIds.length < MAX_USED_IDS) usedIds.push(a._id);
    });
  };

  const tagTier = (articles, tier) => articles.map(a => ({ ...a, _tier: tier }));

  // — Tier 0: Keyword-promoted ————————————————————————————————————————
  let keywordArticles = [];
  if (followedKeywords.length > 0) {
    keywordArticles = await fetchKeywordTier(followedKeywords, categoryFilter, usedIds);
    trackUsed(keywordArticles);
    keywordArticles = tagTier(keywordArticles, 'keyword');
  }

  // — Tier 1: Local ——————————————————————————————————————————————————
  let localArticles = await fetchLocalTier(location.cityKey, categoryFilter, usedIds);
  trackUsed(localArticles);
  localArticles = tagTier(localArticles, 'local');

  // — Tier 2: State ——————————————————————————————————————————————————
  let stateArticles = await fetchStateTier(location.stateCode, categoryFilter, usedIds);
  // Fallback: if no state article, grab trending
  if (!stateArticles.length) {
    stateArticles = await fetchTrendingTier(categoryFilter, usedIds, 1);
  }
  trackUsed(stateArticles);
  stateArticles = tagTier(stateArticles, 'state');

  // — Tier 3: National ————————————————————————————————————————————————
  let nationalArticles = await fetchNationalTier(location.country, categoryFilter, usedIds);
  if (!nationalArticles.length) {
    nationalArticles = await fetchTrendingTier(categoryFilter, usedIds, 1);
  }
  trackUsed(nationalArticles);
  nationalArticles = tagTier(nationalArticles, 'national');

  // — Tier 4: Trending —————————————————————————————————————————————————
  let trendingArticles = await fetchTrendingTier(categoryFilter, usedIds, TRENDING_LIMIT);
  trackUsed(trendingArticles);
  trendingArticles = tagTier(trendingArticles, 'trending');

  // — Tier 5: Feed ——————————————————————————————————————————————————————
  // Exclude deprioritised articles from the main feed page, but keep them
  // available as a fallback (they'll naturally appear later in pagination).
  const feedExcludeIds = [...usedIds, ...deprioritisedIds];
  const { articles: feedArticles, total } = await fetchFeedTier(categoryFilter, feedExcludeIds, page, limit);

  // If the feed came back thin due to deprioritisation, backfill with the
  // deprioritised articles so the user never sees an empty page.
  let finalFeedArticles = feedArticles;
  if (feedArticles.length < limit && deprioritisedIds.length > 0) {
    const backfillExclude = [...usedIds, ...feedArticles.map((a) => a._id)];
    const backfillQuery = { ...categoryFilter, _id: { $nin: backfillExclude }, isActive: { $ne: false } };
    const backfill = await Article.find(backfillQuery)
      .sort({ publishedAt: -1, viralScore: -1 })
      .limit(limit - feedArticles.length)
      .lean();
    finalFeedArticles = [...feedArticles, ...backfill];
  }

  const taggedFeed = tagTier(finalFeedArticles, 'feed');

  return {
    sections: {
      keyword: keywordArticles,
      local: localArticles,
      state: stateArticles,
      national: nationalArticles,
      trending: trendingArticles,
    },
    feed: taggedFeed,
    total,
    page,
    limit,
    category,
    location: {
      cityKey: location.cityKey,
      stateCode: location.stateCode,
      country: location.country,
      hasLocal: !!location.cityKey,
      hasState: !!location.stateCode,
    },
  };
}

module.exports = { buildFeed };
