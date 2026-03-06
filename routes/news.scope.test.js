const request = require('supertest');
const express = require('express');
const mockGeocode = jest.fn();

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

jest.mock('../models/Article', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findDuplicate: jest.fn(),
  findByIdAndUpdate: jest.fn()
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
jest.mock('node-geocoder', () => jest.fn(() => ({ geocode: mockGeocode })));

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
    Article.findDuplicate.mockResolvedValue(null);
    mockGeocode.mockReset();
    mockGeocode.mockResolvedValue([]);
    newsRoutes.internals.geocodeContextCache.clear();
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
        hiddenCategories: [],
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
    expect(response.body.articles.length).toBeGreaterThanOrEqual(1);
    expect(response.body.articles[0]._id).toBe('local-ai-1');
  });

  it('uses zip geocoding to keep regional scope active and match state-level news', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'state-1',
        title: 'Texas emergency update',
        description: '',
        source: 'State Wire',
        sourceType: 'rss',
        sourceId: 'state-wire',
        topics: ['politics'],
        locations: ['Texas', 'USA'],
        localityLevel: 'state',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        _id: 'global-3',
        title: 'Global market update',
        description: '',
        source: 'Global Wire',
        sourceType: 'rss',
        sourceId: 'global-wire',
        topics: ['finance'],
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'regional',
      locations: [{ country: 'US', zipCode: '78666', isPrimary: true }],
      followedKeywords: [],
      hiddenCategories: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: 'US', zipCode: '78666' }) });
    mockGeocode.mockResolvedValue([{
      city: 'San Marcos',
      county: 'Hays County',
      state: 'Texas',
      stateCode: 'TX',
      country: 'United States',
      countryCode: 'US'
    }]);
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=regional')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.requestedScope).toBe('regional');
    expect(response.body.personalization.activeScope).toBe('regional');
    expect(response.body.personalization.fallbackApplied).toBe(false);
    expect(response.body.personalization.locationContext.hasState).toBe(true);
    expect(response.body.personalization.locationContext.source).toBe('preferences+zipLookup');
    expect(response.body.articles.length).toBeGreaterThanOrEqual(1);
    expect(response.body.articles[0]._id).toBe('state-1');
  });

  it('includes country-level articles in regional scope without falling back', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'us-1',
        title: 'National infrastructure update',
        description: '',
        source: 'US Wire',
        sourceType: 'rss',
        sourceId: 'us-wire',
        topics: ['politics'],
        locations: ['United States', 'US'],
        localityLevel: 'country',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        _id: 'global-4',
        title: 'Global market update',
        description: '',
        source: 'Global Wire',
        sourceType: 'rss',
        sourceId: 'global-wire',
        topics: ['finance'],
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'regional',
      locations: [{ country: 'US', zipCode: '78666', isPrimary: true }],
      followedKeywords: [],
      hiddenCategories: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: 'US', zipCode: '78666' }) });
    mockGeocode.mockResolvedValue([{
      city: 'San Marcos',
      county: 'Hays County',
      state: 'Texas',
      stateCode: 'TX',
      country: 'United States',
      countryCode: 'US'
    }]);
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=regional')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.requestedScope).toBe('regional');
    expect(response.body.personalization.activeScope).toBe('regional');
    expect(response.body.personalization.fallbackApplied).toBe(false);
    expect(response.body.articles.length).toBeGreaterThanOrEqual(1);
    expect(response.body.articles[0]._id).toBe('us-1');
  });

  it('mixes global articles into local scope results', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'local-1',
        title: 'Austin city council update',
        description: 'Local government news in Austin',
        source: 'Austin Daily',
        sourceType: 'rss',
        sourceId: 'austin-daily',
        topics: ['politics'],
        locations: ['Austin', 'Texas', 'USA'],
        localityLevel: 'city',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        _id: 'global-mix-1',
        title: 'International climate summit',
        description: 'Leaders gather for climate talks',
        source: 'World Wire',
        sourceType: 'rss',
        sourceId: 'world-wire',
        topics: ['politics'],
        locations: [],
        localityLevel: 'global',
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
      .get('/api/news/feed?scope=local')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.activeScope).toBe('local');
    // Local article should be first, global mixed in after
    expect(response.body.articles.length).toBe(2);
    expect(response.body.articles[0]._id).toBe('local-1');
    expect(response.body.articles[1]._id).toBe('global-mix-1');
  });

  it('infers location from article title text at query time', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'inferred-1',
        title: 'New tech hub opens in Austin, TX',
        description: 'A major technology company expands',
        source: 'Tech News',
        sourceType: 'rss',
        sourceId: 'tech-news',
        topics: ['technology'],
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        _id: 'unrelated-1',
        title: 'Stock market closes higher',
        description: 'Wall Street had a good day',
        source: 'Finance Wire',
        sourceType: 'rss',
        sourceId: 'finance-wire',
        topics: ['finance'],
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
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
      .get('/api/news/feed?scope=local')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.activeScope).toBe('local');
    // The "Austin, TX" article should be detected as local even with empty locations array
    expect(response.body.articles.some(a => a._id === 'inferred-1')).toBe(true);
    expect(response.body.articles[0]._id).toBe('inferred-1');
  });

  it('matches articles mentioning US state names to regional scope', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'state-name-1',
        title: 'California wildfire update',
        description: 'Fires continue to spread in California',
        source: 'State News',
        sourceType: 'rss',
        sourceId: 'state-news',
        topics: ['politics'],
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'regional',
      locations: [{ state: 'California', country: 'USA', isPrimary: true }],
      followedKeywords: [],
      hiddenCategories: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: 'California', country: 'USA', zipCode: null }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=regional')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.activeScope).toBe('regional');
    expect(response.body.articles.length).toBeGreaterThanOrEqual(1);
    expect(response.body.articles[0]._id).toBe('state-name-1');
  });

  it('uses city geocoding enrichment to keep regional scope active when state is missing', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'regional-city-1',
        title: 'Central Texas infrastructure update',
        description: '',
        source: 'Regional Wire',
        sourceType: 'rss',
        sourceId: 'regional-wire',
        topics: ['politics'],
        locations: ['Texas', 'US'],
        localityLevel: 'state',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'regional',
      locations: [{ city: 'San Marcos', country: 'US', isPrimary: true }],
      followedKeywords: [],
      hiddenCategories: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: 'San Marcos', county: null, state: null, country: 'US', zipCode: null }) });
    mockGeocode.mockResolvedValue([{
      city: 'San Marcos',
      county: 'Hays County',
      state: 'Texas',
      stateCode: 'TX',
      country: 'United States',
      countryCode: 'US'
    }]);
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=regional')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.activeScope).toBe('regional');
    expect(response.body.personalization.fallbackApplied).toBe(false);
    expect(response.body.personalization.locationContext.hasState).toBe(true);
  });

  it('reuses stale geocode cache on upstream failure to avoid unnecessary national fallback', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'regional-cache-1',
        title: 'Texas emergency update',
        description: '',
        source: 'State Wire',
        sourceType: 'rss',
        sourceId: 'state-wire',
        topics: ['politics'],
        locations: ['Texas', 'USA'],
        localityLevel: 'state',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'regional',
      locations: [{ country: 'US', zipCode: '78666', isPrimary: true }],
      followedKeywords: [],
      hiddenCategories: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: 'US', zipCode: '78666' }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    mockGeocode.mockResolvedValueOnce([{
      city: 'San Marcos',
      county: 'Hays County',
      state: 'Texas',
      stateCode: 'TX',
      country: 'United States',
      countryCode: 'US'
    }]);

    const firstResponse = await request(app)
      .get('/api/news/feed?scope=regional')
      .set('Authorization', 'Bearer token');
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.personalization.activeScope).toBe('regional');

    mockGeocode.mockRejectedValueOnce(new Error('upstream unavailable'));
    const secondResponse = await request(app)
      .get('/api/news/feed?scope=regional')
      .set('Authorization', 'Bearer token');

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.personalization.activeScope).toBe('regional');
    expect(secondResponse.body.personalization.fallbackApplied).toBe(false);
  });

  it('treats nearby zip prefixes as local proximity matches', async () => {
    const proximityMatch = newsRoutes.internals.articleMatchesLocation(
      {
        title: 'Local transit update',
        description: '',
        locations: [],
        assignedZipCode: '78759'
      },
      {
        zipCode: '78701',
        zipCodeValues: ['78701'],
        cityValues: [],
        countyValues: [],
        stateValues: [],
        countryValues: []
      }
    );

    expect(proximityMatch.zipCode).toBe(true);
  });

  it('uses findDuplicate and updates existing article only when incoming publishedAt is newer', async () => {
    const older = new Date('2026-03-01T00:00:00.000Z');
    const newer = new Date('2026-03-02T00:00:00.000Z');
    Article.findDuplicate.mockResolvedValue({
      _id: 'existing-1',
      publishedAt: older,
      topics: ['technology'],
      locations: ['austin'],
      assignedZipCode: '78701'
    });

    const result = await newsRoutes.internals.processArticles([
      {
        title: 'Austin update',
        description: '',
        source: 'Wire',
        sourceId: 'wire-1',
        url: 'https://example.com/article-1',
        publishedAt: newer,
        topics: ['ai'],
        locations: ['austin'],
        assignedZipCode: '78759'
      }
    ]);

    expect(Article.findDuplicate).toHaveBeenCalledWith('https://example.com/article-1', 'wire-1');
    expect(Article.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(0);
  });

  it('returns null for unparseable publication dates', () => {
    const parsed = newsRoutes.internals.getItemPublishedAt({
      isoDate: 'not-a-date',
      pubDate: null
    });

    expect(parsed).toBeNull();
  });

  it('assigns article zip from title location geocoding when zip is not already present', async () => {
    mockGeocode.mockResolvedValue([{ zipcode: '10001' }]);
    const assignedZip = await newsRoutes.internals.resolveAssignedZipCode({
      locationTokens: [],
      source: { name: 'Metro Wire' },
      item: { title: 'Transit expansions announced in New York, NY' }
    });

    expect(assignedZip).toBe('10001');
  });
});
