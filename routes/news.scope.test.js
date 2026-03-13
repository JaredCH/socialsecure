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
  findByIdAndUpdate: jest.fn(),
  deleteMany: jest.fn()
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
jest.mock('../models/NewsIngestionRecord', () => ({
  create: jest.fn(),
  deleteMany: jest.fn()
}));
jest.mock('node-geocoder', () => jest.fn(() => ({ geocode: mockGeocode })));

const jwt = require('jsonwebtoken');
const Article = require('../models/Article');
const NewsPreferences = require('../models/NewsPreferences');
const NewsIngestionRecord = require('../models/NewsIngestionRecord');
const User = require('../models/User');
const newsRoutes = require('./news');
const {
  US_CITY_LOCATION_ENTRIES,
  EUROPE_CITY_LOCATION_ENTRIES
} = require('../data/news/cityLocationIndex');

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
    Article.deleteMany.mockResolvedValue({ deletedCount: 0 });
    NewsIngestionRecord.deleteMany.mockResolvedValue({ deletedCount: 0 });
    mockGeocode.mockReset();
    mockGeocode.mockResolvedValue([]);
    newsRoutes.internals.geocodeContextCache.clear();
  });

  describe('default scope by location granularity', () => {
    it('defaults to national scope when user has country-only location (not local)', async () => {
      const app = buildApp();
      const feedArticles = [
        {
          _id: 'national-1',
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

      // User has country-only, no city/zip/county
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: 'USA', zipCode: null }) });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      // Country-only should default to national, NOT local
      expect(response.body.personalization.requestedScope).toBe('national');
      expect(response.body.personalization.activeScope).toBe('national');
      expect(response.body.personalization.fallbackApplied).toBe(false);
    });

    it('defaults to regional scope when user has state-only location', async () => {
      const app = buildApp();
      const feedArticles = [
        {
          _id: 'state-1',
          title: 'Texas Headline',
          description: '',
          source: 'State News',
          sourceType: 'rss',
          sourceId: 'state-news',
          locations: ['Texas'],
          localityLevel: 'state',
          publishedAt: new Date('2026-03-01T00:00:00.000Z')
        }
      ];

      // User has state-only, no city/zip/county
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: 'Texas', country: null, zipCode: null }) });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.personalization.requestedScope).toBe('regional');
      expect(response.body.personalization.activeScope).toBe('regional');
      expect(response.body.personalization.fallbackApplied).toBe(false);
    });

    it('defaults to local scope when user has city location', async () => {
      const app = buildApp();
      const feedArticles = [
        {
          _id: 'local-1',
          title: 'Austin Headline',
          description: '',
          source: 'Austin News',
          sourceType: 'rss',
          sourceId: 'austin-news',
          locations: ['Austin'],
          localityLevel: 'city',
          publishedAt: new Date('2026-03-01T00:00:00.000Z')
        }
      ];

      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: 'Austin', county: null, state: 'Texas', country: 'USA', zipCode: null }) });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.personalization.requestedScope).toBe('local');
      expect(response.body.personalization.activeScope).toBe('local');
    });

    it('defaults to local scope when user has zipCode', async () => {
      const app = buildApp();
      const feedArticles = [
        {
          _id: 'zip-1',
          title: 'Zip Headline',
          description: '',
          source: 'Metro Wire',
          sourceType: 'rss',
          sourceId: 'metro-wire',
          locations: ['10001'],
          localityLevel: 'city',
          publishedAt: new Date('2026-03-01T00:00:00.000Z')
        }
      ];

      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: 'US', zipCode: '10001' }) });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.personalization.requestedScope).toBe('local');
      expect(response.body.personalization.activeScope).toBe('local');
    });

    it('defaults to global scope when user has no location', async () => {
      const app = buildApp();
      const feedArticles = [
        {
          _id: 'global-1',
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

      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: null, zipCode: null }) });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.personalization.requestedScope).toBe('global');
      expect(response.body.personalization.activeScope).toBe('global');
    });
  });

  describe('strict local scope filtering', () => {
    it('keeps older local matches in scope even when newer global articles dominate the default candidate slice', async () => {
      const app = buildApp();
      const recentGlobalArticles = Array.from({ length: 60 }, (_, index) => ({
        _id: `global-${index + 1}`,
        title: `Global headline ${index + 1}`,
        description: 'Broader story',
        source: 'World Wire',
        sourceType: 'rss',
        sourceId: `world-wire-${index + 1}`,
        topics: ['general'],
        category: 'general',
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date(`2026-03-11T${String((index % 10) + 10).padStart(2, '0')}:00:00.000Z`)
      }));
      const olderLocalArticle = {
        _id: 'local-san-marcos-1',
        title: 'San Marcos council agenda',
        description: 'Local San Marcos government update',
        source: 'Community Impact',
        sourceType: 'googleNews',
        sourceId: 'community-impact',
        topics: ['general'],
        category: 'general',
        locations: ['san marcos, tx, us'],
        assignedZipCode: '78666',
        locationTags: {
          zipCodes: ['78666'],
          cities: ['san marcos'],
          counties: ['hays county'],
          states: ['tx'],
          countries: ['us']
        },
        localityLevel: 'city',
        publishedAt: new Date('2025-03-01T00:00:00.000Z')
      };

      NewsPreferences.findOne.mockResolvedValue({
        defaultScope: 'local',
        locations: [{ zipCode: '78666', isPrimary: true }],
        followedKeywords: [],
        followedSportsTeams: [],
        hiddenCategories: []
      });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: null, zipCode: '78666' }) });
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) return buildFindChain([]);
        if (query?.$and?.[1]?.$or) return buildFindChain([olderLocalArticle]);
        return buildFindChain(recentGlobalArticles);
      });

      const response = await request(app)
        .get('/api/news/feed?scope=local&page=1&limit=10')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.personalization.requestedScope).toBe('local');
      expect(response.body.personalization.activeScope).toBe('local');
      expect(response.body.personalization.fallbackApplied).toBe(false);
      expect(response.body.articles.some((article) => article._id === 'local-san-marcos-1')).toBe(true);
    });

    it('does not widen local scoped candidate queries with state or country clauses', async () => {
      const app = buildApp();
      const broadScopedCandidates = Array.from({ length: 250 }, (_, index) => ({
        _id: `state-${index + 1}`,
        title: `Texas headline ${index + 1}`,
        description: 'Regional story',
        source: 'State Wire',
        sourceType: 'rss',
        sourceId: `state-wire-${index + 1}`,
        topics: ['general'],
        category: 'general',
        locations: ['texas', 'us'],
        locationTags: {
          states: ['tx'],
          countries: ['us']
        },
        localityLevel: 'state',
        publishedAt: new Date(`2026-03-11T${String((index % 10) + 10).padStart(2, '0')}:00:00.000Z`)
      }));
      const trueLocalCandidate = {
        _id: 'local-san-marcos-query',
        title: 'San Marcos council agenda',
        description: 'Local San Marcos government update',
        source: 'Community Impact',
        sourceType: 'rss',
        sourceId: 'community-impact',
        topics: ['general'],
        category: 'general',
        locations: ['san marcos, tx, us'],
        assignedZipCode: '78666',
        locationTags: {
          zipCodes: ['78666'],
          cities: ['san marcos'],
          counties: ['hays county'],
          states: ['tx'],
          countries: ['us']
        },
        localityLevel: 'city',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      };

      NewsPreferences.findOne.mockResolvedValue({
        defaultScope: 'local',
        locations: [{ zipCode: '78666', city: 'San Marcos', county: 'Hays County', state: 'Texas', country: 'United States', isPrimary: true }],
        followedKeywords: [],
        followedSportsTeams: [],
        hiddenCategories: []
      });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: 'San Marcos', county: 'Hays County', state: 'Texas', country: 'United States', zipCode: '78666' }) });
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) return buildFindChain([]);
        if (query?.$and?.[1]?.$or) {
          const scopedClauses = query.$and[1].$or;
          const hasBroadLocalClause = scopedClauses.some((clause) =>
            Object.prototype.hasOwnProperty.call(clause, 'locationTags.states')
            || Object.prototype.hasOwnProperty.call(clause, 'locationTags.countries')
            || (Array.isArray(clause.locations?.$in)
              && clause.locations.$in.some((token) => ['texas', 'tx', 'united states', 'us'].includes(String(token).toLowerCase())))
          );
          return buildFindChain(hasBroadLocalClause ? broadScopedCandidates : [trueLocalCandidate]);
        }
        return buildFindChain([]);
      });

      const response = await request(app)
        .get('/api/news/feed?scope=local&page=1&limit=10')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.personalization.requestedScope).toBe('local');
      expect(response.body.personalization.activeScope).toBe('local');
      expect(response.body.personalization.fallbackApplied).toBe(false);
      expect(response.body.articles.map((article) => article._id)).toContain('local-san-marcos-query');
    });

    it('local scope returns only local-matching articles (no national contamination)', async () => {
      const app = buildApp();
      const feedArticles = [
        {
          _id: 'local-1',
          title: 'Austin City Council Update',
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
          _id: 'national-1',
          title: 'Federal Policy Update',
          description: 'National policy news',
          source: 'US Wire',
          sourceType: 'rss',
          sourceId: 'us-wire',
          topics: ['politics'],
          locations: ['USA'],
          localityLevel: 'country',
          publishedAt: new Date('2026-03-01T01:00:00.000Z')
        },
        {
          _id: 'global-1',
          title: 'International Summit',
          description: 'World leaders meet',
          source: 'World Wire',
          sourceType: 'rss',
          sourceId: 'world-wire',
          topics: ['politics'],
          locations: [],
          localityLevel: 'global',
          publishedAt: new Date('2026-03-01T02:00:00.000Z')
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
      expect(response.body.personalization.requestedScope).toBe('local');
      expect(response.body.personalization.activeScope).toBe('local');
      // Local scope should NOT include national/global articles when local matches exist
      expect(response.body.articles.length).toBeGreaterThanOrEqual(1);
      expect(response.body.articles[0]._id).toBe('local-1');
    });

    it('local scope does not keep state-level sports matches when true city-local articles exist', async () => {
      const app = buildApp();
      const feedArticles = [
        {
          _id: 'local-san-marcos-1',
          title: 'San Marcos approves downtown improvements',
          description: 'City council approved a new downtown plan.',
          source: 'Community Impact',
          sourceType: 'googleNews',
          sourceId: 'community-impact',
          topics: ['general'],
          category: 'general',
          locations: ['san marcos, tx, us'],
          assignedZipCode: '78666',
          locationTags: {
            zipCodes: ['78666'],
            cities: ['san marcos'],
            counties: ['hays county'],
            states: ['tx'],
            countries: ['us']
          },
          localityLevel: 'city',
          publishedAt: new Date('2025-03-01T00:00:00.000Z')
        },
        {
          _id: 'sports-texas-1',
          title: 'Texas needs a win in critical SEC Tournament matchup',
          description: 'The Longhorns are trying to secure an NCAA Tournament bid.',
          source: 'Yahoo News',
          sourceType: 'rss',
          sourceId: 'yahoo-sports',
          topics: ['sports'],
          category: 'sports',
          locations: ['texas', 'tx'],
          locationTags: {
            zipCodes: [],
            cities: [],
            counties: [],
            states: ['texas', 'tx'],
            countries: ['us']
          },
          localityLevel: 'state',
          publishedAt: new Date('2026-03-11T17:10:33.000Z')
        }
      ];

      NewsPreferences.findOne.mockResolvedValue({
        defaultScope: 'local',
        locations: [{ zipCode: '78666', city: 'San Marcos', state: 'Texas', country: 'United States', isPrimary: true }],
        followedKeywords: [],
        followedSportsTeams: ['ncaa-football:texas-longhorns'],
        hiddenCategories: []
      });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: null, zipCode: '78666' }) });
      Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

      const response = await request(app)
        .get('/api/news/feed?scope=local&page=1&limit=10')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.personalization.activeScope).toBe('local');
      expect(response.body.personalization.fallbackApplied).toBe(false);
      expect(response.body.articles.map((article) => article._id)).toEqual(['local-san-marcos-1']);
    });

    it('local scope does not treat zip-only state matches as city-local when richer city context exists', async () => {
      const app = buildApp();
      const feedArticles = [
        {
          _id: 'local-san-marcos-2',
          title: 'San Marcos downtown safety update',
          description: 'City crews are adjusting downtown traffic signals.',
          source: 'Community Impact',
          sourceType: 'googleNews',
          sourceId: 'community-impact',
          topics: ['general'],
          category: 'general',
          locations: ['san marcos, tx, us'],
          assignedZipCode: '78666',
          locationTags: {
            zipCodes: ['78666'],
            cities: ['san marcos'],
            counties: ['hays county'],
            states: ['tx'],
            countries: ['us']
          },
          localityLevel: 'city',
          publishedAt: new Date('2026-03-10T00:00:00.000Z')
        },
        {
          _id: 'zip-only-state-1',
          title: 'Central Texas refinery update',
          description: 'A broad Texas story incorrectly inherited the user zip.',
          source: 'Spectrum News',
          sourceType: 'googleNews',
          sourceId: 'spectrum-news',
          topics: ['general'],
          category: 'general',
          locations: ['brownsville', 'texas', 'tx', 'us'],
          assignedZipCode: '78666',
          locationTags: {
            zipCodes: ['78666'],
            cities: [],
            counties: [],
            states: ['texas', 'tx'],
            countries: ['us']
          },
          localityLevel: 'state',
          publishedAt: new Date('2026-03-11T00:00:00.000Z')
        }
      ];

      NewsPreferences.findOne.mockResolvedValue({
        defaultScope: 'local',
        locations: [{ zipCode: '78666', city: 'San Marcos', county: 'Hays County', state: 'Texas', country: 'United States', isPrimary: true }],
        followedKeywords: [],
        followedSportsTeams: [],
        hiddenCategories: []
      });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: 'San Marcos', county: 'Hays County', state: 'Texas', country: 'United States', zipCode: '78666' }) });
      Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

      const response = await request(app)
        .get('/api/news/feed?scope=local&page=1&limit=10')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.personalization.activeScope).toBe('local');
      expect(response.body.personalization.fallbackApplied).toBe(false);
      expect(response.body.articles.map((article) => article._id)).toEqual(['local-san-marcos-2']);
    });

    it('local scope with no matches falls back and exposes fallback metadata', async () => {
      const app = buildApp();
      // No local articles, only national
      const feedArticles = [
        {
          _id: 'national-1',
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
        locations: [{ city: 'Smallville', state: 'Kansas', country: 'USA', isPrimary: true }],
        followedKeywords: [],
        hiddenCategories: []
      });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: 'Smallville', county: null, state: 'Kansas', country: 'USA', zipCode: null }) });
      Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

      const response = await request(app)
        .get('/api/news/feed?scope=local')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.personalization.requestedScope).toBe('local');
      // Should fall back since no local matches
      expect(response.body.personalization.fallbackApplied).toBe(true);
      expect(response.body.personalization.fallbackReason).toBe('no_scope_matches');
      expect(response.body.personalization.resolvedScope).toBe(response.body.personalization.activeScope);
    });
  });

  describe('scope + category/topic composition', () => {
    it('local scope + topic filter returns only local articles matching topic', async () => {
      const app = buildApp();
      const feedArticles = [
        {
          _id: 'local-tech-1',
          title: 'Austin Tech Startup Raises Funds',
          description: 'Local AI company expands',
          source: 'Austin Tech',
          sourceType: 'rss',
          sourceId: 'austin-tech',
          topics: ['technology', 'ai'],
          category: 'technology',
          locations: ['Austin', 'Texas'],
          localityLevel: 'city',
          publishedAt: new Date('2026-03-01T00:00:00.000Z')
        },
        {
          _id: 'local-politics-1',
          title: 'Austin City Council Vote',
          description: 'Local politics',
          source: 'Austin Daily',
          sourceType: 'rss',
          sourceId: 'austin-daily',
          topics: ['politics'],
          category: 'politics',
          locations: ['Austin', 'Texas'],
          localityLevel: 'city',
          publishedAt: new Date('2026-03-01T01:00:00.000Z')
        },
        {
          _id: 'national-tech-1',
          title: 'National Tech Policy',
          description: 'Federal tech regulation',
          source: 'US Tech',
          sourceType: 'rss',
          sourceId: 'us-tech',
          topics: ['technology'],
          category: 'technology',
          locations: ['USA'],
          localityLevel: 'country',
          publishedAt: new Date('2026-03-01T02:00:00.000Z')
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
        .get('/api/news/feed?scope=local&topic=technology')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.personalization.activeScope).toBe('local');
      // Should only return local tech articles, not national tech
      expect(response.body.articles.some(a => a._id === 'local-tech-1')).toBe(true);
      expect(response.body.articles.some(a => a._id === 'national-tech-1')).toBe(false);
    });

    it('local scope + All Categories returns truly local-only articles', async () => {
      const app = buildApp();
      const feedArticles = [
        {
          _id: 'local-1',
          title: 'Austin Local News',
          description: 'Local news',
          source: 'Austin Daily',
          sourceType: 'rss',
          sourceId: 'austin-daily',
          topics: ['general'],
          category: 'general',
          locations: ['Austin'],
          localityLevel: 'city',
          publishedAt: new Date('2026-03-01T00:00:00.000Z')
        },
        {
          _id: 'global-1',
          title: 'World News',
          description: 'Global news',
          source: 'World Wire',
          sourceType: 'rss',
          sourceId: 'world-wire',
          topics: ['general'],
          category: 'general',
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
      // Local scope should prioritize local articles
      expect(response.body.articles[0]._id).toBe('local-1');
    });
  });

  describe('preference repair for stale zip-only defaults', () => {
    it('repairs a stale global default when a zip-only primary location can now be enriched', async () => {
      const app = buildApp();
      const stalePreferences = {
        _id: 'pref-1',
        user: 'user-1',
        defaultScope: 'global',
        locations: [{ zipCode: '78666', city: null, county: null, state: null, country: null, isPrimary: true }],
        followedKeywords: [],
        followedSportsTeams: [],
        hiddenCategories: []
      };
      const repairedPreferences = {
        ...stalePreferences,
        defaultScope: 'local',
        locations: [{ zipCode: '78666', city: 'San Marcos', county: 'Hays County', state: 'Texas', stateCode: 'TX', country: 'United States', countryCode: 'US', cityKey: 'TX:san-marcos', isPrimary: true }]
      };

      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: null, zipCode: '78666' }) });
      NewsPreferences.findOne.mockResolvedValue(stalePreferences);
      NewsPreferences.findOneAndUpdate.mockResolvedValue(repairedPreferences);

      const response = await request(app)
        .get('/api/news/preferences')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(NewsPreferences.findOneAndUpdate).toHaveBeenCalledWith(
        { user: 'user-1' },
        {
          $set: {
            defaultScope: 'local',
            locations: [expect.objectContaining({
              zipCode: '78666',
              city: 'San Marcos',
              county: 'Hays County',
              stateCode: 'TX',
              countryCode: 'US',
              isPrimary: true
            })]
          }
        },
        { new: true }
      );
      expect(response.body.preferences.defaultScope).toBe('local');
      expect(response.body.preferences.locations[0]).toEqual(expect.objectContaining({
        zipCode: '78666',
        city: 'San Marcos',
        county: 'Hays County',
        stateCode: 'TX',
        countryCode: 'US'
      }));
    });
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

  it('does not broaden sports local scope to national/global when no local or regional sports matches exist', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'sports-national-1',
        title: 'Patriots sign veteran receiver',
        description: '',
        source: 'National Sports Wire',
        sourceType: 'rss',
        sourceId: 'national-sports-wire',
        topics: ['sports'],
        locations: ['Boston, MA'],
        localityLevel: 'state',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'local',
      locations: [{ city: 'San Marcos', state: 'Texas', country: 'US', zipCode: '78666', isPrimary: true }],
      followedKeywords: [],
      hiddenCategories: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: 'San Marcos', county: 'Hays County', state: 'Texas', country: 'US', zipCode: '78666' }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=local&topic=sports')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.requestedScope).toBe('local');
    expect(response.body.personalization.activeScope).toBe('local');
    expect(response.body.personalization.fallbackApplied).toBe(false);
    expect(Array.isArray(response.body.articles)).toBe(true);
    expect(response.body.articles).toHaveLength(0);
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
    NewsPreferences.findOneAndUpdate.mockResolvedValue(seededPrefs);

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
            stateCode: 'TX',
            country: 'United States',
            countryCode: 'US',
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
    NewsPreferences.findOneAndUpdate.mockResolvedValue(seededPrefs);

    const response = await request(app)
      .get('/api/news/preferences')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(NewsPreferences.create).toHaveBeenCalledWith(
      expect.objectContaining({
        locations: [
          expect.objectContaining({
            zipCode: '10001',
            country: 'United States',
            countryCode: 'US'
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

  it('infers city/state from sports team mention when no explicit location exists', async () => {
    const result = await newsRoutes.internals.resolveArticleLocationContext({
      source: { name: 'ESPN', category: 'sports' },
      item: {
        title: 'Dallas Cowboys sign veteran linebacker',
        contentSnippet: 'The Cowboys added depth ahead of training camp.'
      }
    });

    expect(result.localityLevel).toBe('city');
    expect(result.locationTags.cities).toContain('dallas');
    expect(result.locationTags.states).toEqual(expect.arrayContaining(['tx', 'texas']));
  });

  it('returns canonical state/city taxonomy for location selectors', async () => {
    const app = buildApp();
    const response = await request(app)
      .get('/api/news/location-taxonomy')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.taxonomy.country.code).toBe('US');
    expect(response.body.taxonomy.states).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TX', name: 'Texas' })])
    );
    expect(response.body.taxonomy.citiesByState.TX).toEqual(expect.arrayContaining(['Austin', 'Dallas', 'Houston']));
  });

  it('ships exactly 250 U.S. city mapping entries and 20 Europe entries', async () => {
    expect(US_CITY_LOCATION_ENTRIES).toHaveLength(250);
    expect(EUROPE_CITY_LOCATION_ENTRIES).toHaveLength(20);
  });

  it('infers U.S. city/state location tags from mapped city mentions', async () => {
    const result = await newsRoutes.internals.resolveArticleLocationContext({
      source: { name: 'Local Wire', category: 'general' },
      item: {
        title: 'Downtown growth surges in Akron as housing demand rises',
        contentSnippet: 'Akron leaders approved new zoning plans this week.'
      }
    });

    expect(result.locationTags.cities).toContain('akron');
    expect(result.locationTags.states).toEqual(expect.arrayContaining(['oh', 'ohio']));
    expect(result.localityLevel).toBe('city');
  });

  it('infers European city/country tags from mapped city mentions', async () => {
    const result = await newsRoutes.internals.resolveArticleLocationContext({
      source: { name: 'World Desk', category: 'world' },
      item: {
        title: 'Transit workers strike again in Madrid amid wage talks',
        contentSnippet: 'Commuters across Madrid reported major delays.'
      }
    });

    expect(result.locationTags.cities).toContain('madrid');
    expect(result.locationTags.countries).toContain('spain');
  });

  it('removes disabled google and gdelt sources from the feed results', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'google-1',
        title: 'Google News result',
        description: '',
        source: 'Google News',
        sourceType: 'googleNews',
        sourceId: 'google-news',
        topics: ['technology'],
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-02T00:00:00.000Z')
      },
      {
        _id: 'gdelt-1',
        title: 'GDELT result',
        description: '',
        source: 'GDELT',
        sourceType: 'gdlet',
        sourceId: 'gdelt-tech',
        topics: ['technology'],
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        _id: 'rss-1',
        title: 'RSS result',
        description: '',
        source: 'Yahoo News',
        sourceType: 'rss',
        sourceId: 'yahoo-news',
        topics: ['technology'],
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-03T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'global',
      locations: [],
      followedKeywords: [],
      hiddenCategories: [],
      googleNewsEnabled: false,
      gdletEnabled: false
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: null, zipCode: null }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=global')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.articles).toHaveLength(1);
    expect(response.body.articles[0]._id).toBe('rss-1');
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

  it.each([
    {
      zipCode: '78666',
      city: 'San Marcos',
      state: 'Texas',
      localArticleId: 'local-78666',
      localTitle: 'San Marcos transit update near 78666',
      stateArticleId: 'state-78666',
      stateTitle: 'Texas infrastructure update'
    },
    {
      zipCode: '70726',
      city: 'Denham Springs',
      state: 'Louisiana',
      localArticleId: 'local-70726',
      localTitle: 'Denham Springs cleanup update in 70726',
      stateArticleId: 'state-70726',
      stateTitle: 'Louisiana emergency management update'
    }
  ])('keeps local and regional scope deterministic for zip $zipCode', async ({
    zipCode,
    city,
    state,
    localArticleId,
    localTitle,
    stateArticleId,
    stateTitle
  }) => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: localArticleId,
        title: localTitle,
        description: '',
        source: 'Local Wire',
        sourceType: 'rss',
        sourceId: `${zipCode}-local-wire`,
        locations: [zipCode, city, 'US'],
        assignedZipCode: zipCode,
        localityLevel: 'city',
        publishedAt: new Date('2026-03-02T00:00:00.000Z')
      },
      {
        _id: stateArticleId,
        title: stateTitle,
        description: '',
        source: 'State Wire',
        sourceType: 'rss',
        sourceId: `${zipCode}-state-wire`,
        locations: [state, 'US'],
        localityLevel: 'state',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        _id: `global-${zipCode}`,
        title: 'Global market update',
        description: '',
        source: 'Global Wire',
        sourceType: 'rss',
        sourceId: `${zipCode}-global-wire`,
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'local',
      locations: [{ country: 'US', zipCode, isPrimary: true }],
      followedKeywords: [],
      hiddenCategories: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: 'US', zipCode }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const localResponse = await request(app)
      .get('/api/news/feed?scope=local')
      .set('Authorization', 'Bearer token');

    expect(localResponse.status).toBe(200);
    expect(localResponse.body.personalization.requestedScope).toBe('local');
    expect(localResponse.body.personalization.activeScope).toBe('local');
    expect(localResponse.body.personalization.fallbackApplied).toBe(false);
    expect(localResponse.body.articles[0]._id).toBe(localArticleId);

    const regionalResponse = await request(app)
      .get('/api/news/feed?scope=regional')
      .set('Authorization', 'Bearer token');

    expect(regionalResponse.status).toBe(200);
    expect(regionalResponse.body.personalization.requestedScope).toBe('regional');
    expect(regionalResponse.body.personalization.activeScope).toBe('regional');
    expect(regionalResponse.body.personalization.fallbackApplied).toBe(false);
    expect(regionalResponse.body.articles[0]._id).toBe(stateArticleId);
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

  it('does NOT mix global articles into explicit local scope results (no contamination)', async () => {
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
    expect(response.body.personalization.requestedScope).toBe('local');
    // Explicit local scope should NOT include global articles when local matches exist
    expect(response.body.articles.length).toBe(1);
    expect(response.body.articles[0]._id).toBe('local-1');
  });

  it('mixes global articles into regional scope results (allowed for regional)', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'state-1',
        title: 'Texas state legislature update',
        description: 'State government news',
        source: 'Texas Tribune',
        sourceType: 'rss',
        sourceId: 'texas-tribune',
        topics: ['politics'],
        locations: ['Texas', 'USA'],
        localityLevel: 'state',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        _id: 'global-mix-2',
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
      defaultScope: 'regional',
      locations: [{ state: 'Texas', country: 'USA', isPrimary: true }],
      followedKeywords: [],
      hiddenCategories: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: 'Texas', country: 'USA', zipCode: null }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=regional')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.activeScope).toBe('regional');
    expect(response.body.personalization.requestedScope).toBe('regional');
    // Regional scope may include global articles mixed in
    expect(response.body.articles.length).toBeGreaterThanOrEqual(1);
    expect(response.body.articles[0]._id).toBe('state-1');
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

  it('returns deterministic no_scope_matches fallback reason when local and regional matches are absent', async () => {
    const app = buildApp();
    const feedArticles = [
      {
        _id: 'fallback-country-1',
        title: 'US federal policy update',
        description: '',
        source: 'National Wire',
        sourceType: 'rss',
        sourceId: 'national-wire',
        locations: ['United States', 'US'],
        localityLevel: 'country',
        publishedAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ];

    NewsPreferences.findOne.mockResolvedValue({
      defaultScope: 'local',
      locations: [{ country: 'US', zipCode: '70726', isPrimary: true }],
      followedKeywords: [],
      hiddenCategories: []
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ city: null, county: null, state: null, country: 'US', zipCode: '70726' }) });
    Article.find.mockImplementation((query) => buildFindChain(query.isPromoted ? [] : feedArticles));

    const response = await request(app)
      .get('/api/news/feed?scope=local')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.personalization.requestedScope).toBe('local');
    expect(response.body.personalization.activeScope).toBe('regional');
    expect(response.body.personalization.fallbackApplied).toBe(true);
    expect(response.body.personalization.fallbackReason).toBe('no_scope_matches');
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

  it('correlates ingested US zip codes to a city-level local assignment', async () => {
    const context = await newsRoutes.internals.resolveArticleLocationContext({
      source: { name: 'Local Wire' },
      item: { title: 'Public safety update for residents in 78666' }
    });

    expect(context.locationTags.zipCodes).toContain('78666');
    expect(context.locationTags.cities).toContain('san marcos');
    expect(context.localityLevel).toBe('city');
  });

  it('correlates ingested US city/state mentions to zip codes for local assignment', async () => {
    const context = await newsRoutes.internals.resolveArticleLocationContext({
      source: { name: 'Local Wire' },
      item: { title: 'Roadwork announced in San Marcos, TX this weekend' }
    });

    expect(context.locationTags.cities).toContain('san marcos');
    expect(context.locationTags.zipCodes).toContain('78666');
    expect(context.localityLevel).toBe('city');
  });

  it('correlates US capital city local stories when state abbreviation is omitted', async () => {
    mockGeocode.mockResolvedValue([{
      zipcode: '78701',
      city: 'Austin',
      state: 'Texas',
      stateCode: 'TX',
      country: 'United States',
      countryCode: 'US'
    }]);
    const context = await newsRoutes.internals.resolveArticleLocationContext({
      source: { name: 'Local Wire' },
      item: { title: 'Austin city council approves downtown transit upgrades' }
    });

    expect(context.locationTags.cities).toContain('austin');
    expect(context.locationTags.states).toEqual(expect.arrayContaining(['texas', 'tx']));
    expect(context.locationTags.zipCodes).toContain('78701');
    expect(context.localityLevel).toBe('city');
  });

  it('does not force city locality for non-local capital city mentions', async () => {
    const context = await newsRoutes.internals.resolveArticleLocationContext({
      source: { name: 'National Wire' },
      item: { title: 'Federal budget debate in Washington continues in Congress' }
    });

    expect(context.locationTags.cities).toEqual([]);
    expect(context.locationTags.zipCodes).toEqual([]);
    expect(context.localityLevel).not.toBe('city');
  });

  it('does not keep local city tags when city to zip correlation fails', async () => {
    const context = await newsRoutes.internals.resolveArticleLocationContext({
      source: { name: 'Unknown Local Wire' },
      item: { title: 'Community update in Atlantis' }
    });

    expect(context.locationTags.cities).toEqual([]);
    expect(context.locationTags.zipCodes).toEqual([]);
    expect(context.localityLevel).toBe('global');
  });

  it('downgrades city locality when no explicit city association can be specified', () => {
    const normalized = newsRoutes.internals.ensureCityAssociationSpecificity({
      localityLevel: 'city',
      assignedZipCode: null,
      locationTags: { cities: [], states: ['tx'], countries: ['us'] }
    });

    expect(normalized.localityLevel).toBe('state');
    expect(normalized.locationTags.cities).toEqual([]);
  });

  it('cleans up stale news data with duplicate ingestion records', async () => {
    const realReadyState = Object.getOwnPropertyDescriptor(require('mongoose').connection, 'readyState');
    try {
      Object.defineProperty(require('mongoose').connection, 'readyState', { configurable: true, value: 1 });
      Article.deleteMany.mockResolvedValue({ deletedCount: 3 });
      NewsIngestionRecord.deleteMany.mockResolvedValue({ deletedCount: 4 });

      const cleanup = await newsRoutes.internals.cleanupStaleNewsData();

      expect(cleanup.articlesDeleted).toBe(3);
      expect(cleanup.ingestionRecordsDeleted).toBe(4);
      expect(NewsIngestionRecord.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
        $or: expect.arrayContaining([
          { 'dedupe.outcome': 'duplicate' }
        ])
      }));
    } finally {
      if (realReadyState) {
        Object.defineProperty(require('mongoose').connection, 'readyState', realReadyState);
      }
    }
  });
});
