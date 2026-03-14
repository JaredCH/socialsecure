'use strict';

/**
 * newsIngestion.local.js
 *
 * Pipeline 1 — Local / Geo News
 *
 * Fetches Google News RSS search results for a specific city+state.
 * Triggered immediately (fire-and-forget) when a user submits their ZIP code
 * during registration, so local news is ready before they finish signing up.
 * Also runs on a 2-hour interval for all known locations.
 */

const Parser = require('rss-parser');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const ZipLocationIndex = require('../models/ZipLocationIndex');
const { GN_SEARCH } = require('../config/newsCategoryFeeds');
const { calculateViralScore, createMomentumMap } = require('./newsViralScore');

const parser = new Parser({ timeout: 12000, headers: { 'User-Agent': 'SocialSecure-NewsBot/1.0' } });

// Keep a small in-memory set of recently-ingested location keys to avoid
// hammering the same location concurrently from parallel registration events.
const _recentlyTriggered = new Map(); // cityKey → timestamp
const DEBOUNCE_MS = 60 * 1000; // 1 minute

/**
 * Normalise a city name to a stable slug key: "dallas-tx"
 */
const buildCityKey = (city, stateCode) =>
  `${city}-${stateCode}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

/**
 * Resolve a ZIP code to { city, stateCode, country } using ZipLocationIndex.
 * Falls back to null if ZIP is unknown.
 */
async function resolveZip(zipCode) {
  try {
    const entry = await ZipLocationIndex.findOne({ zipCode }).lean();
    if (entry) {
      return {
        city: entry.city,
        stateCode: entry.stateCode || entry.state,
        country: entry.country || 'US',
      };
    }
  } catch (_) { /* ignore */ }
  return null;
}

/**
 * Persist a batch of raw RSS items as Articles in the database.
 * Skips duplicates by normalizedUrlHash.
 */
async function persistArticles(items, pipeline, cityKey, city, stateCode) {
  if (!items.length) return { inserted: 0, duplicates: 0 };

  const momentumMap = createMomentumMap(items, new Date());
  let inserted = 0;
  let duplicates = 0;

  for (const item of items) {
    try {
      const url = item.link || item.guid;
      if (!url) continue;

      const urlHash = crypto
        .createHash('sha256')
        .update(url.toLowerCase().trim())
        .digest('hex')
        .substring(0, 16);

      const existing = await Article.findOne({ normalizedUrlHash: urlHash }).lean();
      if (existing) { duplicates++; continue; }

      const articleData = {
        title: (item.title || '').trim(),
        description: (item.contentSnippet || item.summary || item.content || '').trim().substring(0, 1000),
        source: item.creator || item.author || 'Google News',
        url,
        imageUrl: extractImageUrl(item),
        publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
        category: 'general',
        pipeline,
        cityKey,
        sourceType: 'googleNews',
        feedSource: 'google-news-local',
        normalizedUrlHash: urlHash,
        locationTags: {
          cities: city ? [city.toLowerCase()] : [],
          states: stateCode ? [stateCode.toLowerCase()] : [],
          countries: ['us'],
          zipCodes: [],
          counties: []
        },
        localityLevel: 'city',
        scopeReason: 'city_match',
        scopeConfidence: 0.85,
        ingestTimestamp: new Date(),
      };

      const scored = calculateViralScore(articleData, { momentumMap });
      articleData.viralScore = scored.score;
      articleData.viralSignals = scored.signals;
      articleData.isPromoted = scored.isPromoted;

      await Article.create(articleData);
      inserted++;
    } catch (err) {
      if (err.code !== 11000) {
        console.error('[local-ingest] Article persist error:', err.message);
      } else {
        duplicates++;
      }
    }
  }

  return { inserted, duplicates };
}

function extractImageUrl(item) {
  if (item['media:content']?.$.url) return item['media:content'].$.url;
  if (item.enclosure?.url) return item.enclosure.url;
  if (item['media:thumbnail']?.$.url) return item['media:thumbnail'].$.url;
  // Try to find an img tag in content
  const html = item['content:encoded'] || item.content || '';
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
}

/**
 * Ingest local news for a specific city/state combo.
 * Fetches Google News RSS with a 2-day window.
 */
async function ingestLocalNews(city, stateCode, country = 'US') {
  if (!city || !stateCode) return { skipped: true, reason: 'missing_location' };
  if (mongoose.connection?.readyState !== 1) return { skipped: true, reason: 'db_not_ready' };

  const cityKey = buildCityKey(city, stateCode);
  const query = `"${city}" ${stateCode} news when:2d`;
  const feedUrl = GN_SEARCH(query);

  let items = [];
  try {
    const feed = await parser.parseURL(feedUrl);
    items = feed.items || [];
  } catch (err) {
    console.warn(`[local-ingest] RSS fetch failed for ${cityKey}:`, err.message);
    return { cityKey, inserted: 0, error: err.message };
  }

  const { inserted, duplicates } = await persistArticles(items, 'local', cityKey, city, stateCode);
  console.log(`[local-ingest] ${cityKey}: ${inserted} inserted, ${duplicates} duplicates (${items.length} fetched)`);
  return { cityKey, inserted, duplicates, fetched: items.length };
}

/**
 * Non-blocking trigger: called at registration time with the user's ZIP code.
 * Resolves ZIP → city/state, then fires ingestLocalNews in the background.
 * Returns immediately without awaiting the ingest.
 */
async function triggerLocationIngest(zipCode) {
  if (!zipCode) return { status: 'skipped', reason: 'no_zip' };

  const cacheKey = zipCode.trim();
  const lastTriggered = _recentlyTriggered.get(cacheKey);
  if (lastTriggered && Date.now() - lastTriggered < DEBOUNCE_MS) {
    return { status: 'debounced', zipCode: cacheKey };
  }
  _recentlyTriggered.set(cacheKey, Date.now());

  // Resolve ZIP in background — do not await
  setImmediate(async () => {
    try {
      const loc = await resolveZip(cacheKey);
      if (!loc) {
        console.warn(`[local-ingest] Cannot resolve ZIP ${cacheKey} — no index entry`);
        return;
      }
      await ingestLocalNews(loc.city, loc.stateCode, loc.country);
    } catch (err) {
      console.error('[local-ingest] triggerLocationIngest error:', err.message);
    }
  });

  return { status: 'queued', zipCode: cacheKey };
}

/**
 * Ingest local news for all distinct city keys that have at least one user
 * who registered from that location.
 * Called by the 2-hour scheduler.
 */
async function ingestAllKnownLocations() {
  if (mongoose.connection?.readyState !== 1) {
    console.warn('[local-ingest] DB not ready — skipping batch run');
    return;
  }

  const User = require('../models/User');

  // Gather distinct city/state pairs from users who have a ZIP code
  const locations = await User.aggregate([
    { $match: { zipCode: { $exists: true, $ne: null }, city: { $exists: true, $nin: [null, ''] } } },
    { $group: { _id: { city: '$city', state: '$state' } } },
    { $limit: parseInt(process.env.NEWS_LOCAL_MAX_LOCATIONS || '100', 10) }
  ]).allowDiskUse(true).exec();

  console.log(`[local-ingest] Batch run: ${locations.length} distinct locations`);

  for (const loc of locations) {
    const { city, state } = loc._id;
    if (!city || !state) continue;
    try {
      await ingestLocalNews(city, state);
      // Small delay to avoid hammering Google
      await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
    } catch (err) {
      console.error(`[local-ingest] Batch error for ${city},${state}:`, err.message);
    }
  }
}

module.exports = {
  triggerLocationIngest,
  ingestLocalNews,
  ingestAllKnownLocations,
  buildCityKey,
};
