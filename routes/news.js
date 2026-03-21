'use strict';

/**
 * routes/news.js  — Clean rewrite
 *
 * Exposes four ingestion pipelines and a priority-stack feed to the client.
 *
 *  Pipeline 1 · Local/Geo        → services/newsIngestion.local.js
 *  Pipeline 2 · Category RSS     → services/newsIngestion.categories.js
 *  Pipeline 3 · Sports Teams     → services/newsIngestion.sports.js
 *  Pipeline 4 · Reddit Social    → services/newsIngestion.social.js
 *  Feed builder                  → services/newsFeedBuilder.js
 *
 * Weather endpoints are migrated from the old monolith and extended with
 * UV Index, AQI, and pollen data from the Open-Meteo Air Quality API.
 */

const https = require('https');
const crypto = require('crypto');

const express = require('express');

const {
  requireAuth: authenticateToken,
  authErrorHandler
} = require('../middleware/parseAuthToken');
const { getTeamSchedules, getLeagueStatusMap, getAllLeagueStatuses } = require('../services/sportsScheduleIngestion');
const { SPORTS_TEAMS: SPORTS_CATALOG } = require('../data/news/sportsTeamLocationIndex');
const { CATEGORY_FEEDS, CATEGORY_ORDER } = require('../config/newsCategoryFeeds');
const { canonicalizeStateCode, getLocationTaxonomyPayload } = require('../utils/newsLocationTaxonomy');
const { resolveZipLocation, resolveZipLocationByCityState } = require('../services/zipLocationIndex');
const { getArticlesForLocation, getCacheMetrics, searchCachedArticles } = require('../services/locationCacheService');
const { normalizeLocationInput, resolvePrimaryLocation } = require('../services/locationNormalizer');
const { REFRESH_INTERVAL_MS, getCacheSchedulerState, refreshAllCachedLocations, startCacheRefreshScheduler } = require('../services/cacheRefreshWorker');
const { preloadCommonLocations } = require('../services/locationPreloader');
const { ingestAllKnownLocations } = require('../services/newsIngestion.local');
const { ingestAllCategories } = require('../services/newsIngestion.categories');
const { ingestAllFollowedTeams } = require('../services/newsIngestion.sports');
const { ingestAllMonitoredSubreddits } = require('../services/newsIngestion.social');

const NewsPreferences = require('../models/NewsPreferences');
const User = require('../models/User');
const Article = require('../models/Article');
const ArticleImpression = require('../models/ArticleImpression');
const NewsIngestionRecord = require('../models/NewsIngestionRecord');

const router = express.Router();

// ---------------------------------------------------------------------------
// Weather constants
// ---------------------------------------------------------------------------
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;   // 10 minutes
const WEATHER_WIDGET_REFRESH_SECONDS = 600;
const WEATHER_HOURLY_WINDOW_LIMIT = 24;
const OPEN_METEO_FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const weatherCache = new Map();
const weatherCacheMetrics = { hits: 0, misses: 0, errors: 0, totalLatencyMs: 0, fetchCount: 0 };
const US_ZIP_REGEX = /^\d{5}(?:-\d{4})?$/;

const OPEN_METEO_WEATHER_CODE_MAP = {
  0: { description: 'Clear sky', icon: 'sun' },
  1: { description: 'Mainly clear', icon: 'sun' },
  2: { description: 'Partly cloudy', icon: 'cloud-sun' },
  3: { description: 'Overcast', icon: 'cloud' },
  45: { description: 'Fog', icon: 'cloud-fog' },
  48: { description: 'Depositing rime fog', icon: 'cloud-fog' },
  51: { description: 'Light drizzle', icon: 'cloud-drizzle' },
  53: { description: 'Drizzle', icon: 'cloud-drizzle' },
  55: { description: 'Dense drizzle', icon: 'cloud-drizzle' },
  56: { description: 'Light freezing drizzle', icon: 'cloud-snow' },
  57: { description: 'Freezing drizzle', icon: 'cloud-snow' },
  61: { description: 'Slight rain', icon: 'cloud-rain' },
  63: { description: 'Rain', icon: 'cloud-rain' },
  65: { description: 'Heavy rain', icon: 'cloud-rain' },
  66: { description: 'Light freezing rain', icon: 'cloud-rain' },
  67: { description: 'Freezing rain', icon: 'cloud-rain' },
  71: { description: 'Slight snow', icon: 'cloud-snow' },
  73: { description: 'Snow', icon: 'cloud-snow' },
  75: { description: 'Heavy snow', icon: 'cloud-snow' },
  77: { description: 'Snow grains', icon: 'cloud-snow' },
  80: { description: 'Rain showers', icon: 'cloud-rain' },
  81: { description: 'Rain showers', icon: 'cloud-rain' },
  82: { description: 'Violent rain showers', icon: 'cloud-rain' },
  85: { description: 'Snow showers', icon: 'cloud-snow' },
  86: { description: 'Heavy snow showers', icon: 'cloud-snow' },
  95: { description: 'Thunderstorm', icon: 'cloud-lightning' },
  96: { description: 'Thunderstorm with hail', icon: 'cloud-lightning' },
  99: { description: 'Severe thunderstorm with hail', icon: 'cloud-lightning' }
};

const getOpenMeteoWeatherDescriptor = (code) =>
  OPEN_METEO_WEATHER_CODE_MAP[Number(code)] || { description: 'Unknown conditions', icon: 'cloud' };

function normalizeUSState(value) {
  return canonicalizeStateCode(value);
}

function normalizeCategoryKey(value) {
  return String(value || '').trim().toLowerCase();
}

function filterCachedArticles(articles = [], { tier = null, category = null, maxAgeHours = null } = {}) {
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

async function resolveFeedLocationForUser(userId, overrideLocation = null) {
  if (overrideLocation && (overrideLocation.city || overrideLocation.state || overrideLocation.zipCode)) {
    return normalizeLocationInput(overrideLocation);
  }

  // Single parallel fetch — both queries are independent
  const [prefs, user] = await Promise.all([
    NewsPreferences.findOne({ user: userId }).lean(),
    User.findById(userId).select('city state zipCode country').lean()
  ]);

  const primaryLocation = (prefs?.locations || []).find((location) => location.isPrimary) || (prefs?.locations || [])[0] || null;
  if (primaryLocation) {
    return resolvePrimaryLocation(primaryLocation, null);
  }

  return resolvePrimaryLocation(null, user);
}

function buildCacheSourceDescriptors(metrics = {}) {
  const health = metrics.freshCount > 0 ? 'green' : (metrics.cachedLocations > 0 ? 'yellow' : 'unknown');
  const healthReason = metrics.freshCount > 0
    ? 'Cache warm'
    : metrics.cachedLocations > 0
      ? 'Refreshing cached locations'
      : 'No cached locations yet';

  return [
    {
      id: 'google-news',
      name: 'Google News Cache',
      type: 'googleNews',
      url: 'https://news.google.com/rss',
      health,
      healthReason,
      wired: true,
      enabled: true,
      categories: ['local', 'state', 'national']
    },
    {
      id: 'google-news-local',
      name: 'Google News Local',
      type: 'googleNews',
      url: 'https://news.google.com/rss/search',
      health,
      healthReason: 'Location-based RSS search',
      wired: false,
      enabled: true,
      categories: ['local']
    },
    {
      id: 'google-news-state',
      name: 'Google News State',
      type: 'googleNews',
      url: 'https://news.google.com/rss/search',
      health,
      healthReason: 'Statewide RSS search',
      wired: false,
      enabled: true,
      categories: ['state']
    },
    {
      id: 'google-news-national',
      name: 'Google News National',
      type: 'googleNews',
      url: 'https://news.google.com/rss',
      health,
      healthReason: 'National RSS headlines',
      wired: false,
      enabled: true,
      categories: ['national']
    }
  ];
}

function classifySourceHealth(source = {}, now = new Date()) {
  const lastFetchAt = source.lastFetchAt ? new Date(source.lastFetchAt) : null;
  const status = String(source.lastFetchStatus || '').toLowerCase();

  if (!lastFetchAt || Number.isNaN(lastFetchAt.getTime())) {
    return { health: 'unknown', healthReason: 'Never fetched' };
  }

  if (status === 'error') {
    return {
      health: 'red',
      healthReason: source.lastError || 'Last fetch failed'
    };
  }

  const ageMs = now.getTime() - lastFetchAt.getTime();
  const staleThresholdMs = 4 * 60 * 60 * 1000;
  if (status === 'success' && ageMs <= staleThresholdMs) {
    return { health: 'green', healthReason: 'Healthy' };
  }

  return {
    health: 'yellow',
    healthReason: 'Stale source health data'
  };
}

// ---------------------------------------------------------------------------
// Weather helpers
// ---------------------------------------------------------------------------
function buildWeatherCacheKey(lat, lon) {
  return `weather:${Number(lat).toFixed(2)}:${Number(lon).toFixed(2)}`;
}

function parseLocalDateTimeParts(value) {
  const match = String(value || '').trim().match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0)
  };
}

function buildLocalDateTimeKey(parts) {
  if (!parts) return null;

  const year = String(parts.year).padStart(4, '0');
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function getTimeZoneLocalDateTimeParts(date, timeZone) {
  if (!timeZone) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const formattedParts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number(formattedParts.year),
    month: Number(formattedParts.month),
    day: Number(formattedParts.day),
    hour: Number(formattedParts.hour),
    minute: Number(formattedParts.minute),
    second: Number(formattedParts.second)
  };
}

function getNextTopOfHourKey(parts) {
  if (!parts) return null;

  const roundedHour = (parts.minute > 0 || parts.second > 0)
    ? parts.hour + 1
    : parts.hour;
  const dayCursor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  dayCursor.setUTCDate(dayCursor.getUTCDate() + Math.floor(roundedHour / 24));

  return buildLocalDateTimeKey({
    year: dayCursor.getUTCFullYear(),
    month: dayCursor.getUTCMonth() + 1,
    day: dayCursor.getUTCDate(),
    hour: roundedHour % 24,
    minute: 0
  });
}

function getUpcomingHourlyForecastWindow(hourlyTime, { currentTime = null, timeZone = null, now = null, limit = WEATHER_HOURLY_WINDOW_LIMIT } = {}) {
  if (!Array.isArray(hourlyTime) || hourlyTime.length === 0) return [];

  const normalizedHourly = hourlyTime
    .map((time, index) => {
      const parts = parseLocalDateTimeParts(time);
      if (!parts) return null;
      return { time, index, key: buildLocalDateTimeKey(parts) };
    })
    .filter(Boolean);

  if (normalizedHourly.length === 0) return [];

  const effectiveNow = now || new Date();
  const referenceParts =
    parseLocalDateTimeParts(currentTime) ||
    getTimeZoneLocalDateTimeParts(effectiveNow, timeZone);
  const startKey = getNextTopOfHourKey(referenceParts);

  const upcoming = startKey
    ? normalizedHourly.filter(({ key }) => key >= startKey)
    : normalizedHourly;

  return (upcoming.length > 0 ? upcoming : normalizedHourly).slice(0, limit);
}

const parseCoordinateQuery = (value = '') => {
  const match = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
};

async function fetchJsonWithTimeout(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'SocialSecure-Weather/1.0', 'Accept': 'application/json' },
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

async function fetchOpenMeteoGeocode(query, count = 8) {
  const encoded = encodeURIComponent(String(query || '').trim());
  if (!encoded) return [];
  const url = `${OPEN_METEO_GEOCODING_BASE}?name=${encoded}&count=${Math.max(1, Math.min(count, 20))}&language=en&format=json`;
  const data = await fetchJsonWithTimeout(url, 7000);
  return Array.isArray(data?.results) ? data.results : [];
}

async function resolveWeatherLocationCoordinates(locObj = {}) {
  const normalizedZip = String(locObj.zipCode || '').trim();

  if (normalizedZip && US_ZIP_REGEX.test(normalizedZip)) {
    const zipLocation = await resolveZipLocation(normalizedZip, { allowGeocode: true, persist: true });
    if (zipLocation?.latitude != null && zipLocation?.longitude != null) {
      return {
        lat: Number(zipLocation.latitude),
        lon: Number(zipLocation.longitude),
        label: locObj.label || [zipLocation.city, zipLocation.stateCode || zipLocation.state, zipLocation.zipCode].filter(Boolean).join(', '),
        city: zipLocation.city || locObj.city || null,
        state: zipLocation.state || locObj.state || null,
        country: zipLocation.country || locObj.country || null,
        countryCode: zipLocation.countryCode || locObj.countryCode || null,
        timezone: locObj.timezone || null,
        zipCode: zipLocation.zipCode || normalizedZip
      };
    }
  }

  if (locObj.city && (locObj.state || locObj.countryCode || locObj.country)) {
    const cityStateLocation = await resolveZipLocationByCityState(
      {
        city: locObj.city,
        state: locObj.state,
        countryCode: locObj.countryCode || locObj.country
      },
      { allowGeocode: true, persist: true }
    );
    if (cityStateLocation?.latitude != null && cityStateLocation?.longitude != null) {
      return {
        lat: Number(cityStateLocation.latitude),
        lon: Number(cityStateLocation.longitude),
        label: locObj.label || [cityStateLocation.city, cityStateLocation.stateCode || cityStateLocation.state, cityStateLocation.zipCode].filter(Boolean).join(', '),
        city: cityStateLocation.city || locObj.city || null,
        state: cityStateLocation.state || locObj.state || null,
        country: cityStateLocation.country || locObj.country || null,
        countryCode: cityStateLocation.countryCode || locObj.countryCode || null,
        timezone: locObj.timezone || null,
        zipCode: locObj.zipCode || cityStateLocation.zipCode || null
      };
    }
  }

  if (Number.isFinite(Number(locObj.lat)) && Number.isFinite(Number(locObj.lon))) {
    return {
      lat: Number(locObj.lat),
      lon: Number(locObj.lon),
      label: locObj.label || [locObj.city, locObj.state, locObj.country].filter(Boolean).join(', '),
      city: locObj.city || null,
      state: locObj.state || null,
      country: locObj.country || null,
      countryCode: locObj.countryCode || null,
      timezone: locObj.timezone || null,
      zipCode: normalizedZip || null
    };
  }

  const query = String(
    locObj.query || locObj.label ||
    [locObj.city, locObj.state, locObj.zipCode, locObj.country].filter(Boolean).join(' ')
  ).trim();
  if (!query) return null;

  const coords = parseCoordinateQuery(query);
  if (coords) {
    return {
      ...coords,
      label: locObj.label || query,
      city: locObj.city || null,
      state: locObj.state || null,
      country: locObj.country || null,
      countryCode: locObj.countryCode || null,
      timezone: locObj.timezone || null,
      zipCode: normalizedZip || null
    };
  }

  const results = await fetchOpenMeteoGeocode(query, 1);
  const top = results[0];
  if (!top) return null;

  return {
    lat: Number(top.latitude),
    lon: Number(top.longitude),
    label: locObj.label || [top.name, top.admin1, top.country].filter(Boolean).join(', '),
    city: top.name || locObj.city || null,
    state: top.admin1 || locObj.state || null,
    country: top.country || locObj.country || null,
    countryCode: top.country_code || locObj.countryCode || null,
    timezone: top.timezone || null,
    zipCode: normalizedZip || null
  };
}

function applyResolvedWeatherFields(target, resolved) {
  if (!target || !resolved) return false;

  let changed = false;
  const nextValues = {
    label: resolved.label || target.label || null,
    city: resolved.city || target.city || null,
    state: resolved.state || target.state || null,
    country: resolved.country || target.country || null,
    countryCode: resolved.countryCode || target.countryCode || null,
    zipCode: resolved.zipCode || target.zipCode || null,
    lat: Number.isFinite(Number(resolved.lat)) ? Number(resolved.lat) : (Number.isFinite(Number(target.lat)) ? Number(target.lat) : null),
    lon: Number.isFinite(Number(resolved.lon)) ? Number(resolved.lon) : (Number.isFinite(Number(target.lon)) ? Number(target.lon) : null),
    timezone: resolved.timezone || target.timezone || null
  };

  Object.entries(nextValues).forEach(([key, value]) => {
    const currentValue = target[key] ?? null;
    if (currentValue !== value) {
      target[key] = value;
      changed = true;
    }
  });

  return changed;
}

async function backfillWeatherLocations(preferences) {
  if (!preferences || !Array.isArray(preferences.weatherLocations) || preferences.weatherLocations.length === 0) {
    return preferences;
  }

  let changed = false;
  for (const location of preferences.weatherLocations) {
    if (Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lon))) continue;
    const resolved = await resolveWeatherLocationCoordinates(location?.toObject ? location.toObject() : location);
    if (resolved) {
      changed = applyResolvedWeatherFields(location, resolved) || changed;
    }
  }

  if (changed && typeof preferences.save === 'function') {
    await preferences.save();
  }

  return preferences;
}

/**
 * Fetch forecast + air-quality (UV, AQI, pollen) in parallel for a single location.
 * Returns the merged weather object with new uvIndex / airQuality / pollen fields.
 */
async function fetchWeatherForLocation(locObj) {
  const resolved = await resolveWeatherLocationCoordinates(locObj);
  if (!resolved?.lat || !resolved?.lon) {
    return { weather: null, error: 'Unable to resolve weather data for this location', cacheHit: false, resolved: null };
  }

  const cacheKey = buildWeatherCacheKey(resolved.lat, resolved.lon);
  const cached = weatherCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < WEATHER_CACHE_TTL_MS) {
    weatherCacheMetrics.hits++;
    return { weather: cached.weather, error: null, cacheHit: true, resolved };
  }

  weatherCacheMetrics.misses++;
  const startMs = Date.now();

  try {
    const forecastUrl = `${OPEN_METEO_FORECAST_BASE}?latitude=${encodeURIComponent(resolved.lat)}&longitude=${encodeURIComponent(resolved.lon)}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,surface_pressure,weather_code&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&forecast_days=7&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;
    const aqUrl = `${OPEN_METEO_AIR_QUALITY_BASE}?latitude=${encodeURIComponent(resolved.lat)}&longitude=${encodeURIComponent(resolved.lon)}&current=us_aqi,uv_index,grass_pollen,birch_pollen,ragweed_pollen&timezone=auto`;

    const [forecast, aq] = await Promise.allSettled([
      fetchJsonWithTimeout(forecastUrl, 8000),
      fetchJsonWithTimeout(aqUrl, 6000)
    ]);

    const fc = forecast.status === 'fulfilled' ? forecast.value : {};
    const aqData = aq.status === 'fulfilled' ? aq.value?.current : null;

    const current = fc?.current || {};
    const hourlyTime = Array.isArray(fc?.hourly?.time) ? fc.hourly.time : [];
    const dailyTime = Array.isArray(fc?.daily?.time) ? fc.daily.time : [];

    const currentDescriptor = getOpenMeteoWeatherDescriptor(current.weather_code);

    const hourlyWindow = getUpcomingHourlyForecastWindow(hourlyTime, {
      currentTime: current.time,
      timeZone: fc?.timezone || resolved?.timezone || null,
      now: new Date(),
      limit: WEATHER_HOURLY_WINDOW_LIMIT
    });

    const hourly = hourlyWindow.map(({ time, index }) => {
      const descriptor = getOpenMeteoWeatherDescriptor(fc?.hourly?.weather_code?.[index]);
      return {
        time,
        temperature: fc?.hourly?.temperature_2m?.[index] ?? null,
        humidity: fc?.hourly?.relative_humidity_2m?.[index] ?? null,
        windSpeed: fc?.hourly?.wind_speed_10m?.[index] ?? null,
        windGust: fc?.hourly?.wind_gusts_10m?.[index] ?? null,
        precipitationProbability: fc?.hourly?.precipitation_probability?.[index] ?? null,
        shortForecast: descriptor.description,
        icon: descriptor.icon
      };
    });

    const weekly = dailyTime.slice(0, 5).map((time, idx) => {
      const descriptor = getOpenMeteoWeatherDescriptor(fc?.daily?.weather_code?.[idx]);
      return {
        date: time,
        name: new Date(time).toLocaleDateString('en-US', { weekday: 'short' }),
        high: fc?.daily?.temperature_2m_max?.[idx] ?? null,
        low: fc?.daily?.temperature_2m_min?.[idx] ?? null,
        sunrise: fc?.daily?.sunrise?.[idx] ?? null,
        sunset: fc?.daily?.sunset?.[idx] ?? null,
        precipitationProbability: fc?.daily?.precipitation_probability_max?.[idx] ?? null,
        shortForecast: descriptor.description,
        icon: descriptor.icon
      };
    });

    // UV Index
    const uvIndex = aqData?.uv_index ?? null;

    // AQI with human-readable label
    const usAqi = aqData?.us_aqi ?? null;
    let aqiLabel = null;
    if (usAqi !== null) {
      if (usAqi <= 50) aqiLabel = 'Good';
      else if (usAqi <= 100) aqiLabel = 'Moderate';
      else if (usAqi <= 150) aqiLabel = 'Unhealthy for Sensitive Groups';
      else if (usAqi <= 200) aqiLabel = 'Unhealthy';
      else if (usAqi <= 300) aqiLabel = 'Very Unhealthy';
      else aqiLabel = 'Hazardous';
    }

    // Pollen (µg/m³ — show null when not available)
    const pollen = {
      grass: aqData?.grass_pollen ?? null,
      birch: aqData?.birch_pollen ?? null,
      ragweed: aqData?.ragweed_pollen ?? null
    };
    const hasPollenData = Object.values(pollen).some((v) => v !== null && v > 0);

    const weather = {
      provider: 'open-meteo',
      current: {
        temperature: current.temperature_2m ?? null,
        temperatureUnit: 'F',
        humidity: current.relative_humidity_2m ?? null,
        windSpeed: current.wind_speed_10m ?? null,
        windGust: current.wind_gusts_10m ?? null,
        pressure: current.surface_pressure ?? null,
        precipitationProbability: hourly[0]?.precipitationProbability ?? null,
        weatherCode: current.weather_code ?? null,
        shortForecast: currentDescriptor.description,
        icon: currentDescriptor.icon
      },
      high: fc?.daily?.temperature_2m_max?.[0] ?? null,
      low: fc?.daily?.temperature_2m_min?.[0] ?? null,
      hourly,
      weekly,
      forecastSummary: weekly[0]?.shortForecast || currentDescriptor.description,
      sunrise: fc?.daily?.sunrise?.[0] ?? null,
      sunset: fc?.daily?.sunset?.[0] ?? null,
      uvIndex,
      airQuality: usAqi !== null ? { index: usAqi, label: aqiLabel } : null,
      pollen: hasPollenData ? pollen : null,
      updatedAt: new Date().toISOString(),
      refreshIntervalSeconds: WEATHER_WIDGET_REFRESH_SECONDS
    };

    weatherCacheMetrics.totalLatencyMs += Date.now() - startMs;
    weatherCacheMetrics.fetchCount++;
    weatherCache.set(cacheKey, { weather, timestamp: Date.now() });
    return { weather, error: null, cacheHit: false, resolved };
  } catch (fetchErr) {
    weatherCacheMetrics.errors++;
    return { weather: null, error: 'Weather service temporarily unavailable', cacheHit: false, resolved };
  }
}

// ---------------------------------------------------------------------------
// Category metadata (icons + colors used by the frontend)
// ---------------------------------------------------------------------------
const CATEGORY_META = {
  technology:    { icon: 'cpu',           color: '#3b82f6' },
  science:       { icon: 'flask',         color: '#8b5cf6' },
  health:        { icon: 'heart-pulse',   color: '#ef4444' },
  business:      { icon: 'briefcase',     color: '#f59e0b' },
  sports:        { icon: 'trophy',        color: '#22c55e' },
  entertainment: { icon: 'film',          color: '#ec4899' },
  politics:      { icon: 'landmark',      color: '#6366f1' },
  finance:       { icon: 'trending-up',   color: '#14b8a6' },
  gaming:        { icon: 'gamepad-2',     color: '#a855f7' },
  ai:            { icon: 'bot',           color: '#06b6d4' },
  world:         { icon: 'globe',         color: '#64748b' },
  general:       { icon: 'newspaper',     color: '#78716c' },
  war:           { icon: 'shield-alert',  color: '#dc2626' },
  marijuana:     { icon: 'leaf',          color: '#16a34a' },
  conspiracy:    { icon: 'eye',           color: '#7c3aed' },
  space:         { icon: 'rocket',        color: '#1e40af' },
  ocean:         { icon: 'waves',         color: '#0891b2' },
  nature:        { icon: 'tree-pine',     color: '#15803d' },
  programming:   { icon: 'code-2',        color: '#0f172a' },
  breaking:      { icon: 'zap',           color: '#f97316' }
};

// ---------------------------------------------------------------------------
// Admin guard (same X-Admin-API-Key pattern used across routes/admin.js)
// ---------------------------------------------------------------------------
function requireAdminApiKey(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(503).json({ error: 'Admin API not configured' });
  const provided = String(req.headers['x-admin-api-key'] || '');
  if (!provided) return res.status(401).json({ error: 'Admin API key required' });
  // Pad to equal length before constant-time comparison to avoid length-oracle
  const secretBuf = Buffer.from(secret);
  const providedBuf = Buffer.alloc(secretBuf.length);
  providedBuf.write(provided.slice(0, secretBuf.length));
  let valid = false;
  try { valid = crypto.timingSafeEqual(secretBuf, providedBuf); } catch { valid = false; }
  if (!valid || provided.length !== secret.length) return res.status(403).json({ error: 'Invalid admin API key' });
  next();
}

async function requireAdminUser(req, res, next) {
  try {
    const requester = await User.findById(req.user.userId).select('_id isAdmin');
    if (!requester?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return next();
  } catch (error) {
    console.error('Error validating admin access:', error);
    return res.status(500).json({ error: 'Failed to validate admin access' });
  }
}

// ===========================================================================
// NEWS FEED ROUTES
// ===========================================================================

/**
 * GET /api/news/feed
 * Returns the priority-stack feed for the authenticated user.
 * Query params: category, page, limit, teamIds (comma-separated),
 *               country, state, city (region filter)
 */
router.get('/feed', authenticateToken, async (req, res) => {
  try {
    const { category, page = 1, limit = 20, tier, maxAgeHours, country, state, city, zipCode } = req.query;
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(parseInt(limit, 10) || 20, 50);

    const normalizedLocation = await resolveFeedLocationForUser(req.user.userId, { country, state, city, zipCode });
    if (!normalizedLocation?.locationKey) {
      return res.json({
        articles: [],
        pagination: { page: 1, pages: 0, total: 0 },
        location: null,
        message: 'No location set',
        sections: { keyword: [], local: [], state: [], national: [], trending: [] },
        feed: []
      });
    }

    const cacheResult = await getArticlesForLocation(normalizedLocation.locationKey, { normalizedLocation });
    let filteredArticles = filterCachedArticles(cacheResult.articles, { tier, category, maxAgeHours });

    // When a specific category is requested, supplement with articles from the
    // category ingestion pipeline (Pipeline 2) stored in the Article collection.
    const normalizedCat = normalizeCategoryKey(category);
    if (normalizedCat && normalizedCat !== 'all') {
      const catQuery = { category: normalizedCat, isActive: true };
      if (maxAgeHours) {
        catQuery.publishedAt = { $gte: new Date(Date.now() - Number(maxAgeHours) * 60 * 60 * 1000) };
      }
      const categoryArticles = await Article.find(catQuery)
        .sort({ publishedAt: -1 })
        .limit(100)
        .lean();

      const existingUrls = new Set(filteredArticles.map((a) => (a.url || a.link || '').toLowerCase()));
      const mapped = categoryArticles
        .filter((a) => !existingUrls.has((a.url || '').toLowerCase()))
        .map((a) => ({
          ...a,
          link: a.url,
          tier: a.localityLevel === 'city' || a.localityLevel === 'county' ? 'local'
            : a.localityLevel === 'state' ? 'state' : 'national',
        }));

      filteredArticles = [...filteredArticles, ...mapped]
        .sort((a, b) => {
          const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return bTime - aTime;
        });
    }

    const start = (safePage - 1) * safeLimit;
    const pageArticles = filteredArticles.slice(start, start + safeLimit);

    res.json({
      articles: pageArticles,
      pagination: {
        page: safePage,
        pages: Math.ceil(filteredArticles.length / safeLimit),
        total: filteredArticles.length
      },
      location: {
        locationKey: cacheResult.locationKey,
        cacheHit: cacheResult.cacheHit,
        ...normalizedLocation
      },
      message: filteredArticles.length === 0 ? 'No articles available for this location' : undefined,
      sections: safePage === 1 ? {
        keyword: [],
        local: filteredArticles.filter((article) => article.tier === 'local').slice(0, 6),
        state: filteredArticles.filter((article) => article.tier === 'state').slice(0, 4),
        national: filteredArticles.filter((article) => article.tier === 'national').slice(0, 4),
        trending: []
      } : { keyword: [], local: [], state: [], national: [], trending: [] },
      feed: pageArticles,
      triggeredIngest: false
    });
  } catch (error) {
    console.error('Error building news feed:', error);
    res.status(500).json({ error: 'Failed to build news feed' });
  }
});

/**
 * GET /api/news/categories
 * Returns the 20 category list with metadata for the pill bar.
 */
router.get('/categories', authenticateToken, (req, res) => {
  const categories = CATEGORY_ORDER.map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    ...((CATEGORY_META[key]) || { icon: 'newspaper', color: '#64748b' }),
    feedCount: (CATEGORY_FEEDS[key] || []).length
  }));
  res.json({ categories });
});

/**
 * GET /api/news/sports-teams
 * Returns the full list of followable sports teams grouped by league.
 * IDs use slug format matching stored preferences (e.g. "nfl:dallas-cowboys").
 */
router.get('/sports-teams', authenticateToken, (req, res) => {
  const { league: leagueFilter } = req.query;

  // Build flat teams list from the canonical catalog
  const allTeams = SPORTS_CATALOG
    .filter((t) => {
      if (!leagueFilter) return true;
      const leagueSlug = t.id.split(':')[0];
      return leagueSlug === leagueFilter || t.league === leagueFilter;
    })
    .map((t) => {
      const leagueSlug = t.id.split(':')[0];
      // Pick the shortest all-caps variant as abbreviation (e.g., 'DAL', 'GB')
      const abbr = (t.variants || []).find((v) => v === v.toUpperCase() && v.length <= 4 && /^[A-Z0-9]+$/.test(v)) || '';
      return {
        id: t.id,
        name: t.team,
        league: leagueSlug,
        leagueLabel: t.leagueLabel,
        shortName: (t.variants || [])[0] || t.team,
        abbreviation: abbr,
        city: t.city,
        state: t.state,
        country: t.country,
        icon: t.icon,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Group into leagues array for frontend league-picker UI
  const leagueMap = {};
  for (const team of allTeams) {
    const lg = team.league;
    if (!leagueMap[lg]) {
      leagueMap[lg] = { id: lg, name: team.leagueLabel || lg.toUpperCase(), icon: team.icon || '', teams: [] };
    }
    leagueMap[lg].teams.push(team);
  }
  const leagues = Object.values(leagueMap).sort((a, b) => a.name.localeCompare(b.name));

  res.json({ teams: allTeams, leagues });
});

/**
 * GET /api/news/sports-schedules
 * Returns upcoming game schedules for the user's followed teams.
 * Requires `teams` query param (comma-separated team IDs).
 */
router.get('/sports-schedules', authenticateToken, async (req, res) => {
  try {
    const teamIds = String(req.query.teams || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (teamIds.length === 0) return res.json({ schedules: {}, leagueStatuses: {} });

    const schedules = await getTeamSchedules(teamIds);
    const leagues = [...new Set(Object.values(schedules).map((entry) => entry?.league).filter(Boolean))];
    const leagueStatuses = getLeagueStatusMap(leagues);
    res.json({ schedules, leagueStatuses });
  } catch (error) {
    console.error('Error fetching sports schedules:', error);
    res.status(500).json({ error: 'Failed to fetch sports schedules' });
  }
});

/**
 * GET /api/news/sports-schedules/seasons
 * Returns current season status for all tracked leagues.
 */
router.get('/sports-schedules/seasons', authenticateToken, async (req, res) => {
  try {
    res.json({ seasons: getAllLeagueStatuses() });
  } catch (error) {
    console.error('Error fetching season info:', error);
    res.status(500).json({ error: 'Failed to fetch season info' });
  }
});

// ===========================================================================
// STOCK & CRYPTO TICKER ROUTES
// ===========================================================================

const STOCK_TICKER_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com';
const stockTickerCache = new Map();

/**
 * GET /api/news/stocks/search?q=AAPL
 * Proxies symbol search via Yahoo Finance v1 search endpoint.
 */
router.get('/stocks/search', authenticateToken, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 1) return res.json({ results: [] });

    const encoded = encodeURIComponent(q);
    const url = `${YAHOO_FINANCE_BASE}/v1/finance/search?q=${encoded}&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=false`;

    let data;
    try {
      data = await fetchJsonWithTimeout(url, 7000);
    } catch {
      return res.json({ results: [] });
    }

    const results = (data?.quotes || [])
      .filter((item) => item.symbol && (item.quoteType === 'EQUITY' || item.quoteType === 'CRYPTOCURRENCY' || item.quoteType === 'ETF' || item.quoteType === 'INDEX'))
      .slice(0, 8)
      .map((item) => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        type: item.quoteType,
        exchange: item.exchDisp || item.exchange || ''
      }));

    res.json({ results });
  } catch (error) {
    console.error('Error searching stocks:', error);
    res.status(500).json({ error: 'Stock search failed' });
  }
});

/**
 * GET /api/news/stocks/quotes?symbols=AAPL,MSFT,BTC-USD
 * Returns current quotes with 2-hour sparkline data for the given symbols.
 * Results are cached for 2 minutes.
 */
router.get('/stocks/quotes', authenticateToken, async (req, res) => {
  try {
    const raw = String(req.query.symbols || '').trim();
    if (!raw) return res.json({ quotes: [] });

    const symbols = raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 9);

    if (symbols.length === 0) return res.json({ quotes: [] });

    const now = Date.now();
    const quotes = [];

    for (const symbol of symbols) {
      // Check cache
      const cached = stockTickerCache.get(symbol);
      if (cached && now - cached.ts < STOCK_TICKER_CACHE_TTL_MS) {
        quotes.push(cached.data);
        continue;
      }

      try {
        const url = `${YAHOO_FINANCE_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
        const data = await fetchJsonWithTimeout(url, 7000);
        const result = data?.chart?.result?.[0];
        if (!result) {
          quotes.push({ symbol, error: 'not_found' });
          continue;
        }

        const meta = result.meta || {};
        const closePrices = result.indicators?.quote?.[0]?.close || [];
        const timestamps = result.timestamp || [];

        // Build 2-hour sparkline from 1-day chart data (last 24 × 5-min candles ≈ 2h)
        const sparklinePoints = closePrices.slice(-24).filter((v) => v != null);

        const currentPrice = meta.regularMarketPrice ?? closePrices[closePrices.length - 1] ?? null;
        const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
        const change = currentPrice != null && previousClose != null
          ? currentPrice - previousClose
          : null;
        const changePercent = change != null && previousClose
          ? (change / previousClose) * 100
          : null;

        const quoteData = {
          symbol,
          name: meta.shortName || meta.longName || symbol,
          price: currentPrice,
          previousClose,
          change: change != null ? Math.round(change * 100) / 100 : null,
          changePercent: changePercent != null ? Math.round(changePercent * 100) / 100 : null,
          direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
          sparkline: sparklinePoints,
          currency: meta.currency || 'USD',
          marketState: meta.marketState || 'UNKNOWN'
        };

        stockTickerCache.set(symbol, { data: quoteData, ts: now });
        quotes.push(quoteData);
      } catch {
        quotes.push({ symbol, error: 'fetch_failed' });
      }
    }

    res.json({ quotes });
  } catch (error) {
    console.error('Error fetching stock quotes:', error);
    res.status(500).json({ error: 'Failed to fetch stock quotes' });
  }
});

// ===========================================================================
// NEWS PREFERENCES ROUTES
// ===========================================================================

/**
 * GET /api/news/location-taxonomy
 * Returns the canonical US state/city taxonomy for location selectors.
 */
router.get('/location-taxonomy', authenticateToken, async (req, res) => {
  try {
    const taxonomy = getLocationTaxonomyPayload();
    let preferredStateCode = '';
    let preferredStateName = '';

    try {
      const user = await User.findById(req.user.userId).select('zipCode state').lean();
      const normalizedZip = String(user?.zipCode || '').trim();
      if (normalizedZip) {
        const zipLocation = await resolveZipLocation(normalizedZip, { allowGeocode: true, persist: true });
        preferredStateCode = canonicalizeStateCode(zipLocation?.stateCode || zipLocation?.state) || '';
      }
      if (!preferredStateCode) {
        preferredStateCode = canonicalizeStateCode(user?.state) || '';
      }
      preferredStateName = taxonomy.states.find((state) => state.code === preferredStateCode)?.name || '';
    } catch {
      preferredStateCode = '';
      preferredStateName = '';
    }

    res.json({
      taxonomy: {
        ...taxonomy,
        preferredStateCode,
        preferredStateName
      }
    });
  } catch (error) {
    console.error('Error fetching location taxonomy:', error);
    res.status(500).json({ error: 'Failed to fetch location taxonomy' });
  }
});

/**
 * GET /api/news/sources
 * Returns available RSS sources with health status for the settings panel.
 * Sources are a union of the catalog and any user-added RSS sources.
 */
router.get('/sources', authenticateToken, async (req, res) => {
  try {
    const metrics = await getCacheMetrics();
    res.json({ sources: buildCacheSourceDescriptors(metrics), catalogVersion: 'cache-v1', metrics });
  } catch (error) {
    console.error('Error fetching news sources:', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

/**
 * GET /api/news/promoted
 * Returns top viral articles.
 */
router.get('/promoted', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const normalizedLocation = await resolveFeedLocationForUser(req.user.userId, null);
    const cacheResult = normalizedLocation?.locationKey
      ? await getArticlesForLocation(normalizedLocation.locationKey, { normalizedLocation })
      : { articles: [] };
    const articles = filterCachedArticles(cacheResult.articles, {
      category: req.query.topic || null
    }).slice(0, limit);
    res.json({ articles });
  } catch (error) {
    console.error('Error fetching promoted articles:', error);
    res.status(500).json({ error: 'Failed to fetch promoted articles' });
  }
});

/**
 * GET /api/news/preferences
 * Returns the full NewsPreferences document for the user.
 */
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    let prefs = await NewsPreferences.findOne({ user: req.user.userId });
    if (!prefs) {
      prefs = await NewsPreferences.create({ user: req.user.userId });
    } else {
      await backfillWeatherLocations(prefs);
    }
    // Compute registration alignment: flag mismatch between profile and news prefs
    let registrationAlignment = null;
    try {
      const user = await User.findById(req.user.userId).select('city state zipCode').lean();
      const primaryLoc = (prefs.locations || []).find(l => l.isPrimary) || (prefs.locations || [])[0];
      if (user && primaryLoc) {
        const profileZip = String(user.zipCode || '').trim();
        const prefZip = String(primaryLoc.zipCode || '').trim();
        registrationAlignment = (profileZip && prefZip && profileZip !== prefZip)
          ? { mismatched: true, profileZip, prefZip }
          : { mismatched: false };
      }
    } catch { /* non-fatal */ }
    res.json({ preferences: prefs, registrationAlignment });
  } catch (error) {
    console.error('Error fetching news preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/news/preferences
 * Update top-level preference fields.
 * Does NOT touch weatherLocations or redditMonitors (use dedicated endpoints).
 */
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const ALLOWED_FIELDS = [
      'locations', 'followedSportsTeams', 'rssSources',
      'googleNewsTopics', 'googleNewsEnabled',
      'gdletCategories', 'gdletEnabled',
      'followedKeywords', 'defaultScope', 'localPriorityEnabled',
      'hiddenCategories', 'disabledSourceCategories',
      'refreshInterval', 'articlesPerPage',
      'stockTickers', 'stockTickersEnabled'
    ];
    const update = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) update[field] = req.body[field];
    }

    const prefs = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { $set: update },
      { new: true, upsert: true }
    );
    // Compute registration alignment
    let registrationAlignment = null;
    try {
      const user = await User.findById(req.user.userId).select('zipCode').lean();
      const primaryLoc = (prefs.locations || []).find(l => l.isPrimary) || (prefs.locations || [])[0];
      if (user && primaryLoc) {
        const profileZip = String(user.zipCode || '').trim();
        const prefZip = String(primaryLoc.zipCode || '').trim();
        registrationAlignment = (profileZip && prefZip && profileZip !== prefZip)
          ? { mismatched: true, profileZip, prefZip }
          : { mismatched: false };
      }
    } catch { /* non-fatal */ }
    res.json({ preferences: prefs, registrationAlignment });
  } catch (error) {
    console.error('Error updating news preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * POST /api/news/preferences/locations
 * Add a location to the user's news preferences.
 */
router.post('/preferences/locations', authenticateToken, async (req, res) => {
  try {
    const { city, cityKey, zipCode, state, stateCode, country, countryCode, county, isPrimary } = req.body || {};
    if (!city && !zipCode && !state) {
      return res.status(400).json({ error: 'Provide at least city, zipCode, or state' });
    }
    const prefs = await NewsPreferences.getOrCreate(req.user.userId);
    const MAX_LOCATIONS = 5;
    if (prefs.locations.length >= MAX_LOCATIONS) {
      return res.status(400).json({ error: `Maximum ${MAX_LOCATIONS} locations allowed` });
    }
    const setAsPrimary = isPrimary || prefs.locations.length === 0;
    if (setAsPrimary) prefs.locations.forEach((l) => { l.isPrimary = false; });
    prefs.locations.push({
      city: city || null, cityKey: cityKey || null,
      zipCode: zipCode || null,
      state: state || null, stateCode: stateCode || null,
      country: country || null, countryCode: countryCode || null,
      county: county || null,
      isPrimary: setAsPrimary
    });
    await prefs.save();
    let registrationAlignment = null;
    try {
      const user = await User.findById(req.user.userId).select('zipCode').lean();
      const primaryLoc = prefs.locations.find(l => l.isPrimary) || prefs.locations[0];
      if (user && primaryLoc) {
        const profileZip = String(user.zipCode || '').trim();
        const prefZip = String(primaryLoc.zipCode || '').trim();
        registrationAlignment = (profileZip && prefZip && profileZip !== prefZip)
          ? { mismatched: true, profileZip, prefZip }
          : { mismatched: false };
      }
    } catch { /* non-fatal */ }
    res.json({ preferences: prefs, registrationAlignment });
  } catch (error) {
    console.error('Error adding location:', error);
    res.status(500).json({ error: 'Failed to add location' });
  }
});

/**
 * DELETE /api/news/preferences/locations/:locationId
 * Remove a location preference by its subdocument _id.
 */
router.delete('/preferences/locations/:locationId', authenticateToken, async (req, res) => {
  try {
    const { locationId } = req.params;
    const prefs = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { $pull: { locations: { _id: locationId } } },
      { new: true }
    );
    if (!prefs) return res.status(404).json({ error: 'Preferences not found' });
    // Re-assign primary if needed
    if (prefs.locations.length > 0 && !prefs.locations.some((l) => l.isPrimary)) {
      prefs.locations[0].isPrimary = true;
      await prefs.save();
    }
    let registrationAlignment = null;
    try {
      const user = await User.findById(req.user.userId).select('zipCode').lean();
      const primaryLoc = prefs.locations.find(l => l.isPrimary) || prefs.locations[0];
      if (user && primaryLoc) {
        const profileZip = String(user.zipCode || '').trim();
        const prefZip = String(primaryLoc.zipCode || '').trim();
        registrationAlignment = (profileZip && prefZip && profileZip !== prefZip)
          ? { mismatched: true, profileZip, prefZip }
          : { mismatched: false };
      }
    } catch { /* non-fatal */ }
    res.json({ preferences: prefs, registrationAlignment });
  } catch (error) {
    console.error('Error removing location:', error);
    res.status(500).json({ error: 'Failed to remove location' });
  }
});

/**
 * PUT /api/news/preferences/hidden-categories
 * Update which categories the user has hidden from their feed.
 */
router.put('/preferences/hidden-categories', authenticateToken, async (req, res) => {
  try {
    const { hiddenCategories } = req.body || {};
    if (!Array.isArray(hiddenCategories)) {
      return res.status(400).json({ error: 'hiddenCategories must be an array' });
    }
    const prefs = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { $set: { hiddenCategories: hiddenCategories.map((c) => String(c).toLowerCase()).filter(Boolean) } },
      { new: true, upsert: true }
    );
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Error updating hidden categories:', error);
    res.status(500).json({ error: 'Failed to update hidden categories' });
  }
});

/**
 * PUT /api/news/preferences/source-categories
 * Toggle a category on/off for a specific source.
 * Body: { sourceId, category }
 */
router.put('/preferences/source-categories', authenticateToken, async (req, res) => {
  try {
    const { sourceId, category } = req.body || {};
    if (!sourceId || !category) {
      return res.status(400).json({ error: 'sourceId and category are required' });
    }
    const prefs = await NewsPreferences.getOrCreate(req.user.userId);
    const map = prefs.disabledSourceCategories || new Map();
    const key = String(sourceId);
    const current = map.get(key) || [];
    const cat = String(category).toLowerCase();
    if (current.includes(cat)) {
      map.set(key, current.filter((c) => c !== cat));
    } else {
      map.set(key, [...current, cat]);
    }
    prefs.disabledSourceCategories = map;
    await prefs.save();
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Error toggling source category:', error);
    res.status(500).json({ error: 'Failed to toggle source category' });
  }
});

/**
 * POST /api/news/preferences/reddit
 * Add a subreddit monitor.
 * Body: { subreddit, minUpvotes }
 */
router.post('/preferences/reddit', authenticateToken, async (req, res) => {
  try {
    const subreddit = String(req.body.subreddit || '').trim().toLowerCase().replace(/^r\//, '');
    const minUpvotes = Math.max(0, Math.min(100000, parseInt(req.body.minUpvotes, 10) || 100));

    if (!subreddit || !/^[a-z0-9_]{2,21}$/.test(subreddit)) {
      return res.status(400).json({ error: 'Invalid subreddit name' });
    }

    let prefs = await NewsPreferences.findOne({ user: req.user.userId });
    if (!prefs) prefs = await NewsPreferences.create({ user: req.user.userId });

    const MAX_MONITORS = 10;
    const existing = prefs.redditMonitors.find((m) => m.subreddit === subreddit);
    if (existing) {
      existing.minUpvotes = minUpvotes;
    } else {
      if (prefs.redditMonitors.length >= MAX_MONITORS) {
        return res.status(400).json({ error: `Maximum ${MAX_MONITORS} subreddit monitors allowed` });
      }
      prefs.redditMonitors.push({ subreddit, minUpvotes, enabled: true });
    }

    await prefs.save();
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Error adding reddit monitor:', error);
    res.status(500).json({ error: 'Failed to add reddit monitor' });
  }
});

/**
 * DELETE /api/news/preferences/reddit/:subreddit
 * Remove a subreddit monitor.
 */
router.delete('/preferences/reddit/:subreddit', authenticateToken, async (req, res) => {
  try {
    const subreddit = String(req.params.subreddit || '').trim().toLowerCase().replace(/^r\//, '');

    const prefs = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { $pull: { redditMonitors: { subreddit } } },
      { new: true }
    );

    if (!prefs) return res.status(404).json({ error: 'Preferences not found' });
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Error removing reddit monitor:', error);
    res.status(500).json({ error: 'Failed to remove reddit monitor' });
  }
});

/**
 * PATCH /api/news/preferences/reddit/:subreddit
 * Toggle enabled / update minUpvotes for a monitor.
 */
router.patch('/preferences/reddit/:subreddit', authenticateToken, async (req, res) => {
  try {
    const subreddit = String(req.params.subreddit || '').trim().toLowerCase().replace(/^r\//, '');
    const prefs = await NewsPreferences.findOne({ user: req.user.userId });
    if (!prefs) return res.status(404).json({ error: 'Preferences not found' });

    const monitor = prefs.redditMonitors.find((m) => m.subreddit === subreddit);
    if (!monitor) return res.status(404).json({ error: 'Monitor not found' });

    if (req.body.enabled !== undefined) monitor.enabled = Boolean(req.body.enabled);
    if (req.body.minUpvotes !== undefined) {
      monitor.minUpvotes = Math.max(0, Math.min(100000, parseInt(req.body.minUpvotes, 10) || 0));
    }

    await prefs.save();
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Error updating reddit monitor:', error);
    res.status(500).json({ error: 'Failed to update reddit monitor' });
  }
});

// ===========================================================================
// WEATHER ROUTES
// ===========================================================================

/**
 * GET /api/news/weather/geocode
 * Returns Open-Meteo geocoding suggestions for autocomplete.
 */
router.get('/weather/geocode', authenticateToken, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ suggestions: [] });

    const coordQuery = parseCoordinateQuery(q);
    if (coordQuery) {
      return res.json({
        suggestions: [{
          id: `coords:${coordQuery.lat},${coordQuery.lon}`,
          label: `${coordQuery.lat.toFixed(4)}, ${coordQuery.lon.toFixed(4)}`,
          city: null, state: null, country: null, countryCode: null,
          latitude: coordQuery.lat, longitude: coordQuery.lon, timezone: null
        }]
      });
    }

    if (US_ZIP_REGEX.test(q)) {
      const zipLocation = await resolveZipLocation(q, { allowGeocode: true, persist: true });
      if (zipLocation) {
        return res.json({
          suggestions: [{
            id: `zip:${zipLocation.zipCode}`,
            label: [zipLocation.city, zipLocation.stateCode || zipLocation.state, zipLocation.zipCode].filter(Boolean).join(', '),
            city: zipLocation.city || null,
            state: zipLocation.state || null,
            country: zipLocation.country || null,
            countryCode: zipLocation.countryCode || null,
            zipCode: zipLocation.zipCode || q,
            latitude: zipLocation.latitude != null ? Number(zipLocation.latitude) : null,
            longitude: zipLocation.longitude != null ? Number(zipLocation.longitude) : null,
            timezone: null
          }]
        });
      }
    }

    const suggestions = (await fetchOpenMeteoGeocode(q, 8)).map((item) => ({
      id: `${item.id || `${item.latitude},${item.longitude}`}`,
      label: [item.name, item.admin1, item.country].filter(Boolean).join(', '),
      city: item.name || null,
      state: item.admin1 || null,
      country: item.country || null,
      countryCode: item.country_code || null,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      timezone: item.timezone || null
    }));

    res.json({ suggestions });
  } catch (error) {
    console.error('Error geocoding weather location:', error);
    res.status(500).json({ error: 'Failed to search weather locations' });
  }
});

/**
 * GET /api/news/weather
 * Returns weather (+ UV/AQI/pollen) for all of the user's saved weather locations.
 * Falls back to news locations → profile location if none are set.
 */
router.get('/weather', authenticateToken, async (req, res) => {
  try {
    const preferences = await NewsPreferences.findOne({ user: req.user.userId });
    await backfillWeatherLocations(preferences);
    let weatherLocations = preferences?.weatherLocations || [];
    let fallbackSource = null;

    if (weatherLocations.length === 0) {
      const newsLocations = preferences?.locations || [];
      const primary = newsLocations.find((l) => l.isPrimary) || newsLocations[0];
      if (primary && (primary.lat || primary.city || primary.zipCode)) {
        weatherLocations = [primary];
        fallbackSource = 'newsLocation';
      } else {
        const user = await User.findById(req.user.userId).lean();
        if (user?.location?.lat && user?.location?.lon) {
          weatherLocations = [{ lat: user.location.lat, lon: user.location.lon, label: 'Profile Location', isPrimary: true }];
          fallbackSource = 'profileLocation';
        } else {
          const profileCity = user?.city || user?.location?.city || null;
          const profileState = user?.state || user?.location?.state || null;
          const profileZip = user?.zipCode || user?.location?.zipCode || null;
          if (profileCity || profileState || profileZip) {
            weatherLocations = [{ city: profileCity, state: profileState, zipCode: profileZip, label: 'Profile Location', isPrimary: true }];
            fallbackSource = 'profileLocation';
          }
        }
      }
    }

    if (weatherLocations.length === 0) {
      return res.json({ locations: [], fallbackSource: null, _cache: { ttlMs: WEATHER_CACHE_TTL_MS, ...weatherCacheMetrics } });
    }

    const results = await Promise.allSettled(
      weatherLocations.map(async (loc) => {
        const locObj = loc.toObject ? loc.toObject() : loc;
        const result = await fetchWeatherForLocation(locObj);
        const resolved = result.resolved || {};
        return {
          ...locObj,
          label: locObj.label || resolved.label || [locObj.city, locObj.state, locObj.country].filter(Boolean).join(', '),
          city: locObj.city || resolved.city || null,
          state: locObj.state || resolved.state || null,
          country: locObj.country || resolved.country || null,
          countryCode: locObj.countryCode || resolved.countryCode || null,
          lat: Number.isFinite(Number(locObj.lat)) ? Number(locObj.lat) : resolved.lat,
          lon: Number.isFinite(Number(locObj.lon)) ? Number(locObj.lon) : resolved.lon,
          timezone: locObj.timezone || resolved.timezone || null,
          weather: result.weather,
          error: result.error,
          cacheHit: result.cacheHit
        };
      })
    );

    const locations = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const loc = weatherLocations[i];
      const locObj = loc?.toObject ? loc.toObject() : loc;
      return { ...locObj, weather: null, error: 'Weather fetch failed', cacheHit: false };
    });

    res.json({ locations, fallbackSource, _cache: { ttlMs: WEATHER_CACHE_TTL_MS, ...weatherCacheMetrics } });
  } catch (error) {
    console.error('Error fetching weather:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

/**
 * POST /api/news/preferences/weather-locations
 * Add a weather location (max 3).
 */
router.post('/preferences/weather-locations', authenticateToken, async (req, res) => {
  try {
    const { label, city, state, country, countryCode, zipCode, lat, lon, timezone, isPrimary } = req.body;

    if (!city && !zipCode && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) && !label) {
      return res.status(400).json({ error: 'Provide city, zip code, coordinates, or label for weather location' });
    }

    let preferences = await NewsPreferences.findOne({ user: req.user.userId });
    if (!preferences) preferences = await NewsPreferences.create({ user: req.user.userId });

    if ((preferences.weatherLocations || []).length >= 3) {
      return res.status(400).json({ error: 'Maximum 3 weather locations allowed' });
    }

    const locationData = {
      label: label || [city, state, country].filter(Boolean).join(', '),
      city: city || null,
      state: state || null,
      country: country || null,
      countryCode: countryCode || null,
      zipCode: zipCode || null,
      lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
      lon: Number.isFinite(Number(lon)) ? Number(lon) : null,
      timezone: timezone || null,
      isPrimary: false
    };

    const resolved = await resolveWeatherLocationCoordinates(locationData);
    if (resolved) {
      applyResolvedWeatherFields(locationData, resolved);
    }

    if (isPrimary || preferences.weatherLocations.length === 0) {
      locationData.isPrimary = true;
      if (isPrimary && preferences.weatherLocations.length > 0) {
        preferences.weatherLocations.forEach((loc) => { loc.isPrimary = false; });
      }
    }

    preferences.weatherLocations.push(locationData);
    await preferences.save();
    res.json({ preferences });
  } catch (error) {
    console.error('Error adding weather location:', error);
    res.status(500).json({ error: 'Failed to add weather location' });
  }
});

/**
 * PUT /api/news/preferences/weather-locations
 * Replace all weather locations.
 */
router.put('/preferences/weather-locations', authenticateToken, async (req, res) => {
  try {
    const { locations } = req.body;
    if (!Array.isArray(locations)) {
      return res.status(400).json({ error: 'Locations array is required' });
    }

    const normalizedLocations = await Promise.all(locations.map(async (loc, index) => {
      const normalized = {
        label: loc?.label || [loc?.city, loc?.state, loc?.country].filter(Boolean).join(', '),
        city: loc?.city || null,
        state: loc?.state || null,
        country: loc?.country || null,
        countryCode: loc?.countryCode || null,
        zipCode: loc?.zipCode || null,
        lat: Number.isFinite(Number(loc?.lat)) ? Number(loc.lat) : null,
        lon: Number.isFinite(Number(loc?.lon)) ? Number(loc.lon) : null,
        timezone: loc?.timezone || null,
        isPrimary: Boolean(loc?.isPrimary || index === 0)
      };
      if (!normalized.city && !normalized.zipCode && (!normalized.lat || !normalized.lon) && !normalized.label) {
        return { error: 'Each weather location must include city, zip code, coordinates, or label' };
      }
      const resolved = await resolveWeatherLocationCoordinates(normalized);
      if (resolved) {
        applyResolvedWeatherFields(normalized, resolved);
      }
      return normalized;
    }));

    const validationError = normalizedLocations.find((loc) => loc.error);
    if (validationError) return res.status(400).json({ error: validationError.error });

    if (normalizedLocations.length > 0 && !normalizedLocations.some((loc) => loc.isPrimary)) {
      normalizedLocations[0].isPrimary = true;
    }

    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { weatherLocations: normalizedLocations },
      { new: true, upsert: true }
    );
    res.json({ preferences });
  } catch (error) {
    console.error('Error updating weather locations:', error);
    res.status(500).json({ error: 'Failed to update weather locations' });
  }
});

/**
 * DELETE /api/news/preferences/weather-locations/:locationId
 * Remove a weather location by its Mongoose subdocument _id.
 */
router.delete('/preferences/weather-locations/:locationId', authenticateToken, async (req, res) => {
  try {
    const { locationId } = req.params;
    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { $pull: { weatherLocations: { _id: locationId } } },
      { new: true }
    );
    if (!preferences) return res.status(404).json({ error: 'Preferences not found' });

    if (preferences.weatherLocations.length > 0 && !preferences.weatherLocations.some((l) => l.isPrimary)) {
      preferences.weatherLocations[0].isPrimary = true;
      await preferences.save();
    }
    res.json({ preferences });
  } catch (error) {
    console.error('Error removing weather location:', error);
    res.status(500).json({ error: 'Failed to remove weather location' });
  }
});

/**
 * PUT /api/news/preferences/weather-locations/:locationId/primary
 * Set a weather location as primary.
 */
router.put('/preferences/weather-locations/:locationId/primary', authenticateToken, async (req, res) => {
  try {
    const { locationId } = req.params;
    const preferences = await NewsPreferences.findOne({ user: req.user.userId });
    if (!preferences) return res.status(404).json({ error: 'Preferences not found' });

    const targetLocation = preferences.weatherLocations.id(locationId);
    if (!targetLocation) return res.status(404).json({ error: 'Weather location not found' });

    preferences.weatherLocations.forEach((loc) => { loc.isPrimary = false; });
    targetLocation.isPrimary = true;
    await preferences.save();
    res.json({ preferences });
  } catch (error) {
    console.error('Error setting primary weather location:', error);
    res.status(500).json({ error: 'Failed to update primary weather location' });
  }
});

// ===========================================================================
// ADMIN ROUTES
// ===========================================================================

/**
 * POST /api/news/admin/ingest
 * Trigger all 4 ingestion pipelines immediately (admin-key protected).
 * Body: { pipelines?: ['local','categories','sports','social'] }
 */
// ===========================================================================
// IMPRESSION TRACKING
// ===========================================================================

/**
 * POST /api/news/impressions
 * Batch-record article impressions for the authenticated user.
 * Body: { impressions: [{ articleId, type }] }
 * type = 'scroll' | 'click'
 * Fire-and-forget from the client — always returns 204.
 */
router.post('/impressions', authenticateToken, async (req, res) => {
  res.status(204).end(); // respond immediately, process async
  const { impressions } = req.body || {};
  if (!Array.isArray(impressions) || impressions.length === 0) return;
  const userId = req.user.userId;
  for (const imp of impressions.slice(0, 50)) {
    const { articleId, articleLink, locationKey, type } = imp || {};
    const articleRef = articleLink || articleId;
    if (!articleRef || !['scroll', 'click'].includes(type)) continue;
    ArticleImpression.upsertImpression(userId, articleRef, type, { articleLink, locationKey }).catch((err) =>
      console.error('[impressions] upsert error:', err.message)
    );
  }
});

// ===========================================================================
// KEYWORD PREFERENCES ROUTES
// ===========================================================================

/**
 * POST /api/news/preferences/keywords
 * Add a keyword to the user's followedKeywords list.
 * Body: { keyword }
 */
router.post('/preferences/keywords', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.body || {};
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return res.status(400).json({ error: 'keyword is required' });
    }
    const trimmed = keyword.trim().toLowerCase();
    if (trimmed.length > 100) return res.status(400).json({ error: 'keyword too long (max 100 chars)' });
    const prefs = await NewsPreferences.getOrCreate(req.user.userId);
    if (prefs.followedKeywords.length >= 50) {
      return res.status(400).json({ error: 'Maximum 50 keywords allowed' });
    }
    await prefs.addKeyword(trimmed);
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Error adding keyword:', error);
    res.status(500).json({ error: 'Failed to add keyword' });
  }
});

/**
 * DELETE /api/news/preferences/keywords/:keyword
 * Remove a keyword from the user's followedKeywords list.
 */
router.delete('/preferences/keywords/:keyword', authenticateToken, async (req, res) => {
  try {
    const keyword = decodeURIComponent(req.params.keyword || '').toLowerCase().trim();
    if (!keyword) return res.status(400).json({ error: 'keyword is required' });
    const prefs = await NewsPreferences.getOrCreate(req.user.userId);
    await prefs.removeKeyword(keyword);
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Error removing keyword:', error);
    res.status(500).json({ error: 'Failed to remove keyword' });
  }
});

/**
 * PUT /api/news/preferences/keywords/:keyword
 * Rename/edit an existing followed keyword.
 * Body: { keyword: string } — the new keyword value
 */
router.put('/preferences/keywords/:keyword', authenticateToken, async (req, res) => {
  try {
    const oldKeyword = decodeURIComponent(req.params.keyword || '').toLowerCase().trim();
    const newKeyword = String(req.body.keyword || '').trim().toLowerCase();
    if (!oldKeyword || !newKeyword) {
      return res.status(400).json({ error: 'Both old and new keyword values are required' });
    }
    if (newKeyword.length > 100) return res.status(400).json({ error: 'keyword too long (max 100 chars)' });
    const prefs = await NewsPreferences.getOrCreate(req.user.userId);
    const existing = prefs.followedKeywords.find((k) => k.keyword === oldKeyword);
    if (!existing) return res.status(404).json({ error: 'Keyword not found' });
    // Check for duplicate
    if (oldKeyword !== newKeyword && prefs.followedKeywords.some((k) => k.keyword === newKeyword)) {
      return res.status(400).json({ error: 'A keyword with that name already exists' });
    }
    existing.keyword = newKeyword;
    await prefs.save();
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Error renaming keyword:', error);
    res.status(500).json({ error: 'Failed to rename keyword' });
  }
});

// ===========================================================================
// FULL-TEXT SEARCH
// ===========================================================================

/**
 * GET /api/news/search
 * Full-text keyword search across articles.
 * Query: q, category, dateFrom, dateTo, country, state, city, page, limit
 */
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { q, category, dateFrom, dateTo, country, state, city, zipCode, tier, page = 1, limit = 20 } = req.query;
    if (!q || String(q).trim().length === 0) {
      return res.status(400).json({ error: 'q (search query) is required' });
    }
    const safeLimit = Math.min(parseInt(limit, 10) || 20, 50);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const overrideLocation = (city || state || country || zipCode) ? { city, state, country, zipCode } : null;
    const normalizedLocation = overrideLocation
      ? await normalizeLocationInput(overrideLocation)
      : await resolveFeedLocationForUser(req.user.userId, null);
    const searchResults = await searchCachedArticles(q, { locationKey: normalizedLocation?.locationKey || null });

    const filtered = searchResults.filter((article) => {
      if (tier && article.tier !== tier) return false;
      if (category && category !== 'all' && article.category && article.category !== category) return false;
      if (dateFrom && (!article.publishedAt || new Date(article.publishedAt) < new Date(dateFrom))) return false;
      if (dateTo && (!article.publishedAt || new Date(article.publishedAt) > new Date(dateTo))) return false;
      return true;
    });

    const pageArticles = filtered.slice(skip, skip + safeLimit);
    res.json({
      articles: pageArticles,
      total: filtered.length,
      page: safePage,
      limit: safeLimit,
      pagination: {
        page: safePage,
        pages: Math.ceil(filtered.length / safeLimit),
        total: filtered.length
      },
      location: normalizedLocation ? { ...normalizedLocation } : null,
      query: q
    });
  } catch (error) {
    console.error('Error searching articles:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

const INGESTION_PIPELINES = ['local', 'categories', 'sports', 'social'];
const SOURCE_ADAPTER_KEY_MAP = {
  'Google News Cache': 'local',
  'Google News Local': 'local',
  'Google News State': 'local',
  'Google News National': 'local',
  preload: 'local',
};

const CATEGORY_INGEST_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let _schedulerStarted = false;
let schedulerStartedAt = null;
let lastIngestionRunAt = null;
let _categoryIngestHandle = null;
let _lastCategoryIngestAt = null;

function enqueuePipeline(pipeline) {
  let task = Promise.resolve();
  if (pipeline === 'local') {
    task = Promise.all([
      refreshAllCachedLocations({ force: true }).catch((err) => console.error('[news-local] refresh error:', err)),
      ingestAllKnownLocations().catch((err) => console.error('[news-local] ingest error:', err)),
    ]);
  } else if (pipeline === 'categories') {
    task = ingestAllCategories()
      .then(() => { _lastCategoryIngestAt = new Date(); })
      .catch((err) => console.error('[news-categories] ingest error:', err));
  } else if (pipeline === 'sports') {
    task = ingestAllFollowedTeams().catch((err) => console.error('[news-sports] ingest error:', err));
  } else if (pipeline === 'social') {
    task = ingestAllMonitoredSubreddits().catch((err) => console.error('[news-social] ingest error:', err));
  }

  return task.finally(() => {
    lastIngestionRunAt = new Date();
  });
}

function launchIngestionPipelines(requested = INGESTION_PIPELINES) {
  const valid = requested.filter((pipeline) => INGESTION_PIPELINES.includes(pipeline));
  valid.forEach((pipeline) => { enqueuePipeline(pipeline); });
  return { startedAt: new Date().toISOString(), pipelines: valid };
}

router.post('/admin/ingest', requireAdminApiKey, async (req, res) => {
  const requested = Array.isArray(req.body?.pipelines)
    ? req.body.pipelines
    : INGESTION_PIPELINES;

  const result = launchIngestionPipelines(requested);
  res.json({ ok: true, ...result });
});

router.post('/ingest', authenticateToken, requireAdminUser, async (req, res) => {
  const requested = Array.isArray(req.body?.pipelines)
    ? req.body.pipelines
    : INGESTION_PIPELINES;

  const result = launchIngestionPipelines(requested);
  res.json({ ok: true, ...result });
});

router.post('/ingest/:sourceKey', authenticateToken, requireAdminUser, async (req, res) => {
  const sourceKey = decodeURIComponent(req.params.sourceKey || '').trim();
  const pipeline = INGESTION_PIPELINES.includes(sourceKey)
    ? sourceKey
    : (SOURCE_ADAPTER_KEY_MAP[sourceKey] || null);

  if (!pipeline) {
    return res.status(400).json({ error: 'Unknown source key' });
  }

  const result = launchIngestionPipelines([pipeline]);
  return res.json({ ok: true, sourceKey, pipeline, ...result });
});

router.get('/schedule-info', authenticateToken, requireAdminUser, async (req, res) => {
  const cacheState = getCacheSchedulerState();
  const categoryNextRunAt = _categoryIngestHandle
    ? new Date((_lastCategoryIngestAt || schedulerStartedAt || new Date()).getTime() + CATEGORY_INGEST_INTERVAL_MS)
    : null;

  return res.json({
    ...cacheState,
    categoryPipeline: {
      schedulerRunning: Boolean(_categoryIngestHandle),
      lastRunAt: _lastCategoryIngestAt,
      nextRunAt: categoryNextRunAt,
      intervalMs: CATEGORY_INGEST_INTERVAL_MS,
    },
  });
});

router.get('/ingestion-stats', authenticateToken, requireAdminUser, async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const todayCount = await NewsIngestionRecord.countDocuments({ ingestedAt: { $gte: startOfToday } });
    const weekCount = await NewsIngestionRecord.countDocuments({ ingestedAt: { $gte: startOfWeek } });
    const activeArticles = await Article.countDocuments({ isActive: true });

    const [scopeAgg, statusAgg, sourceAgg] = await Promise.all([
      NewsIngestionRecord.aggregate([
        { $match: { ingestedAt: { $gte: startOfToday } } },
        { $group: { _id: '$metadata.localityLevel', count: { $sum: 1 } } }
      ]),
      NewsIngestionRecord.aggregate([
        { $match: { ingestedAt: { $gte: startOfToday } } },
        { $group: { _id: '$eventType', count: { $sum: 1 } } }
      ]),
      NewsIngestionRecord.aggregate([
        { $match: { ingestedAt: { $gte: startOfToday } } },
        { $group: {
          _id: '$metadata.source',
          total: { $sum: 1 },
          processed: { $sum: { $cond: [{ $eq: ['$eventType', 'inserted'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$eventType', 'error'] }, 1, 0] } }
        }}
      ]),
    ]);

    const byScope = {};
    for (const row of scopeAgg) {
      if (row._id) byScope[row._id] = row.count;
    }

    const byStatus = {};
    for (const row of statusAgg) {
      if (row._id) byStatus[row._id] = row.count;
    }

    const bySource = sourceAgg
      .filter((row) => row._id)
      .map((row) => ({ source: row._id, total: row.total, processed: row.processed, failed: row.failed }));

    const nameToAdapterKey = {};
    for (const row of bySource) {
      nameToAdapterKey[row.source] = SOURCE_ADAPTER_KEY_MAP[row.source] || 'categories';
    }

    return res.json({
      totals: { today: todayCount, week: weekCount, activeArticles },
      byScope,
      byStatus,
      bySource,
      nameToAdapterKey,
      generatedAt: now.toISOString()
    });
  } catch (error) {
    console.error('Error fetching ingestion stats:', error);
    return res.status(500).json({ error: 'Failed to fetch ingestion stats' });
  }
});

// ===========================================================================
// SCHEDULER
// ===========================================================================

function startIngestionScheduler() {
  if (_schedulerStarted) return;
  _schedulerStarted = true;
  schedulerStartedAt = new Date();

  // Start location cache refresh scheduler (Pipeline 1)
  startCacheRefreshScheduler();

  // Category ingestion: run every 1 hour (Pipeline 2)
  _categoryIngestHandle = setInterval(() => {
    ingestAllCategories()
      .then(() => { _lastCategoryIngestAt = new Date(); })
      .catch((err) => console.error('[cat-ingest] scheduled run error:', err));
  }, CATEGORY_INGEST_INTERVAL_MS);

  // Run initial category ingest 10 seconds after startup
  setTimeout(() => {
    ingestAllCategories()
      .then(() => { _lastCategoryIngestAt = new Date(); })
      .catch((err) => console.error('[cat-ingest] initial run error:', err));
  }, 10000);
}

router.use(authErrorHandler);

module.exports = {
  router,
  startIngestionScheduler,
  internals: {
    US_ZIP_REGEX,
    getUpcomingHourlyForecastWindow,
    classifySourceHealth,
    normalizeUSState,
    fetchWeatherForLocation,
    weatherCache
  }
};
