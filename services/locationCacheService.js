'use strict';

const crypto = require('crypto');
const LRU = require('lru-cache');
const Parser = require('rss-parser');
const LocationNewsCache = require('../models/LocationNewsCache');
const NewsIngestionRecord = require('../models/NewsIngestionRecord');
const { buildFeedUrls } = require('./locationFeedBuilder');
const { parseLocationKey } = require('./locationNormalizer');
const { deduplicateArticles } = require('./articleDeduplicator');
const { extractRssImageUrl } = require('./newsRssImage');

const CACHE_TTL_MS = 15 * 60 * 1000;
const parser = new Parser({ timeout: 5000, headers: { 'User-Agent': 'SocialSecure-NewsCache/1.0' } });

// In-memory LRU cache for hot locations — avoids MongoDB round-trip on every hit
const memoryCache = new LRU({ max: 200, maxAge: 5 * 60 * 1000 });

function createArticleId(article = {}) {
  return crypto
    .createHash('sha1')
    .update(`${article.link || article.url || ''}|${article.title || ''}`)
    .digest('hex')
    .slice(0, 24);
}

function inferSourceName(item = {}, feed = {}) {
  const explicit = item.creator || item.author || item.source?.name || item.source || '';
  if (explicit) return String(explicit).trim();
  const title = String(item.title || '');
  const sourceMatch = title.match(/\s[-–—|]\s([A-Z][A-Za-z0-9\s.&']+)$/);
  if (sourceMatch) return sourceMatch[1].trim();
  return String(feed?.title || 'Google News').trim() || 'Google News';
}

function mapTierToLocality(tier) {
  if (tier === 'local') return 'city';
  if (tier === 'state') return 'state';
  if (tier === 'national') return 'country';
  return 'global';
}

function hydrateArticles(articles = [], locationKey) {
  const parsedLocation = parseLocationKey(locationKey) || {};
  return articles.map((article) => ({
    ...article,
    _id: createArticleId(article),
    url: article.link,
    locationKey,
    localityLevel: mapTierToLocality(article.tier),
    category: article.category || 'general',
    locationTags: {
      city: parsedLocation.city ? parsedLocation.city.replace(/_/g, ' ') : null,
      state: parsedLocation.state ? parsedLocation.state.toUpperCase() : null,
      country: parsedLocation.country ? parsedLocation.country.toUpperCase() : null,
      cities: parsedLocation.city ? [parsedLocation.city.replace(/_/g, ' ')] : [],
      states: parsedLocation.state ? [parsedLocation.state.toUpperCase()] : [],
      countries: parsedLocation.country ? [parsedLocation.country.toUpperCase()] : []
    },
    viralSignals: {},
    viralScore: article.tier === 'local' ? 90 : article.tier === 'state' ? 75 : 60
  }));
}

async function logCacheEvent(eventType, metadata = {}) {
  if (!NewsIngestionRecord || typeof NewsIngestionRecord.create !== 'function') return;
  try {
    await NewsIngestionRecord.create({
      ingestionRunId: crypto.randomUUID(),
      eventType,
      locationKey: metadata.locationKey || null,
      cacheHit: Boolean(metadata.cacheHit),
      articleCount: Number(metadata.articleCount || 0),
      metadata
    });
  } catch (_) {
    // Non-fatal observability only.
  }
}

function normalizeCachedArticle(item = {}, tier, feed) {
  const link = String(item.link || item.guid || item.id || '').trim();
  const title = String(item.title || '').trim();
  if (!link || !title) return null;

  const publishedAt = item.isoDate || item.pubDate ? new Date(item.isoDate || item.pubDate) : null;
  return {
    title,
    link,
    source: inferSourceName(item, feed),
    publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    tier,
    imageUrl: extractRssImageUrl(item),
    description: String(item.contentSnippet || item.summary || '').trim().slice(0, 280)
  };
}

async function fetchAndParseRSS(url, tier) {
  const feed = await parser.parseURL(url);
  return (feed?.items || [])
    .map((item) => normalizeCachedArticle(item, tier, feed))
    .filter(Boolean);
}

async function updateLocationCache(locationKey, normalized, allArticles, fetchErrors = []) {
  const payload = {
    locationKey,
    city: normalized.city,
    state: normalized.state,
    stateFull: normalized.stateFull,
    country: normalized.country,
    lastFetchedAt: new Date(),
    ttlMinutes: Math.round(CACHE_TTL_MS / 60000),
    articles: allArticles,
    fetchErrors: fetchErrors.slice(-10)
  };

  await LocationNewsCache.findOneAndUpdate(
    { locationKey },
    { $set: payload },
    { upsert: true, new: true }
  );
}

// Background refresh: fetches RSS, updates DB + memory cache. Does NOT throw.
async function refreshLocationInBackground(locationKey, normalized) {
  try {
    const urls = buildFeedUrls(normalized);
    const results = await Promise.allSettled([
      fetchAndParseRSS(urls.local, 'local'),
      fetchAndParseRSS(urls.state, 'state'),
      fetchAndParseRSS(urls.national, 'national')
    ]);

    const fetchErrors = [];
    const fulfilledArticles = [];
    ['local', 'state', 'national'].forEach((tier, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') {
        fulfilledArticles.push(...result.value);
        return;
      }
      fetchErrors.push({ tier, error: String(result.reason?.message || result.reason || 'Unknown fetch error'), at: new Date() });
    });

    const allArticles = deduplicateArticles(fulfilledArticles);
    if (allArticles.length > 0) {
      await updateLocationCache(locationKey, normalized, allArticles, fetchErrors);
      const hydrated = hydrateArticles(allArticles, locationKey);
      const freshResult = { articles: hydrated, cacheHit: false, locationKey, normalizedLocation: normalized };
      memoryCache.set(locationKey, freshResult);
      await logCacheEvent('cache_background_refresh', { locationKey, cacheHit: false, articleCount: hydrated.length, fetchErrors });
    }
  } catch (err) {
    // Background refresh is best-effort; do not propagate errors.
  }
}

async function getArticlesForLocation(locationKey, options = {}) {
  const now = Date.now();
  const forceRefresh = options.forceRefresh === true;

  // 1. Check in-memory LRU cache first (avoids DB round-trip entirely)
  const memCached = memoryCache.get(locationKey);
  if (memCached && !forceRefresh) {
    return memCached;
  }

  // 2. Check MongoDB cache
  const cached = await LocationNewsCache.findOne({ locationKey }).lean();
  const cacheAge = cached?.lastFetchedAt ? (now - new Date(cached.lastFetchedAt).getTime()) : Infinity;
  const isFresh = cacheAge < CACHE_TTL_MS;

  // 3. Fresh cache — return immediately, populate memory cache
  if (cached?.lastFetchedAt && !forceRefresh && isFresh) {
    const hydrated = hydrateArticles(cached.articles || [], locationKey);
    await logCacheEvent('cache_hit', { locationKey, cacheHit: true, articleCount: hydrated.length });
    const result = { articles: hydrated, cacheHit: true, locationKey, normalizedLocation: parseLocationKey(locationKey) };
    memoryCache.set(locationKey, result);
    return result;
  }

  // 4. Stale cache — return stale data immediately, refresh in background
  if (cached?.articles?.length && !forceRefresh) {
    const hydrated = hydrateArticles(cached.articles, locationKey);
    await logCacheEvent('cache_stale_serve', { locationKey, cacheHit: true, articleCount: hydrated.length, stale: true });
    const staleResult = { articles: hydrated, cacheHit: true, stale: true, locationKey, normalizedLocation: parseLocationKey(locationKey) };
    memoryCache.set(locationKey, staleResult);

    // Kick off background refresh (don't await)
    const normalized = options.normalizedLocation || parseLocationKey(locationKey);
    if (normalized) {
      refreshLocationInBackground(locationKey, normalized);
    }
    return staleResult;
  }

  // 5. No cache at all (or forceRefresh) — blocking fetch from RSS
  const normalized = options.normalizedLocation || parseLocationKey(locationKey);
  if (!normalized) {
    return { articles: [], cacheHit: false, locationKey, normalizedLocation: null };
  }

  const urls = buildFeedUrls(normalized);
  const results = await Promise.allSettled([
    fetchAndParseRSS(urls.local, 'local'),
    fetchAndParseRSS(urls.state, 'state'),
    fetchAndParseRSS(urls.national, 'national')
  ]);

  const fetchErrors = [];
  const fulfilledArticles = [];
  ['local', 'state', 'national'].forEach((tier, index) => {
    const result = results[index];
    if (result.status === 'fulfilled') {
      fulfilledArticles.push(...result.value);
      return;
    }
    fetchErrors.push({ tier, error: String(result.reason?.message || result.reason || 'Unknown fetch error'), at: new Date() });
  });

  const allArticles = deduplicateArticles(fulfilledArticles);

  if (allArticles.length > 0) {
    await updateLocationCache(locationKey, normalized, allArticles, fetchErrors);
    const hydrated = hydrateArticles(allArticles, locationKey);
    await logCacheEvent('cache_refresh', { locationKey, cacheHit: false, articleCount: hydrated.length, fetchErrors });
    const freshResult = { articles: hydrated, cacheHit: false, locationKey, normalizedLocation: normalized };
    memoryCache.set(locationKey, freshResult);
    return freshResult;
  }

  if (cached?.articles?.length) {
    const fallbackArticles = hydrateArticles(cached.articles, locationKey);
    await updateLocationCache(locationKey, normalized, cached.articles, fetchErrors);
    await logCacheEvent('cache_stale_fallback', { locationKey, cacheHit: true, articleCount: fallbackArticles.length, fetchErrors });
    return { articles: fallbackArticles, cacheHit: true, stale: true, locationKey, normalizedLocation: normalized };
  }

  await updateLocationCache(locationKey, normalized, [], fetchErrors);
  await logCacheEvent('cache_empty', { locationKey, cacheHit: false, articleCount: 0, fetchErrors });
  return { articles: [], cacheHit: false, locationKey, normalizedLocation: normalized };
}

async function searchCachedArticles(query, options = {}) {
  const search = String(query || '').trim().toLowerCase();
  if (!search) return [];

  const locationKey = options.locationKey ? String(options.locationKey).trim().toLowerCase() : null;
  const cacheDocs = await LocationNewsCache.find(locationKey ? { locationKey } : {}).lean();

  const results = [];
  for (const cacheDoc of cacheDocs) {
    const hydrated = hydrateArticles(cacheDoc.articles || [], cacheDoc.locationKey);
    for (const article of hydrated) {
      const haystack = [article.title, article.source, article.normalizedTitle, article.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (haystack.includes(search)) {
        results.push(article);
      }
    }
  }

  return results.sort((left, right) => {
    const leftPublished = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
    const rightPublished = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
    return rightPublished - leftPublished;
  });
}

async function getCacheMetrics() {
  const now = Date.now();
  const docs = await LocationNewsCache.find({}).lean();
  let totalArticles = 0;
  let staleCount = 0;
  let freshCount = 0;
  let errorCount = 0;

  docs.forEach((doc) => {
    totalArticles += Array.isArray(doc.articles) ? doc.articles.length : 0;
    errorCount += Array.isArray(doc.fetchErrors) ? doc.fetchErrors.length : 0;
    if (!doc.lastFetchedAt || (now - new Date(doc.lastFetchedAt).getTime()) >= CACHE_TTL_MS) staleCount += 1;
    else freshCount += 1;
  });

  return {
    cachedLocations: docs.length,
    totalArticles,
    staleCount,
    freshCount,
    errorCount,
    ttlMs: CACHE_TTL_MS
  };
}

module.exports = {
  CACHE_TTL_MS,
  createArticleId,
  fetchAndParseRSS,
  getArticlesForLocation,
  getCacheMetrics,
  hydrateArticles,
  memoryCache,
  searchCachedArticles
};
