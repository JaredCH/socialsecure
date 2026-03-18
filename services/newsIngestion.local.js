'use strict';

const User = require('../models/User');
const { normalizeLocationInput } = require('./locationNormalizer');
const { getArticlesForLocation } = require('./locationCacheService');

const _recentlyTriggered = new Map();
const DEBOUNCE_MS = 60 * 1000;

const buildCityKey = (city, stateCode) =>
  `${String(city || '').trim()}-${String(stateCode || '').trim()}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');

async function ingestLocalNews(city, stateCode, country = 'US') {
  const normalized = await normalizeLocationInput({ city, state: stateCode, country });
  if (!normalized?.locationKey) {
    return { skipped: true, reason: 'missing_location' };
  }

  const result = await getArticlesForLocation(normalized.locationKey, {
    forceRefresh: true,
    normalizedLocation: normalized
  });

  return {
    locationKey: normalized.locationKey,
    cityKey: buildCityKey(city, stateCode),
    fetched: result.articles.length,
    inserted: result.articles.length,
    duplicates: 0,
    cacheHit: result.cacheHit
  };
}

async function triggerLocationIngest(zipCode) {
  if (!zipCode) return { status: 'skipped', reason: 'no_zip' };
  const cacheKey = String(zipCode).trim();
  const lastTriggered = _recentlyTriggered.get(cacheKey);
  if (lastTriggered && (Date.now() - lastTriggered) < DEBOUNCE_MS) {
    return { status: 'debounced', zipCode: cacheKey };
  }

  _recentlyTriggered.set(cacheKey, Date.now());
  setImmediate(async () => {
    try {
      const normalized = await normalizeLocationInput({ zipCode: cacheKey, country: 'US' });
      if (!normalized?.locationKey) return;
      await getArticlesForLocation(normalized.locationKey, {
        forceRefresh: true,
        normalizedLocation: normalized
      });
    } catch (error) {
      // Best-effort trigger.
    }
  });

  return { status: 'queued', zipCode: cacheKey };
}

async function ingestAllKnownLocations() {
  const users = await User.find({
    $or: [
      { zipCode: { $exists: true, $ne: null } },
      { city: { $exists: true, $nin: [null, ''] } }
    ]
  }).select('city state zipCode country').lean();

  const seen = new Set();
  const results = [];
  for (const user of users) {
    const normalized = await normalizeLocationInput(user || {});
    if (!normalized?.locationKey || seen.has(normalized.locationKey)) continue;
    seen.add(normalized.locationKey);
    results.push(await getArticlesForLocation(normalized.locationKey, {
      forceRefresh: true,
      normalizedLocation: normalized
    }));
  }

  return { ok: true, locations: results.length };
}

module.exports = {
  triggerLocationIngest,
  ingestLocalNews,
  ingestAllKnownLocations,
  buildCityKey,
};
