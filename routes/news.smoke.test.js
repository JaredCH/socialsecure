/**
 * Synthetic smoke tests for:
 *  - Weather caching / TTL / observability
 *  - Weather location fallback chain
 *  - Keyword rename/edit endpoint
 *  - NewsAPI adapter (fetchNewsApiSource)
 *  - Local source planner tier-5
 */
const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../models/Article', () => ({ find: jest.fn(), countDocuments: jest.fn(), findDuplicate: jest.fn(), findByIdAndUpdate: jest.fn(), findById: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../models/RssSource', () => ({ find: jest.fn(), findOne: jest.fn(), create: jest.fn(), findByIdAndDelete: jest.fn(), findByIdAndUpdate: jest.fn(), updateMany: jest.fn() }));
jest.mock('../models/NewsPreferences', () => ({ findOne: jest.fn(), create: jest.fn(), findOneAndUpdate: jest.fn(), updateMany: jest.fn() }));
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/NewsIngestionRecord', () => ({ create: jest.fn(), deleteMany: jest.fn() }));
jest.mock('node-geocoder', () => jest.fn(() => ({ geocode: jest.fn().mockResolvedValue([]) })));

const jwt = require('jsonwebtoken');
const NewsPreferences = require('../models/NewsPreferences');
const User = require('../models/User');
const newsRoutes = require('./news');
const { internals, adapters } = newsRoutes;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/news', newsRoutes.router);
  return app;
};

beforeEach(() => {
  jest.clearAllMocks();
  jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'user-1' }));
  // Reset weather cache between tests
  internals.weatherCache.clear();
  internals.weatherCacheMetrics.hits = 0;
  internals.weatherCacheMetrics.misses = 0;
  internals.weatherCacheMetrics.errors = 0;
  internals.weatherCacheMetrics.totalLatencyMs = 0;
  internals.weatherCacheMetrics.fetchCount = 0;
});

// ============================================
// WEATHER CACHE AND OBSERVABILITY
// ============================================
describe('Weather cache internals', () => {
  it('exports WEATHER_CACHE_TTL_MS', () => {
    expect(typeof internals.WEATHER_CACHE_TTL_MS).toBe('number');
    expect(internals.WEATHER_CACHE_TTL_MS).toBeGreaterThanOrEqual(60000);
  });

  it('exports weatherCache as a Map', () => {
    expect(internals.weatherCache).toBeInstanceOf(Map);
  });

  it('exports weatherCacheMetrics with expected keys', () => {
    const m = internals.weatherCacheMetrics;
    expect(m).toHaveProperty('hits');
    expect(m).toHaveProperty('misses');
    expect(m).toHaveProperty('errors');
    expect(m).toHaveProperty('totalLatencyMs');
    expect(m).toHaveProperty('fetchCount');
  });

  it('buildWeatherCacheKey rounds to 2 decimals', () => {
    const key = internals.buildWeatherCacheKey(30.26789, -97.74321);
    expect(key).toBe('weather:30.27:-97.74');
  });

  it('buildWeatherCacheKey coalesces nearby coordinates to same key', () => {
    // 30.271 → 30.27 and 30.274 → 30.27 (same); -97.741 → -97.74 and -97.744 → -97.74 (same)
    const key1 = internals.buildWeatherCacheKey(30.271, -97.741);
    const key2 = internals.buildWeatherCacheKey(30.274, -97.744);
    expect(key1).toBe(key2);
  });

  it('fetchWeatherForLocation returns error when lat/lon missing', async () => {
    const result = await internals.fetchWeatherForLocation({});
    expect(result.weather).toBeNull();
    expect(result.error).toContain('Unable to resolve');
    expect(result.cacheHit).toBe(false);
  });

  it('fetchWeatherForLocation returns cached result on second call', async () => {
    // Pre-populate cache
    const cacheKey = internals.buildWeatherCacheKey(30.27, -97.74);
    const fakeWeather = { current: { temperature: 75 }, updatedAt: new Date().toISOString() };
    internals.weatherCache.set(cacheKey, { weather: fakeWeather, timestamp: Date.now() });

    const result = await internals.fetchWeatherForLocation({ lat: 30.27, lon: -97.74 });
    expect(result.cacheHit).toBe(true);
    expect(result.weather.current.temperature).toBe(75);
    expect(internals.weatherCacheMetrics.hits).toBe(1);
  });

  it('fetchWeatherForLocation treats expired cache as miss', async () => {
    const cacheKey = internals.buildWeatherCacheKey(30.27, -97.74);
    const fakeWeather = { current: { temperature: 75 } };
    // Set timestamp far in the past
    internals.weatherCache.set(cacheKey, { weather: fakeWeather, timestamp: Date.now() - 99999999 });

    // This will try to fetch real data and fail (no network), but should be a miss
    const result = await internals.fetchWeatherForLocation({ lat: 30.27, lon: -97.74 });
    expect(result.cacheHit).toBe(false);
    expect(internals.weatherCacheMetrics.misses).toBe(1);
  });
});

// ============================================
// WEATHER FALLBACK CHAIN (via GET /api/news/weather)
// ============================================
describe('Weather fallback chain', () => {
  it('returns empty locations with cache metrics when no weather locations and no fallback', async () => {
    const app = buildApp();
    NewsPreferences.findOne.mockResolvedValue({ weatherLocations: [], locations: [] });
    User.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });

    const res = await request(app)
      .get('/api/news/weather')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.locations).toEqual([]);
    expect(res.body._cache).toBeDefined();
    expect(res.body._cache).toHaveProperty('ttlMs');
    expect(res.body._cache).toHaveProperty('hits');
    expect(res.body._cache).toHaveProperty('misses');
    expect(res.body.fallbackSource).toBeNull();
  });

  it('falls back to news primary location when no weather locations exist', async () => {
    const app = buildApp();
    const primaryLoc = { city: 'Dallas', state: 'TX', lat: 32.78, lon: -96.80, isPrimary: true };
    NewsPreferences.findOne.mockResolvedValue({
      weatherLocations: [],
      locations: [primaryLoc]
    });

    const res = await request(app)
      .get('/api/news/weather')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.fallbackSource).toBe('newsLocation');
    expect(res.body.locations.length).toBe(1);
  });

  it('falls back to profile location when no weather or news locations exist', async () => {
    const app = buildApp();
    NewsPreferences.findOne.mockResolvedValue({
      weatherLocations: [],
      locations: []
    });
    User.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        location: { lat: 40.71, lon: -74.01, city: 'New York', state: 'NY' }
      })
    });

    const res = await request(app)
      .get('/api/news/weather')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.fallbackSource).toBe('profileLocation');
    expect(res.body.locations.length).toBe(1);
  });

  it('falls back to registered profile zip code when structured profile location is missing', async () => {
    const app = buildApp();
    NewsPreferences.findOne.mockResolvedValue({
      weatherLocations: [],
      locations: []
    });
    User.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        city: 'Dallas',
        state: 'TX',
        zipCode: '75201'
      })
    });

    const res = await request(app)
      .get('/api/news/weather')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.fallbackSource).toBe('profileLocation');
    expect(res.body.locations.length).toBe(1);
    expect(res.body.locations[0].zipCode).toBe('75201');
  });

  it('uses saved weather locations without fallback when available', async () => {
    const app = buildApp();
    const savedLoc = {
      _id: 'w1', city: 'Austin', state: 'TX', lat: 30.27, lon: -97.74, isPrimary: true,
      toObject: function() { return { _id: 'w1', city: 'Austin', state: 'TX', lat: 30.27, lon: -97.74, isPrimary: true }; }
    };
    NewsPreferences.findOne.mockResolvedValue({
      weatherLocations: [savedLoc],
      locations: []
    });

    const res = await request(app)
      .get('/api/news/weather')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.fallbackSource).toBeNull();
    expect(res.body.locations.length).toBe(1);
  });
});

// ============================================
// KEYWORD RENAME ENDPOINT
// ============================================
describe('PUT /api/news/preferences/keywords/:keyword', () => {
  it('rejects empty new keyword', async () => {
    const app = buildApp();

    const res = await request(app)
      .put('/api/news/preferences/keywords/bitcoin')
      .set('Authorization', 'Bearer valid-token')
      .send({ keyword: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('New keyword is required');
  });

  it('rejects when new keyword is the same as old keyword', async () => {
    const app = buildApp();

    const res = await request(app)
      .put('/api/news/preferences/keywords/bitcoin')
      .set('Authorization', 'Bearer valid-token')
      .send({ keyword: 'Bitcoin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('must be different');
  });

  it('returns 404 when preferences not found', async () => {
    const app = buildApp();
    NewsPreferences.findOne.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/news/preferences/keywords/bitcoin')
      .set('Authorization', 'Bearer valid-token')
      .send({ keyword: 'ethereum' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Preferences not found');
  });

  it('returns 404 when old keyword not found', async () => {
    const app = buildApp();
    NewsPreferences.findOne.mockResolvedValue({
      followedKeywords: [{ keyword: 'ai' }],
      save: jest.fn()
    });

    const res = await request(app)
      .put('/api/news/preferences/keywords/bitcoin')
      .set('Authorization', 'Bearer valid-token')
      .send({ keyword: 'ethereum' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Keyword not found');
  });

  it('returns 409 when new keyword already exists', async () => {
    const app = buildApp();
    NewsPreferences.findOne.mockResolvedValue({
      followedKeywords: [{ keyword: 'bitcoin' }, { keyword: 'ethereum' }],
      save: jest.fn()
    });

    const res = await request(app)
      .put('/api/news/preferences/keywords/bitcoin')
      .set('Authorization', 'Bearer valid-token')
      .send({ keyword: 'Ethereum' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it('successfully renames a keyword', async () => {
    const app = buildApp();
    const mockPrefs = {
      followedKeywords: [{ keyword: 'bitcoin' }, { keyword: 'ai' }],
      save: jest.fn().mockResolvedValue(true)
    };
    NewsPreferences.findOne.mockResolvedValue(mockPrefs);

    const res = await request(app)
      .put('/api/news/preferences/keywords/bitcoin')
      .set('Authorization', 'Bearer valid-token')
      .send({ keyword: 'Ethereum' });

    expect(res.status).toBe(200);
    expect(mockPrefs.save).toHaveBeenCalled();
    expect(mockPrefs.followedKeywords[0].keyword).toBe('ethereum');
  });
});

describe('PUT /api/news/preferences', () => {
  it('accepts followed sports teams as plain string ids', async () => {
    const app = buildApp();
    const savedPreferences = {
      user: 'user-1',
      followedSportsTeams: ['dal-cowboys', 'kc-chiefs'],
      hiddenCategories: []
    };

    NewsPreferences.findOneAndUpdate.mockResolvedValue(savedPreferences);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ zipCode: '75201' }) });

    const res = await request(app)
      .put('/api/news/preferences')
      .set('Authorization', 'Bearer valid-token')
      .send({ followedSportsTeams: ['dal-cowboys', 'kc-chiefs'] });

    expect(res.status).toBe(200);
    expect(NewsPreferences.findOneAndUpdate).toHaveBeenCalledWith(
      { user: 'user-1' },
      { $set: { followedSportsTeams: ['dal-cowboys', 'kc-chiefs'] } },
      { new: true, upsert: true }
    );
    expect(res.body.preferences.followedSportsTeams).toEqual(['dal-cowboys', 'kc-chiefs']);
  });
});

// ============================================
// NEWSAPI ADAPTER
// ============================================
describe('NewsAPI adapter', () => {
  it('exports fetchNewsApiSource', () => {
    expect(typeof adapters.fetchNewsApiSource).toBe('function');
  });

  it('returns empty array when NEWS_API_KEY is not set', async () => {
    // NEWS_API_KEY defaults to empty string
    const result = await adapters.fetchNewsApiSource('Austin TX local news', { city: 'austin', stateAbbrev: 'tx' });
    expect(result).toEqual([]);
  });
});

// ============================================
// LOCAL SOURCE PLANNER TIER-5
// ============================================
describe('Local source planner tier-5 (NewsAPI)', () => {
  const { buildLocalSourcePlan } = require('../services/newsLocalSourcePlanner');

  it('does not include tier-5 when newsApi is disabled', () => {
    const plan = buildLocalSourcePlan(
      { city: 'Austin', stateAbbrev: 'tx' },
      { enabledTiers: { googleNews: false, tvAffiliate: false, patch: false, newspaper: false, reddit: false, newsApi: false } }
    );
    expect(plan.sources.filter(s => s.tier === 5)).toHaveLength(0);
  });

  it('includes tier-5 when newsApi is enabled', () => {
    const plan = buildLocalSourcePlan(
      { city: 'Austin', stateAbbrev: 'tx' },
      { enabledTiers: { googleNews: false, tvAffiliate: false, patch: false, newspaper: false, reddit: false, newsApi: true } }
    );
    const tier5 = plan.sources.filter(s => s.tier === 5);
    expect(tier5).toHaveLength(1);
    expect(tier5[0].providerId).toBe('newsapi');
    expect(tier5[0].label).toContain('NewsAPI');
  });
});

// ============================================
// NEWSAPI FEATURE FLAG
// ============================================
describe('NewsAPI feature flag exports', () => {
  it('exports NEWS_LOCAL_NEWSAPI_ENABLED flag', () => {
    expect(internals.NEWS_LOCAL_NEWSAPI_ENABLED).toBeDefined();
    // Default is false since env var is not set
    expect(internals.NEWS_LOCAL_NEWSAPI_ENABLED).toBe(false);
  });

  it('exports NEWS_API_KEY', () => {
    expect(internals.NEWS_API_KEY).toBeDefined();
    expect(internals.NEWS_API_KEY).toBe('');
  });
});
