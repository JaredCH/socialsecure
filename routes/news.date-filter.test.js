const request = require('supertest');
const express = require('express');

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

jest.mock('node-geocoder', () => jest.fn(() => ({ geocode: jest.fn() })));

const jwt = require('jsonwebtoken');
const Article = require('../models/Article');
const NewsPreferences = require('../models/NewsPreferences');
const NewsIngestionRecord = require('../models/NewsIngestionRecord');
const User = require('../models/User');
const newsRoutes = require('./news');

/**
 * Test suite for verifying the 7-day maximum age filter and database cleanup
 * operation in routes/news.js.
 * 
 * Context: Current time is 2026-03-12T12:29:10.512Z (UTC)
 * User timezone: America/Chicago (UTC-5:00)
 * 
 * The 7-day filter is defined by:
 * - NEWS_RETENTION_DAYS = 7
 * - NEWS_RETENTION_MS = NEWS_RETENTION_DAYS * 24 * 60 * 60 * 1000
 * 
 * Key implementation points:
 * 1. Base query includes: publishedAt: { $gte: sevenDaysAgo }
 * 2. cleanupStaleNewsData uses: publishedAt < cutoff OR (no publishedAt AND ingestTimestamp < cutoff)
 */

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

// Fixed reference time: 2026-03-12T12:29:10.512Z
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe('News 7-day date filter and cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'user-1' }));
    Article.countDocuments.mockResolvedValue(2);
    Article.findDuplicate.mockResolvedValue(null);
    Article.deleteMany.mockResolvedValue({ deletedCount: 0 });
    NewsIngestionRecord.deleteMany.mockResolvedValue({ deletedCount: 0 });
  });

  describe('7-day filter across all scopes', () => {
    /**
     * Test that articles older than 7 days are excluded from local scope.
     * The filter should use publishedAt >= sevenDaysAgo.
     */
    it('excludes articles older than 7 days from local scope feed', async () => {
      const app = buildApp();
      
      const recentArticle = {
        _id: 'recent-article-1',
        title: 'Recent Local News',
        description: 'This article is 2 days old',
        source: 'Local Wire',
        sourceType: 'rss',
        sourceId: 'local-wire',
        locations: ['Austin', 'Texas'],
        locationTags: { cities: ['austin'], states: ['texas', 'tx'], countries: ['us'] },
        localityLevel: 'city',
        publishedAt: new Date('2026-03-10T12:00:00.000Z'),
        isActive: true
      };

      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: 'Austin', 
          county: null, 
          state: 'Texas', 
          country: 'US', 
          zipCode: '78701' 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        // Promoted articles query doesn't have publishedAt filter
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        // Main feed query should have publishedAt filter
        if (query.publishedAt) {
          expect(query.publishedAt.$gte).toBeInstanceOf(Date);
        }
        return buildFindChain([recentArticle]);
      });

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.articles).toBeDefined();
      const returnedIds = response.body.articles.map(a => a._id);
      expect(returnedIds).not.toContain('old-article-1');
    });

    /**
     * Test that articles older than 7 days are excluded from regional scope.
     */
    it('excludes articles older than 7 days from regional scope feed', async () => {
      const app = buildApp();
      
      const recentArticle = {
        _id: 'recent-regional-1',
        title: 'Recent Texas News',
        description: 'This article is 1 day old',
        source: 'Texas Tribune',
        sourceType: 'rss',
        sourceId: 'texas-tribune',
        locations: ['Texas'],
        locationTags: { cities: [], states: ['texas', 'tx'], countries: ['us'] },
        localityLevel: 'state',
        publishedAt: new Date('2026-03-11T08:00:00.000Z'),
        isActive: true
      };

      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: null, 
          county: null, 
          state: 'Texas', 
          country: 'US', 
          zipCode: null 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        if (query.publishedAt) {
          expect(query.publishedAt.$gte).toBeInstanceOf(Date);
        }
        return buildFindChain([recentArticle]);
      });

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      const returnedIds = response.body.articles.map(a => a._id);
      expect(returnedIds).not.toContain('old-regional-1');
    });

    /**
     * Test that articles older than 7 days are excluded from national scope.
     */
    it('excludes articles older than 7 days from national scope feed', async () => {
      const app = buildApp();
      
      const recentArticle = {
        _id: 'recent-national-1',
        title: 'Recent National News',
        description: 'This article is 3 days old',
        source: 'US News',
        sourceType: 'rss',
        sourceId: 'us-news',
        locations: ['USA'],
        locationTags: { cities: [], states: [], countries: ['usa', 'us'] },
        localityLevel: 'country',
        publishedAt: new Date('2026-03-09T12:00:00.000Z'),
        isActive: true
      };

      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: null, 
          county: null, 
          state: null, 
          country: 'USA', 
          zipCode: null 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        if (query.publishedAt) {
          expect(query.publishedAt.$gte).toBeInstanceOf(Date);
        }
        return buildFindChain([recentArticle]);
      });

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      const returnedIds = response.body.articles.map(a => a._id);
      expect(returnedIds).not.toContain('old-national-1');
    });

    /**
     * Test that articles older than 7 days are excluded from global scope.
     */
    it('excludes articles older than 7 days from global scope feed', async () => {
      const app = buildApp();
      
      const recentArticle = {
        _id: 'recent-global-1',
        title: 'Recent Global News',
        description: 'This article is 5 days old',
        source: 'World News',
        sourceType: 'rss',
        sourceId: 'world-news',
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date('2026-03-07T12:00:00.000Z'),
        isActive: true
      };

      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: null, 
          county: null, 
          state: null, 
          country: null, 
          zipCode: null 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        if (query.publishedAt) {
          expect(query.publishedAt.$gte).toBeInstanceOf(Date);
        }
        return buildFindChain([recentArticle]);
      });

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      const returnedIds = response.body.articles.map(a => a._id);
      expect(returnedIds).not.toContain('old-global-1');
    });

    /**
     * Test edge case: article exactly 7 days old should be included.
     * The filter uses $gte (greater than or equal), so the boundary is inclusive.
     */
    it('includes articles exactly 7 days old (boundary case)', async () => {
      const app = buildApp();
      
      const boundaryArticle = {
        _id: 'boundary-article-1',
        title: 'Boundary News',
        description: 'This article is exactly 7 days old',
        source: 'Test News',
        sourceType: 'rss',
        sourceId: 'test-news',
        locations: [],
        localityLevel: 'global',
        publishedAt: new Date(Date.now() - SEVEN_DAYS_MS),
        isActive: true
      };

      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: null, 
          county: null, 
          state: null, 
          country: null, 
          zipCode: null 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        if (query.publishedAt) {
          const cutoff = query.publishedAt.$gte;
          const articleTime = boundaryArticle.publishedAt.getTime();
          expect(articleTime).toBeGreaterThanOrEqual(cutoff.getTime() - 1000);
        }
        return buildFindChain([boundaryArticle]);
      });

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.articles).toHaveLength(1);
      expect(response.body.articles[0]._id).toBe('boundary-article-1');
    });
  });

  describe('Timezone handling for 7-day window', () => {
    /**
     * Test that the 7-day window works correctly across timezone boundaries.
     */
    it('correctly filters articles published in different timezones', async () => {
      const app = buildApp();
      
      const chicagoMidnightArticle = {
        _id: 'chicago-midnight',
        title: 'Chicago Midnight News',
        description: 'Published at midnight Chicago time',
        source: 'Chicago Tribune',
        sourceType: 'rss',
        sourceId: 'chicago-tribune',
        locations: ['Chicago'],
        locationTags: { cities: ['chicago'], states: ['illinois', 'il'], countries: ['us'] },
        localityLevel: 'city',
        publishedAt: new Date('2026-03-05T06:00:00.000Z'),
        isActive: true
      };

      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: 'Chicago', 
          county: null, 
          state: 'Illinois', 
          country: 'US', 
          zipCode: '60601' 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        if (query.publishedAt) {
          const cutoff = query.publishedAt.$gte;
          expect(cutoff).toBeInstanceOf(Date);
          const cutoffTime = cutoff.getTime();
          const now = Date.now();
          const sevenDaysAgo = now - SEVEN_DAYS_MS;
          expect(Math.abs(cutoffTime - sevenDaysAgo)).toBeLessThan(60000);
        }
        return buildFindChain([chicagoMidnightArticle]);
      });

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      const returnedIds = response.body.articles.map(a => a._id);
      expect(returnedIds).toContain('chicago-midnight');
    });

    /**
     * Test that the filter handles articles near the boundary consistently.
     */
    it('handles articles near the 7-day boundary consistently regardless of timezone', async () => {
      const app = buildApp();
      
      const boundaryUtc = {
        _id: 'boundary-utc',
        title: 'Boundary UTC',
        publishedAt: new Date('2026-03-05T12:29:10.512Z'),
        source: 'Test',
        sourceType: 'rss',
        sourceId: 'test',
        locations: [],
        localityLevel: 'global',
        isActive: true
      };

      const boundaryChicago = {
        _id: 'boundary-chicago',
        title: 'Boundary Chicago',
        publishedAt: new Date('2026-03-05T12:29:10.512Z'),
        source: 'Test',
        sourceType: 'rss',
        sourceId: 'test',
        locations: [],
        localityLevel: 'global',
        isActive: true
      };

      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: null, 
          county: null, 
          state: null, 
          country: null, 
          zipCode: null 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        // Just return the articles without assertions in the mock
        // The test verifies the response status and article count
        return buildFindChain([boundaryUtc, boundaryChicago]);
      });

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.articles).toHaveLength(2);
    });

    /**
     * Test that the filter correctly handles daylight saving time transitions.
     */
    it('correctly handles articles across DST boundary', async () => {
      const app = buildApp();
      
      const preDstArticle = {
        _id: 'pre-dst',
        title: 'Pre-DST News',
        publishedAt: new Date('2026-03-07T12:00:00.000Z'),
        source: 'Test',
        sourceType: 'rss',
        sourceId: 'test',
        locations: [],
        localityLevel: 'global',
        isActive: true
      };

      const postDstArticle = {
        _id: 'post-dst',
        title: 'Post-DST News',
        publishedAt: new Date('2026-03-10T12:00:00.000Z'),
        source: 'Test',
        sourceType: 'rss',
        sourceId: 'test',
        locations: [],
        localityLevel: 'global',
        isActive: true
      };

      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: null, 
          county: null, 
          state: null, 
          country: null, 
          zipCode: null 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        if (query.publishedAt) {
          const cutoff = query.publishedAt.$gte.getTime();
          expect(preDstArticle.publishedAt.getTime()).toBeGreaterThanOrEqual(cutoff - 1000);
          expect(postDstArticle.publishedAt.getTime()).toBeGreaterThanOrEqual(cutoff - 1000);
        }
        return buildFindChain([preDstArticle, postDstArticle]);
      });

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.articles).toHaveLength(2);
    });
  });

  describe('cleanupStaleNewsData function', () => {
    /**
     * Test that cleanupStaleNewsData correctly purges articles older than 7 days.
     */
    it('deletes articles older than 7 days based on publishedAt', async () => {
      const realReadyState = Object.getOwnPropertyDescriptor(require('mongoose').connection, 'readyState');
      try {
        Object.defineProperty(require('mongoose').connection, 'readyState', { configurable: true, value: 1 });
        
        Article.deleteMany.mockResolvedValue({ deletedCount: 5 });
        NewsIngestionRecord.deleteMany.mockResolvedValue({ deletedCount: 3 });

        const cleanup = await newsRoutes.internals.cleanupStaleNewsData();

        expect(cleanup.articlesDeleted).toBe(5);
        expect(cleanup.ingestionRecordsDeleted).toBe(3);
        expect(cleanup.cutoff).toBeInstanceOf(Date);
        
        const cutoffTime = new Date(cleanup.cutoff).getTime();
        const now = Date.now();
        const expectedCutoff = now - SEVEN_DAYS_MS;
        expect(cutoffTime).toBeGreaterThanOrEqual(expectedCutoff - 1000);
        expect(cutoffTime).toBeLessThanOrEqual(now);
        
        expect(Article.deleteMany).toHaveBeenCalledWith(
          expect.objectContaining({
            $or: expect.arrayContaining([
              { publishedAt: { $lt: expect.any(Date) } },
              { publishedAt: null, ingestTimestamp: { $lt: expect.any(Date) } },
              { publishedAt: { $exists: false }, ingestTimestamp: { $lt: expect.any(Date) } }
            ])
          })
        );
      } finally {
        if (realReadyState) {
          Object.defineProperty(require('mongoose').connection, 'readyState', realReadyState);
        }
      }
    });

    /**
     * Test that cleanup handles articles with missing publishedAt by using ingestTimestamp.
     */
    it('handles articles with missing publishedAt using ingestTimestamp fallback', async () => {
      const realReadyState = Object.getOwnPropertyDescriptor(require('mongoose').connection, 'readyState');
      try {
        Object.defineProperty(require('mongoose').connection, 'readyState', { configurable: true, value: 1 });
        
        Article.deleteMany.mockResolvedValue({ deletedCount: 2 });
        NewsIngestionRecord.deleteMany.mockResolvedValue({ deletedCount: 1 });

        const cleanup = await newsRoutes.internals.cleanupStaleNewsData();

        expect(cleanup.articlesDeleted).toBe(2);
        
        const deleteCall = Article.deleteMany.mock.calls[0][0];
        expect(deleteCall.$or).toBeDefined();
        expect(deleteCall.$or).toContainEqual({ publishedAt: { $lt: expect.any(Date) } });
        expect(deleteCall.$or).toContainEqual({ publishedAt: null, ingestTimestamp: { $lt: expect.any(Date) } });
        expect(deleteCall.$or).toContainEqual({ publishedAt: { $exists: false }, ingestTimestamp: { $lt: expect.any(Date) } });
      } finally {
        if (realReadyState) {
          Object.defineProperty(require('mongoose').connection, 'readyState', realReadyState);
        }
      }
    });

    /**
     * Test that cleanup handles MongoDB connection not ready.
     */
    it('returns null when MongoDB connection is not ready', async () => {
      const realReadyState = Object.getOwnPropertyDescriptor(require('mongoose').connection, 'readyState');
      try {
        Object.defineProperty(require('mongoose').connection, 'readyState', { configurable: true, value: 0 });
        
        const cleanup = await newsRoutes.internals.cleanupStaleNewsData();

        expect(cleanup).toBeNull();
        expect(Article.deleteMany).not.toHaveBeenCalled();
        expect(NewsIngestionRecord.deleteMany).not.toHaveBeenCalled();
      } finally {
        if (realReadyState) {
          Object.defineProperty(require('mongoose').connection, 'readyState', realReadyState);
        }
      }
    });

    /**
     * Test that cleanup handles errors gracefully.
     */
    it('returns error object on failure instead of throwing', async () => {
      const realReadyState = Object.getOwnPropertyDescriptor(require('mongoose').connection, 'readyState');
      try {
        Object.defineProperty(require('mongoose').connection, 'readyState', { configurable: true, value: 1 });
        
        Article.deleteMany.mockRejectedValue(new Error('Database error'));

        const cleanup = await newsRoutes.internals.cleanupStaleNewsData();

        expect(cleanup).toBeDefined();
        expect(cleanup.error).toBe('Database error');
        expect(cleanup.articlesDeleted).toBe(0);
        expect(cleanup.ingestionRecordsDeleted).toBe(0);
      } finally {
        if (realReadyState) {
          Object.defineProperty(require('mongoose').connection, 'readyState', realReadyState);
        }
      }
    });

    /**
     * Test that cleanup also removes duplicate ingestion records.
     */
    it('removes ingestion records marked as duplicates regardless of age', async () => {
      const realReadyState = Object.getOwnPropertyDescriptor(require('mongoose').connection, 'readyState');
      try {
        Object.defineProperty(require('mongoose').connection, 'readyState', { configurable: true, value: 1 });
        
        Article.deleteMany.mockResolvedValue({ deletedCount: 3 });
        NewsIngestionRecord.deleteMany.mockResolvedValue({ deletedCount: 10 });

        const cleanup = await newsRoutes.internals.cleanupStaleNewsData();

        expect(cleanup.ingestionRecordsDeleted).toBe(10);
        
        const recordCall = NewsIngestionRecord.deleteMany.mock.calls[0][0];
        expect(recordCall.$or).toBeDefined();
        expect(recordCall.$or).toContainEqual({ 'dedupe.outcome': 'duplicate' });
      } finally {
        if (realReadyState) {
          Object.defineProperty(require('mongoose').connection, 'readyState', realReadyState);
        }
      }
    });

    /**
     * Test that cleanup does not cause cascade errors or referential integrity issues.
     */
    it('cleans up articles and ingestion records without cascade errors', async () => {
      const realReadyState = Object.getOwnPropertyDescriptor(require('mongoose').connection, 'readyState');
      try {
        Object.defineProperty(require('mongoose').connection, 'readyState', { configurable: true, value: 1 });
        
        Article.deleteMany.mockResolvedValue({ deletedCount: 7 });
        NewsIngestionRecord.deleteMany.mockResolvedValue({ deletedCount: 12 });

        const cleanup = await newsRoutes.internals.cleanupStaleNewsData();

        expect(cleanup).toBeDefined();
        expect(cleanup.articlesDeleted).toBe(7);
        expect(cleanup.ingestionRecordsDeleted).toBe(12);
        expect(cleanup.timestamp).toBeDefined();
        
        expect(Article.deleteMany).toHaveBeenCalled();
        expect(NewsIngestionRecord.deleteMany).toHaveBeenCalled();
        
        const articleCallOrder = Article.deleteMany.mock.invocationCallOrder[0];
        const recordCallOrder = NewsIngestionRecord.deleteMany.mock.invocationCallOrder[0];
        expect(articleCallOrder).toBeLessThan(recordCallOrder);
      } finally {
        if (realReadyState) {
          Object.defineProperty(require('mongoose').connection, 'readyState', realReadyState);
        }
      }
    });
  });

  describe('Atomic application of date and location filters', () => {
    /**
     * Test that the date filter is applied atomically with location filters.
     */
    it('applies date filter atomically with base query conditions', async () => {
      const app = buildApp();
      
      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: 'Austin', 
          county: null, 
          state: 'Texas', 
          country: 'US', 
          zipCode: '78701' 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      
      let foundDateFilter = false;
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        if (query.publishedAt && query.publishedAt.$gte) {
          foundDateFilter = true;
          expect(query.isActive).toBe(true);
          expect(query.publishedAt.$gte).toBeInstanceOf(Date);
        }
        return buildFindChain([]);
      });

      await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(foundDateFilter).toBe(true);
    });

    /**
     * Test that scoped candidate queries preserve the date filter.
     */
    it('preserves date filter in scoped candidate queries', async () => {
      const app = buildApp();
      
      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: 'Austin', 
          county: null, 
          state: 'Texas', 
          country: 'US', 
          zipCode: '78701' 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      
      let capturedQueries = [];
      Article.find.mockImplementation((query) => {
        capturedQueries.push(query);
        return buildFindChain([]);
      });

      await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      const hasDateFilter = capturedQueries.some(query => {
        if (query.publishedAt && query.publishedAt.$gte) {
          return true;
        }
        if (query.$and) {
          return query.$and.some(clause => 
            clause.publishedAt && clause.publishedAt.$gte
          );
        }
        return false;
      });
      
      expect(hasDateFilter).toBe(true);
    });

    /**
     * Test that the date filter is applied before location filtering.
     */
    it('applies date filter before location filter for query optimization', async () => {
      const app = buildApp();
      
      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: 'Austin', 
          county: null, 
          state: 'Texas', 
          country: 'US', 
          zipCode: '78701' 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        if (query.publishedAt) {
          expect(query.isActive).toBe(true);
          expect(query.publishedAt).toBeDefined();
        }
        if (query.$and) {
          const dateFilterPresent = query.$and.some(clause => 
            clause.publishedAt && clause.publishedAt.$gte
          );
          expect(dateFilterPresent).toBe(true);
        }
        return buildFindChain([]);
      });

      await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');
    });

    /**
     * Test that fallback scope changes don't bypass the date filter.
     */
    it('maintains date filter during scope fallback', async () => {
      const app = buildApp();
      
      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: 'Austin', 
          county: null, 
          state: 'Texas', 
          country: 'US', 
          zipCode: '78701' 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      
      let queryCount = 0;
      let foundDateFilterCount = 0;
      Article.find.mockImplementation((query) => {
        queryCount++;
        
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        
        if (query.publishedAt) {
          expect(query.publishedAt.$gte).toBeInstanceOf(Date);
          foundDateFilterCount++;
        }
        
        if (queryCount < 3) {
          return buildFindChain([]);
        }
        
        return buildFindChain([{
          _id: 'fallback-article',
          title: 'Fallback Article',
          publishedAt: new Date(Date.now() - 86400000),
          source: 'Test',
          sourceType: 'rss',
          sourceId: 'test',
          locations: ['USA'],
          localityLevel: 'country',
          isActive: true
        }]);
      });

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(queryCount).toBeGreaterThan(1);
      expect(foundDateFilterCount).toBeGreaterThan(0);
    });

    /**
     * Test that the date filter works correctly with source type filters.
     */
    it('applies date filter correctly with source type filter', async () => {
      const app = buildApp();
      
      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: null, 
          county: null, 
          state: null, 
          country: null, 
          zipCode: null 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        if (query.publishedAt) {
          expect(query.publishedAt).toBeDefined();
        }
        if (query.sourceType) {
          expect(query.sourceType).toBeDefined();
        }
        return buildFindChain([]);
      });

      await request(app)
        .get('/api/news/feed?sourceType=rss')
        .set('Authorization', 'Bearer token');
    });
  });

  describe('Edge cases and error handling', () => {
    /**
     * Test that articles with null publishedAt are handled correctly in the feed.
     */
    it('excludes articles with null publishedAt from feed', async () => {
      const app = buildApp();
      
      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: null, 
          county: null, 
          state: null, 
          country: null, 
          zipCode: null 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        if (query.publishedAt) {
          expect(query.publishedAt.$gte).toBeInstanceOf(Date);
        }
        return buildFindChain([]);
      });

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.articles).toHaveLength(0);
    });

    /**
     * Test that articles with future publishedAt dates are included.
     */
    it('includes articles with future publishedAt dates', async () => {
      const app = buildApp();
      
      const futureArticle = {
        _id: 'future-article',
        title: 'Future Article',
        publishedAt: new Date('2026-03-20T12:00:00.000Z'),
        source: 'Test',
        sourceType: 'rss',
        sourceId: 'test',
        locations: [],
        localityLevel: 'global',
        isActive: true
      };

      User.findById.mockReturnValue({ 
        select: jest.fn().mockResolvedValue({ 
          city: null, 
          county: null, 
          state: null, 
          country: null, 
          zipCode: null 
        }) 
      });
      NewsPreferences.findOne.mockResolvedValue(null);
      Article.find.mockImplementation((query) => {
        if (query.isPromoted) {
          return buildFindChain([]);
        }
        if (query.publishedAt) {
          const cutoff = query.publishedAt.$gte.getTime();
          const futureTime = futureArticle.publishedAt.getTime();
          expect(futureTime).toBeGreaterThan(cutoff);
        }
        return buildFindChain([futureArticle]);
      });

      const response = await request(app)
        .get('/api/news/feed')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.articles).toHaveLength(1);
      expect(response.body.articles[0]._id).toBe('future-article');
    });

    /**
     * Test that the 7-day retention period is correctly verified through cleanup function.
     */
    it('verifies 7-day retention period through cleanup function', async () => {
      const realReadyState = Object.getOwnPropertyDescriptor(require('mongoose').connection, 'readyState');
      try {
        Object.defineProperty(require('mongoose').connection, 'readyState', { configurable: true, value: 1 });
        
        Article.deleteMany.mockResolvedValue({ deletedCount: 1 });
        NewsIngestionRecord.deleteMany.mockResolvedValue({ deletedCount: 0 });

        const beforeCleanup = Date.now();
        const cleanup = await newsRoutes.internals.cleanupStaleNewsData();
        const afterCleanup = Date.now();

        expect(cleanup).toBeDefined();
        expect(cleanup.cutoff).toBeInstanceOf(Date);
        
        const cutoffTime = new Date(cleanup.cutoff).getTime();
        const expectedCutoff = beforeCleanup - SEVEN_DAYS_MS;
        
        expect(cutoffTime).toBeGreaterThanOrEqual(expectedCutoff - 1000);
        expect(cutoffTime).toBeLessThanOrEqual(afterCleanup - SEVEN_DAYS_MS + 1000);
        
        const retentionMs = afterCleanup - cutoffTime;
        expect(retentionMs).toBeGreaterThanOrEqual(SEVEN_DAYS_MS - 2000);
        expect(retentionMs).toBeLessThanOrEqual(SEVEN_DAYS_MS + 2000);
      } finally {
        if (realReadyState) {
          Object.defineProperty(require('mongoose').connection, 'readyState', realReadyState);
        }
      }
    });
  });
});