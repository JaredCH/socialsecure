'use strict';

const { getArticlesForLocation } = require('./locationCacheService');
const { resolvePrimaryLocation } = require('./locationNormalizer');

const NewsPreferences = require('../models/NewsPreferences');
const User = require('../models/User');

function normalizeCategoryKey(value) {
  return String(value || '').trim().toLowerCase();
}

function filterArticles(articles = [], { tier = null, category = null, maxAgeHours = null } = {}) {
  const now = Date.now();
  const normalizedCategory = normalizeCategoryKey(category);
  return articles.filter((article) => {
    if (tier && article.tier !== tier) return false;
    if (
      normalizedCategory &&
      normalizedCategory !== 'all' &&
      normalizeCategoryKey(article.category || 'general') !== normalizedCategory
    ) return false;
    if (maxAgeHours) {
      const publishedAt = article.publishedAt ? new Date(article.publishedAt).getTime() : 0;
      if (!publishedAt || (now - publishedAt) > (Number(maxAgeHours) * 60 * 60 * 1000)) return false;
    }
    return true;
  });
}

async function buildFeed(userId, options = {}) {
  const prefs = await NewsPreferences.findOne({ user: userId }).lean();
  const primaryLocation = (prefs?.locations || []).find((location) => location.isPrimary) || (prefs?.locations || [])[0] || null;
  const userProfile = primaryLocation ? null : await User.findById(userId).select('city state zipCode country').lean();
  const normalizedLocation = await resolvePrimaryLocation(primaryLocation, userProfile);

  if (!normalizedLocation?.locationKey) {
    return {
      articles: [],
      pagination: { page: 1, pages: 0, total: 0 },
      location: null,
      sections: { keyword: [], local: [], state: [], national: [], trending: [] },
      feed: []
    };
  }

  const safePage = Math.max(parseInt(options.page, 10) || 1, 1);
  const safeLimit = Math.min(parseInt(options.limit, 10) || 20, 50);
  const { articles, cacheHit, locationKey } = await getArticlesForLocation(normalizedLocation.locationKey, {
    normalizedLocation
  });

  const filtered = filterArticles(articles, options);
  const start = (safePage - 1) * safeLimit;
  const pageArticles = filtered.slice(start, start + safeLimit);

  return {
    articles: pageArticles,
    pagination: {
      page: safePage,
      pages: Math.ceil(filtered.length / safeLimit),
      total: filtered.length
    },
    location: {
      locationKey,
      cacheHit,
      ...normalizedLocation
    },
    sections: {
      keyword: [],
      local: safePage === 1 ? filtered.filter((article) => article.tier === 'local').slice(0, safeLimit) : [],
      state: safePage === 1 ? filtered.filter((article) => article.tier === 'state').slice(0, 2) : [],
      national: safePage === 1 ? filtered.filter((article) => article.tier === 'national').slice(0, 2) : [],
      trending: []
    },
    feed: pageArticles
  };
}

module.exports = { buildFeed };
