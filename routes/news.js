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

const express = require('express');
const router = express.Router();
const https = require('https');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const NewsPreferences = require('../models/NewsPreferences');
const User = require('../models/User');
const Article = require('../models/Article');
const ArticleImpression = require('../models/ArticleImpression');
const NewsIngestionRecord = require('../models/NewsIngestionRecord');

// ---------------------------------------------------------------------------
// Auth middleware (mirrors the pattern used across all route files)
// ---------------------------------------------------------------------------
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = decoded;
    next();
  });
};
const PROMOTED_THRESHOLD = parseInt(process.env.NEWS_VIRAL_PROMOTED_THRESHOLD || '65', 10);

const { buildFeed } = require('../services/newsFeedBuilder');
const { triggerLocationIngest, ingestLocalNews, ingestAllKnownLocations } = require('../services/newsIngestion.local');
const { ingestAllCategories } = require('../services/newsIngestion.categories');
const { ingestAllFollowedTeams } = require('../services/newsIngestion.sports');
const { getTeamSchedules, getLeagueStatusMap, getAllLeagueStatuses } = require('../services/sportsScheduleIngestion');
const { SPORTS_TEAMS: SPORTS_CATALOG } = require('../data/news/sportsTeamLocationIndex');
const { ingestAllMonitoredSubreddits } = require('../services/newsIngestion.social');
const { CATEGORY_FEEDS, CATEGORY_ORDER } = require('../config/newsCategoryFeeds');
const { canonicalizeStateCode, getLocationTaxonomyPayload } = require('../utils/newsLocationTaxonomy');
const { resolveZipLocation, resolveZipLocationByCityState } = require('../services/zipLocationIndex');

// ---------------------------------------------------------------------------
// Weather constants
// ---------------------------------------------------------------------------
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;   // 10 minutes
const WEATHER_WIDGET_REFRESH_SECONDS = 600;
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

    const hourly = hourlyTime.slice(0, 12).map((time, idx) => {
      const descriptor = getOpenMeteoWeatherDescriptor(fc?.hourly?.weather_code?.[idx]);
      return {
        time,
        temperature: fc?.hourly?.temperature_2m?.[idx] ?? null,
        humidity: fc?.hourly?.relative_humidity_2m?.[idx] ?? null,
        windSpeed: fc?.hourly?.wind_speed_10m?.[idx] ?? null,
        windGust: fc?.hourly?.wind_gusts_10m?.[idx] ?? null,
        precipitationProbability: fc?.hourly?.precipitation_probability?.[idx] ?? null,
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
    const { category, page, limit, teamIds, country, state, city } = req.query;
    const teamIdList = teamIds ? String(teamIds).split(',').map((s) => s.trim()).filter(Boolean) : [];

    // Region filter (from drill-down selector)
    const regionFilter = (country || state || city)
      ? { country: country || undefined, state: state || undefined, city: city || undefined }
      : null;

    // Keyword promotion: load user's followedKeywords from preferences
    let followedKeywords = [];
    let triggeredIngest = false;
    try {
      const prefs = await NewsPreferences.findOne({ user: req.user.userId }).lean();
      followedKeywords = (prefs?.followedKeywords || []).map((k) => k.keyword).filter(Boolean);

      // Region-triggered ingest: if a specific city was requested and we have no
      // recent articles for it, fire a background ingest.
      if (city && state) {
        const { buildCityKey } = require('../services/newsIngestion.local');
        const cityKey = buildCityKey(city, state);
        const recentCount = await Article.countDocuments({
          pipeline: 'local',
          cityKey,
          ingestTimestamp: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }
        });
        if (recentCount === 0) {
          ingestLocalNews(city, state).catch((err) =>
            console.error('[feed] region-triggered ingest error:', err.message)
          );
          triggeredIngest = true;
        }
      }
    } catch (prefErr) {
      console.error('[feed] prefs lookup error:', prefErr.message);
    }

    const result = await buildFeed(req.user.userId, {
      category: category || null,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      teamIds: teamIdList,
      followedKeywords,
      regionFilter,
    });

    if (triggeredIngest) result.triggeredIngest = true;
    res.json(result);
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
// NEWS PREFERENCES ROUTES
// ===========================================================================

/**
 * GET /api/news/location-taxonomy
 * Returns the canonical US state/city taxonomy for location selectors.
 */
router.get('/location-taxonomy', authenticateToken, (req, res) => {
  try {
    res.json({ taxonomy: getLocationTaxonomyPayload() });
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
    const RssSource = require('../models/RssSource');
    const dbSources = await RssSource.find({}).lean();
    res.json({ sources: dbSources, catalogVersion: 'v1' });
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
    const query = { viralScore: { $gte: PROMOTED_THRESHOLD }, isActive: { $ne: false } };
    if (req.query.topic) query.category = req.query.topic;
    const articles = await Article.find(query)
      .sort({ viralScore: -1, publishedAt: -1 })
      .limit(limit)
      .lean();
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
      'refreshInterval', 'articlesPerPage'
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
    const { articleId, type } = imp || {};
    if (!articleId || !['scroll', 'click'].includes(type)) continue;
    ArticleImpression.upsertImpression(userId, articleId, type).catch((err) =>
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
    const { q, category, dateFrom, dateTo, country, state, city, page = 1, limit = 20 } = req.query;
    if (!q || String(q).trim().length === 0) {
      return res.status(400).json({ error: 'q (search query) is required' });
    }
    const safeLimit = Math.min(parseInt(limit, 10) || 20, 50);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const filter = {
      $text: { $search: String(q).trim() },
      isActive: { $ne: false }
    };
    if (category && category !== 'all') filter.category = category;
    if (dateFrom || dateTo) {
      filter.publishedAt = {};
      if (dateFrom) filter.publishedAt.$gte = new Date(dateFrom);
      if (dateTo) filter.publishedAt.$lte = new Date(dateTo);
    }
    if (city) {
      filter['locationTags.cities'] = { $regex: city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    } else if (state) {
      filter['locationTags.states'] = state.toLowerCase();
    } else if (country) {
      filter['locationTags.countries'] = country.toLowerCase();
    }

    const [articles, total] = await Promise.all([
      Article.find(filter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, publishedAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      Article.countDocuments(filter)
    ]);

    res.json({ articles, total, page: safePage, limit: safeLimit, query: q });
  } catch (error) {
    console.error('Error searching articles:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

const INGESTION_PIPELINES = ['local', 'categories', 'sports', 'social'];
const INGESTION_FAST_INTERVAL_MS = 30 * 60 * 1000;
const SOURCE_ADAPTER_KEY_MAP = {
  'Google News': 'categories',
  Reuters: 'categories',
  'BBC News': 'categories',
  NPR: 'categories',
  'Associated Press': 'categories',
  'PBS NewsHour': 'categories',
  CNN: 'categories',
  'The Guardian': 'categories',
  'New York Times': 'categories',
  'Wall Street Journal': 'categories',
  TechCrunch: 'categories',
  'Yahoo News': 'categories',
  ESPN: 'sports',
  GDELT: 'categories',
  Reddit: 'social'
};

let _schedulerStarted = false;
let schedulerStartedAt = null;
let lastIngestionRunAt = null;

function enqueuePipeline(pipeline) {
  let task = Promise.resolve();
  if (pipeline === 'local') {
    task = ingestAllKnownLocations().catch((err) => console.error('[news] local ingest error:', err));
  }
  if (pipeline === 'categories') {
    task = ingestAllCategories().catch((err) => console.error('[news] category ingest error:', err));
  }
  if (pipeline === 'sports') {
    task = ingestAllFollowedTeams().catch((err) => console.error('[news] sports ingest error:', err));
  }
  if (pipeline === 'social') {
    task = ingestAllMonitoredSubreddits().catch((err) => console.error('[news] reddit ingest error:', err));
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
  const now = new Date();
  let nextRunAt = null;
  if (lastIngestionRunAt) {
    nextRunAt = new Date(lastIngestionRunAt.getTime() + INGESTION_FAST_INTERVAL_MS);
  } else if (schedulerStartedAt && _schedulerStarted) {
    nextRunAt = new Date(schedulerStartedAt.getTime() + INGESTION_FAST_INTERVAL_MS);
  }

  return res.json({
    schedulerRunning: _schedulerStarted,
    schedulerStartedAt,
    lastIngestionRunAt,
    nextRunAt,
    msUntilNextRun: nextRunAt ? Math.max(0, nextRunAt.getTime() - now.getTime()) : null,
    intervalMs: INGESTION_FAST_INTERVAL_MS
  });
});

router.get('/ingestion-stats', authenticateToken, requireAdminUser, async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    const [today, week, activeArticles, byScopeRows, byStatusRows, bySourceRows] = await Promise.all([
      NewsIngestionRecord.countDocuments({ ingestedAt: { $gte: startOfDay } }),
      NewsIngestionRecord.countDocuments({ ingestedAt: { $gte: weekAgo } }),
      Article.countDocuments({ isActive: { $ne: false } }),
      NewsIngestionRecord.aggregate([
        { $match: { ingestedAt: { $gte: last24h } } },
        { $group: { _id: '$resolvedScope', count: { $sum: 1 } } }
      ]),
      NewsIngestionRecord.aggregate([
        { $match: { ingestedAt: { $gte: last24h } } },
        { $group: { _id: '$dedupe.outcome', count: { $sum: 1 } } }
      ]),
      NewsIngestionRecord.aggregate([
        { $match: { ingestedAt: { $gte: last24h } } },
        {
          $group: {
            _id: '$source.name',
            total: { $sum: 1 },
            processed: {
              $sum: {
                $cond: [{ $eq: ['$processingStatus', 'processed'] }, 1, 0]
              }
            },
            failed: {
              $sum: {
                $cond: [{ $eq: ['$processingStatus', 'failed'] }, 1, 0]
              }
            }
          }
        },
        { $sort: { total: -1, _id: 1 } },
        { $limit: 100 }
      ])
    ]);

    const toMap = (rows = []) => rows.reduce((acc, row) => {
      const key = row?._id || 'unknown';
      acc[key] = row?.count || 0;
      return acc;
    }, {});

    const bySource = bySourceRows.map((row) => ({
      source: row?._id || 'unknown',
      total: row?.total || 0,
      processed: row?.processed || 0,
      failed: row?.failed || 0
    }));

    // Only include adapter keys for sources present in the latest 24h stats.
    const nameToAdapterKey = bySource.reduce((acc, row) => {
      if (SOURCE_ADAPTER_KEY_MAP[row.source]) {
        acc[row.source] = SOURCE_ADAPTER_KEY_MAP[row.source];
      }
      return acc;
    }, {});

    return res.json({
      totals: {
        today,
        week,
        activeArticles
      },
      byScope: toMap(byScopeRows),
      byStatus: toMap(byStatusRows),
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

  console.log('[news] Starting ingestion schedulers...');

  // Pipeline 1 · Local — every 30 minutes
  setInterval(() => {
    enqueuePipeline('local');
  }, INGESTION_FAST_INTERVAL_MS);

  // Pipeline 2 · Categories — every 2 hours
  setInterval(() => {
    enqueuePipeline('categories');
  }, 2 * 60 * 60 * 1000);

  // Pipeline 3 · Sports teams — every 4 hours
  setInterval(() => {
    enqueuePipeline('sports');
  }, 4 * 60 * 60 * 1000);

  // Pipeline 4 · Reddit — every 30 minutes
  setInterval(() => {
    enqueuePipeline('social');
  }, INGESTION_FAST_INTERVAL_MS);

  // Kick off an initial run (staggered to spread load)
  setTimeout(() => enqueuePipeline('categories'), 10 * 1000);
  setTimeout(() => enqueuePipeline('local'), 30 * 1000);
  setTimeout(() => enqueuePipeline('sports'), 60 * 1000);
  setTimeout(() => enqueuePipeline('social'), 90 * 1000);
}

module.exports = {
  router,
  startIngestionScheduler,
  internals: {
    US_ZIP_REGEX,
    classifySourceHealth,
    normalizeUSState,
    fetchWeatherForLocation,
    weatherCache
  }
};
