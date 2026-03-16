const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../models/Article', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findDuplicate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findById: jest.fn(),
  deleteMany: jest.fn()
}));
jest.mock('../models/NewsIngestionRecord', () => ({
  create: jest.fn(),
  deleteMany: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn()
}));
jest.mock('../models/RssSource', () => ({ find: jest.fn() }));
jest.mock('../models/NewsPreferences', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
  getOrCreate: jest.fn()
}));
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('node-geocoder', () => jest.fn(() => ({ geocode: jest.fn().mockResolvedValue([]) })));
jest.mock('../services/newsIngestion.local', () => ({
  triggerLocationIngest: jest.fn(),
  ingestLocalNews: jest.fn(),
  ingestAllKnownLocations: jest.fn().mockResolvedValue({ ok: true })
}));
jest.mock('../services/newsIngestion.categories', () => ({
  ingestAllCategories: jest.fn().mockResolvedValue({ ok: true })
}));
jest.mock('../services/newsIngestion.sports', () => ({
  ingestAllFollowedTeams: jest.fn().mockResolvedValue({ ok: true })
}));
jest.mock('../services/newsIngestion.social', () => ({
  ingestAllMonitoredSubreddits: jest.fn().mockResolvedValue({ ok: true })
}));

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Article = require('../models/Article');
const NewsIngestionRecord = require('../models/NewsIngestionRecord');
const { ingestAllKnownLocations } = require('../services/newsIngestion.local');
const { ingestAllCategories } = require('../services/newsIngestion.categories');
const { ingestAllFollowedTeams } = require('../services/newsIngestion.sports');
const { ingestAllMonitoredSubreddits } = require('../services/newsIngestion.social');
const newsRoutes = require('./news');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/news', newsRoutes.router);
  return app;
};

const mockAdmin = () => {
  User.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: 'user-1', isAdmin: true })
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'user-1' }));
  mockAdmin();
});

describe('News ingestion observability compatibility endpoints', () => {
  it('triggers full ingestion through /api/news/ingest for admins', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/news/ingest')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.pipelines).toEqual(expect.arrayContaining(['local', 'categories', 'sports', 'social']));
    expect(ingestAllKnownLocations).toHaveBeenCalledTimes(1);
    expect(ingestAllCategories).toHaveBeenCalledTimes(1);
    expect(ingestAllFollowedTeams).toHaveBeenCalledTimes(1);
    expect(ingestAllMonitoredSubreddits).toHaveBeenCalledTimes(1);
  });

  it('returns scheduler info payload without route-not-found', async () => {
    const app = buildApp();

    const response = await request(app)
      .get('/api/news/schedule-info')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('schedulerRunning');
    expect(response.body).toHaveProperty('intervalMs');
    expect(response.body.intervalMs).toBeGreaterThan(0);
  });

  it('returns ingestion statistics expected by moderation dashboard', async () => {
    const app = buildApp();
    NewsIngestionRecord.countDocuments
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(67);
    Article.countDocuments.mockResolvedValue(345);
    NewsIngestionRecord.aggregate
      .mockResolvedValueOnce([{ _id: 'local', count: 8 }])
      .mockResolvedValueOnce([{ _id: 'inserted', count: 10 }])
      .mockResolvedValueOnce([{ _id: 'Reuters', total: 4, processed: 4, failed: 0 }]);

    const response = await request(app)
      .get('/api/news/ingestion-stats')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.totals).toEqual({
      today: 12,
      week: 67,
      activeArticles: 345
    });
    expect(response.body.byScope).toEqual({ local: 8 });
    expect(response.body.byStatus).toEqual({ inserted: 10 });
    expect(response.body.bySource).toEqual([
      { source: 'Reuters', total: 4, processed: 4, failed: 0 }
    ]);
    expect(response.body.nameToAdapterKey).toEqual({ Reuters: 'categories' });
  });
});
