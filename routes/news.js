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
const { buildFeed } = require('../services/newsFeedBuilder');
const { triggerLocationIngest, ingestLocalNews, ingestAllKnownLocations } = require('../services/newsIngestion.local');
const { ingestAllCategories } = require('../services/newsIngestion.categories');
const { ingestAllFollowedTeams, SPORTS_TEAMS } = require('../services/newsIngestion.sports');
const { ingestAllMonitoredSubreddits } = require('../services/newsIngestion.social');
const { CATEGORY_FEEDS, CATEGORY_ORDER } = require('../config/newsCategoryFeeds');

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
  if (Number.isFinite(Number(locObj.lat)) && Number.isFinite(Number(locObj.lon))) {
    return {
      lat: Number(locObj.lat),
      lon: Number(locObj.lon),
      label: locObj.label || [locObj.city, locObj.state, locObj.country].filter(Boolean).join(', '),
      city: locObj.city || null,
      state: locObj.state || null,
      country: locObj.country || null,
      countryCode: locObj.countryCode || null,
      timezone: locObj.timezone || null
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
      timezone: locObj.timezone || null
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
    timezone: top.timezone || null
  };
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
    const forecastUrl = `${OPEN_METEO_FORECAST_BASE}?latitude=${encodeURIComponent(resolved.lat)}&longitude=${encodeURIComponent(resolved.lon)}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;
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
  const valid = crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  if (!valid) return res.status(403).json({ error: 'Invalid admin API key' });
  next();
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
 * Returns the full list of followable sports teams.
 */
router.get('/sports-teams', authenticateToken, (req, res) => {
  const { league } = req.query;
  const teams = Object.entries(SPORTS_TEAMS)
    .filter(([, t]) => !league || t.league === league)
    .map(([id, t]) => ({ id, ...t }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ teams });
});

// ===========================================================================
// NEWS PREFERENCES ROUTES
// ===========================================================================

/**
 * GET /api/news/preferences
 * Returns the full NewsPreferences document for the user.
 */
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    let prefs = await NewsPreferences.findOne({ user: req.user.userId });
    if (!prefs) {
      prefs = await NewsPreferences.create({ user: req.user.userId });
    }
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Error fetching news preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/news/preferences
 * Update top-level preference fields (locations, followedSportsTeams, etc.)
 * Does NOT touch weatherLocations or redditMonitors (use dedicated endpoints).
 */
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const ALLOWED_FIELDS = [
      'locations', 'followedSportsTeams', 'followedCategories',
      'notificationsEnabled', 'digestFrequency'
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
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Error updating news preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
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

    const normalizedLocations = locations.map((loc, index) => {
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
      return normalized;
    });

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

router.post('/admin/ingest', requireAdminApiKey, async (req, res) => {
  const requested = Array.isArray(req.body?.pipelines)
    ? req.body.pipelines
    : ['local', 'categories', 'sports', 'social'];

  const tasks = {};
  if (requested.includes('local'))      tasks.local = ingestAllKnownLocations();
  if (requested.includes('categories')) tasks.categories = ingestAllCategories();
  if (requested.includes('sports'))     tasks.sports = ingestAllFollowedTeams();
  if (requested.includes('social'))     tasks.social = ingestAllMonitoredSubreddits();

  // Fire-and-forget — don't await; respond immediately
  const startedAt = new Date().toISOString();
  Object.values(tasks).forEach((p) => p.catch((err) => console.error('[admin/ingest] pipeline error:', err)));

  res.json({ ok: true, startedAt, pipelines: Object.keys(tasks) });
});

// ===========================================================================
// SCHEDULER
// ===========================================================================

let _schedulerStarted = false;

function startIngestionScheduler() {
  if (_schedulerStarted) return;
  _schedulerStarted = true;

  console.log('[news] Starting ingestion schedulers...');

  // Pipeline 1 · Local — every 30 minutes
  setInterval(() => {
    ingestAllKnownLocations().catch((err) => console.error('[news] local ingest error:', err));
  }, 30 * 60 * 1000);

  // Pipeline 2 · Categories — every 2 hours
  setInterval(() => {
    ingestAllCategories().catch((err) => console.error('[news] category ingest error:', err));
  }, 2 * 60 * 60 * 1000);

  // Pipeline 3 · Sports teams — every 4 hours
  setInterval(() => {
    ingestAllFollowedTeams().catch((err) => console.error('[news] sports ingest error:', err));
  }, 4 * 60 * 60 * 1000);

  // Pipeline 4 · Reddit — every 30 minutes
  setInterval(() => {
    ingestAllMonitoredSubreddits().catch((err) => console.error('[news] reddit ingest error:', err));
  }, 30 * 60 * 1000);

  // Kick off an initial run (staggered to spread load)
  setTimeout(() => ingestAllCategories().catch(console.error), 10 * 1000);
  setTimeout(() => ingestAllKnownLocations().catch(console.error), 30 * 1000);
  setTimeout(() => ingestAllFollowedTeams().catch(console.error), 60 * 1000);
  setTimeout(() => ingestAllMonitoredSubreddits().catch(console.error), 90 * 1000);
}

module.exports = { router, startIngestionScheduler };
