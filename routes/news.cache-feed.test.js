const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn((token, secret, callback) => callback(null, { userId: 'user-1' }))
}));
jest.mock('../models/Article', () => ({
  find: jest.fn(),
  countDocuments: jest.fn()
}));
jest.mock('../models/ArticleImpression', () => ({
  upsertImpression: jest.fn().mockResolvedValue({})
}));
jest.mock('../models/NewsIngestionRecord', () => ({
  create: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn()
}));
jest.mock('../models/LocationNewsCache', () => ({
  countDocuments: jest.fn(),
  find: jest.fn()
}));
jest.mock('../models/NewsPreferences', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  getOrCreate: jest.fn()
}));
jest.mock('../models/User', () => ({
  findById: jest.fn()
}));
jest.mock('../services/newsIngestion.local', () => ({
  triggerLocationIngest: jest.fn()
}));
jest.mock('../services/newsIngestion.categories', () => ({ ingestAllCategories: jest.fn() }));
jest.mock('../services/newsIngestion.sports', () => ({ ingestAllFollowedTeams: jest.fn() }));
jest.mock('../services/newsIngestion.social', () => ({ ingestAllMonitoredSubreddits: jest.fn() }));
jest.mock('../services/sportsScheduleIngestion', () => ({
  getTeamSchedules: jest.fn(),
  getLeagueStatusMap: jest.fn(),
  getAllLeagueStatuses: jest.fn()
}));
jest.mock('../services/zipLocationIndex', () => ({
  resolveZipLocation: jest.fn(),
  resolveZipLocationByCityState: jest.fn()
}));
jest.mock('../services/locationCacheService', () => ({
  getArticlesForLocation: jest.fn(),
  getCacheMetrics: jest.fn(),
  searchCachedArticles: jest.fn()
}));
jest.mock('../services/locationNormalizer', () => ({
  normalizeLocationInput: jest.fn(),
  resolvePrimaryLocation: jest.fn()
}));
jest.mock('../services/cacheRefreshWorker', () => ({
  REFRESH_INTERVAL_MS: 15 * 60 * 1000,
  getCacheSchedulerState: jest.fn(() => ({ schedulerRunning: true, intervalMs: 900000 })),
  refreshAllCachedLocations: jest.fn().mockResolvedValue({ refreshed: 1 }),
  startCacheRefreshScheduler: jest.fn()
}));
jest.mock('../services/locationPreloader', () => ({
  preloadCommonLocations: jest.fn().mockResolvedValue(undefined)
}));

const NewsPreferences = require('../models/NewsPreferences');
const User = require('../models/User');
const ArticleImpression = require('../models/ArticleImpression');
const { getArticlesForLocation, searchCachedArticles, getCacheMetrics } = require('../services/locationCacheService');
const { resolvePrimaryLocation } = require('../services/locationNormalizer');
const newsRoutes = require('./news');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/news', newsRoutes.router);
  return app;
}

describe('news cache-backed routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    NewsPreferences.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ locations: [{ city: 'San Marcos', state: 'Texas', zipCode: '78666', isPrimary: true }] }) });
    User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
    resolvePrimaryLocation.mockResolvedValue({ city: 'san_marcos', state: 'tx', stateFull: 'texas', country: 'us', locationKey: 'san_marcos_tx_us' });
    getArticlesForLocation.mockResolvedValue({
      cacheHit: true,
      locationKey: 'san_marcos_tx_us',
      articles: [
        { _id: '1', title: 'Local update', link: 'https://example.com/local', url: 'https://example.com/local', tier: 'local', locationKey: 'san_marcos_tx_us' },
        { _id: '2', title: 'State update', link: 'https://example.com/state', url: 'https://example.com/state', tier: 'state', locationKey: 'san_marcos_tx_us' }
      ]
    });
    searchCachedArticles.mockResolvedValue([
      { _id: '1', title: 'Local update', link: 'https://example.com/local', url: 'https://example.com/local', tier: 'local', locationKey: 'san_marcos_tx_us' }
    ]);
    getCacheMetrics.mockResolvedValue({ cachedLocations: 3, totalArticles: 12, freshCount: 3, staleCount: 0, errorCount: 0 });
  });

  it('returns paginated cache-backed feed articles', async () => {
    const response = await request(buildApp())
      .get('/api/news/feed?limit=1')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.articles).toHaveLength(1);
    expect(response.body.location).toMatchObject({ locationKey: 'san_marcos_tx_us', cacheHit: true });
    expect(response.body.pagination).toMatchObject({ page: 1, total: 2, pages: 2 });
    expect(getArticlesForLocation).toHaveBeenCalledWith('san_marcos_tx_us', expect.objectContaining({ normalizedLocation: expect.any(Object) }));
  });

  it('filters cache-backed feed by category case-insensitively', async () => {
    getArticlesForLocation.mockResolvedValueOnce({
      cacheHit: true,
      locationKey: 'san_marcos_tx_us',
      articles: [
        { _id: '1', title: 'Health update', link: 'https://example.com/health', url: 'https://example.com/health', tier: 'local', category: 'Health', locationKey: 'san_marcos_tx_us' },
        { _id: '2', title: 'Sports update', link: 'https://example.com/sports', url: 'https://example.com/sports', tier: 'state', category: 'sports', locationKey: 'san_marcos_tx_us' }
      ]
    });

    const response = await request(buildApp())
      .get('/api/news/feed?category=health')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.articles).toHaveLength(1);
    expect(response.body.articles[0]).toMatchObject({ title: 'Health update', category: 'Health' });
  });

  it('tracks impressions using article links and location keys', async () => {
    const response = await request(buildApp())
      .post('/api/news/impressions')
      .set('Authorization', 'Bearer token')
      .send({ impressions: [{ articleLink: 'https://example.com/local', locationKey: 'san_marcos_tx_us', type: 'click' }] });

    expect(response.status).toBe(204);
    expect(ArticleImpression.upsertImpression).toHaveBeenCalledWith(
      'user-1',
      'https://example.com/local',
      'click',
      expect.objectContaining({ articleLink: 'https://example.com/local', locationKey: 'san_marcos_tx_us' })
    );
  });

  it('searches across cached articles', async () => {
    const response = await request(buildApp())
      .get('/api/news/search?q=local')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.articles).toHaveLength(1);
    expect(searchCachedArticles).toHaveBeenCalledWith('local', { locationKey: 'san_marcos_tx_us' });
  });

  it('returns cache-backed sources metadata', async () => {
    const response = await request(buildApp())
      .get('/api/news/sources')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.sources[0]).toMatchObject({ id: 'google-news', name: 'Google News Cache' });
  });
});
