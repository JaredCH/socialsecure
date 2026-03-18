'use strict';

const { CACHE_TTL_MS, getArticlesForLocation } = require('./locationCacheService');
const { preloadCommonLocations } = require('./locationPreloader');

const LocationNewsCache = require('../models/LocationNewsCache');

const REFRESH_LEAD_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = CACHE_TTL_MS - REFRESH_LEAD_MS;
let schedulerHandle = null;
let schedulerStartedAt = null;
let lastRefreshRunAt = null;

async function refreshAllCachedLocations({ force = false } = {}) {
  const staleCutoff = new Date(Date.now() - REFRESH_INTERVAL_MS);
  const query = force ? {} : {
    $or: [
      { lastFetchedAt: { $lt: staleCutoff } },
      { lastFetchedAt: null }
    ]
  };

  const staleLocations = await LocationNewsCache.find(query).select('locationKey').lean();
  for (const location of staleLocations) {
    await getArticlesForLocation(location.locationKey, { forceRefresh: true });
  }
  lastRefreshRunAt = new Date();
  return { refreshed: staleLocations.length, lastRefreshRunAt };
}

function startCacheRefreshScheduler() {
  if (schedulerHandle) return;
  schedulerStartedAt = new Date();
  schedulerHandle = setInterval(() => {
    refreshAllCachedLocations().catch((error) => {
      console.error('[news-cache] refresh scheduler error:', error);
    });
  }, REFRESH_INTERVAL_MS);

  setTimeout(() => {
    preloadCommonLocations().catch((error) => {
      console.error('[news-cache] preload error:', error);
    });
  }, 5000);
}

function getCacheSchedulerState() {
  const nextRunAt = schedulerHandle
    ? new Date((lastRefreshRunAt || schedulerStartedAt || new Date()).getTime() + REFRESH_INTERVAL_MS)
    : null;

  return {
    schedulerRunning: Boolean(schedulerHandle),
    schedulerStartedAt,
    lastRefreshRunAt,
    nextRunAt,
    intervalMs: REFRESH_INTERVAL_MS,
    msUntilNextRun: nextRunAt ? Math.max(0, nextRunAt.getTime() - Date.now()) : null
  };
}

module.exports = {
  REFRESH_INTERVAL_MS,
  getCacheSchedulerState,
  refreshAllCachedLocations,
  startCacheRefreshScheduler
};
