const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

jest.mock('../models/Article', () => ({
  find: jest.fn(),
  countDocuments: jest.fn()
}));

jest.mock('../models/RssSource', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateMany: jest.fn()
}));

jest.mock('../models/NewsPreferences', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn()
}));

jest.mock('../models/User', () => ({
  findById: jest.fn()
}));

const jwt = require('jsonwebtoken');
const Article = require('../models/Article');
const NewsPreferences = require('../models/NewsPreferences');
const User = require('../models/User');
const newsRoutes = require('./news');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/news', newsRoutes.router);
  return app;
};

const buildFindChain = (items = []) => {
  let skipValue = 0;
  let limitValue = items.length;
  const chain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockImplementation((value) => {
      skipValue = value;
      return chain;
    }),
    limit: jest.fn().mockImplementation((value) => {
      limitValue = value;
      return chain;
    }),
    lean: jest.fn().mockImplementation(async () => items.slice(skipValue, skipValue + limitValue))
  };
  return chain;
};

describe('News scope routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'user-1' }));
    Article.countDocuments.mockResolvedValue(2);
  });

  it('defaults to local scope when profile location exists and no explicit preference is stored', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'global-1',
        title: 'Global Headline',
        description: '',
        source: 'Wire',
        sourceType: 'rss',
        sourceId: 'wire',
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        _id: 'city-1',
        title: 'Austin Local Update',
        description: '',
        source: 'Austin Daily',
        sourceType: 'rss',
        sourceId: 'austin-daily',
        locations: ['Austin'],
        localityLevel: 'city',
        publishedAt: new Date('2026-02-20T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue(null);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: 'Austin', state: 'Texas', country: 'USA' }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.requestedScope).toBe('local');
    expect(response.body.personalization.activeScope).toBe('local');
    expect(response.body.personalization.fallbackApplied).toBe(false);
    expect(response.body.articles[0]._id).toBe('city-1');
  });

  it('keeps local scope active when zip + country profile data is available', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'zip-1',
        title: 'Zip Headline',
        description: '',
        source: 'Metro Wire',
        sourceType: 'rss',
        sourceId: 'metro-wire',
        locations: ['10001', 'US'],
        localityLevel: 'city',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        _id: 'global-2',
        title: 'World Headline',
        description: '',
        source: 'World Wire',
        sourceType: 'rss',
        sourceId: 'world-wire',
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'local',
      locations: [{ country: 'US', isPrimary: true }],
      followedKeywords: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: 'US', zipCode: '10001' }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=local')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.requestedScope).toBe('local');
    expect(response.body.personalization.activeScope).toBe('local');
    expect(response.body.personalization.fallbackApplied).toBe(false);
    expect(response.body.personalization.locationContext.hasZipCode).toBe(true);
  });

  it('falls back from local request to national when only country location is available', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'country-1',
        title: 'USA Headline',
        description: '',
        source: 'US News',
        sourceType: 'rss',
        sourceId: 'us-news',
        locations: ['USA'],
        localityLevel: 'country',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'local',
      locations: [{ country: 'USA', isPrimary: true }],
      followedKeywords: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: 'USA', zipCode: null }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=local')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.requestedScope).toBe('local');
    expect(response.body.personalization.activeScope).toBe('national');
    expect(response.body.personalization.fallbackApplied).toBe(true);
    expect(response.body.personalization.locationContext.hasCountry).toBe(true);
  });

  it('keeps local scope active when county-only profile data is available', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'county-1',
        title: 'County Alert',
        description: '',
        source: 'County Desk',
        sourceType: 'rss',
        sourceId: 'county-desk',
        locations: ['Travis County'],
        localityLevel: 'state',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'local',
      locations: [{ county: 'Travis County', isPrimary: true }],
      followedKeywords: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: 'Travis County', state: null, country: null, zipCode: null }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=local')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.requestedScope).toBe('local');
    expect(response.body.personalization.activeScope).toBe('local');
    expect(response.body.personalization.fallbackApplied).toBe(false);
    expect(response.body.personalization.locationContext.hasCounty).toBe(true);
  });

  it('seeds preferences location and local default scope from user profile on first fetch', async () => {
    const app = buildApp();
    const seededPrefs = {
      _id: 'prefs-1',
      user: 'user-1',
      defaultScope: 'local',
      locations: [{ city: 'Austin', state: 'Texas', country: 'USA', isPrimary: true }]
    };

    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: 'Austin', state: 'Texas', country: 'USA' }) });
    NewsPreferences.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    NewsPreferences.create.mockResolvedValue(seededPrefs);

    const response = await request(app)
      .get('/api/news/preferences')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(NewsPreferences.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-1',
        defaultScope: 'local',
        locations: [
          expect.objectContaining({
            city: 'Austin',
            state: 'Texas',
            country: 'USA',
            isPrimary: true
          })
        ]
      })
    );
    expect(response.body.preferences.defaultScope).toBe('local');
  });

  it('seeds zip code into default location when profile has zipCode', async () => {
    const app = buildApp();
    const seededPrefs = {
      _id: 'prefs-2',
      user: 'user-1',
      defaultScope: 'local',
      locations: [{ city: null, zipCode: '10001', state: null, country: 'US', isPrimary: true }]
    };

    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, state: null, country: 'US', zipCode: '10001' }) });
    NewsPreferences.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    NewsPreferences.create.mockResolvedValue(seededPrefs);

    const response = await request(app)
      .get('/api/news/preferences')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(NewsPreferences.create).toHaveBeenCalledWith(
      expect.objectContaining({
        locations: [
          expect.objectContaining({
            zipCode: '10001',
            country: 'US'
          })
        ]
      })
    );
  });

  it('filters local scope feed to location matches and keeps topic aliases stacked', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'local-ai-1',
        title: 'AI startup expands in Austin',
        description: 'Machine learning company opens a new office.',
        source: 'Austin Tech Wire',
        sourceType: 'rss',
        sourceId: 'austin-tech-wire',
        topics: ['artificial intelligence'],
        locations: ['Austin', 'Texas', 'USA'],
        localityLevel: 'city',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        _id: 'remote-ai-1',
        title: 'AI policy update in London',
        description: 'International machine learning policy update.',
        source: 'Global Tech',
        sourceType: 'rss',
        sourceId: 'global-tech',
        topics: ['artificial intelligence'],
        locations: ['London', 'UK'],
        localityLevel: 'city',
        publishedAt: new Date('2026-03-01T01:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'local',
      locations: [{ city: 'Austin', state: 'Texas', country: 'USA', isPrimary: true }],
      followedKeywords: [],
      hiddenCategories: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: 'Austin', county: null, state: 'Texas', country: 'USA', zipCode: null }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=local&topic=ai')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.activeScope).toBe('local');
    expect(response.body.articles).toHaveLength(1);
    expect(response.body.articles[0]._id).toBe('local-ai-1');
  });
});
