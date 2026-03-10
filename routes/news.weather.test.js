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
const newsRoutes = require('./news');
const { internals } = newsRoutes;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/news', newsRoutes.router);
  return app;
};

beforeEach(() => {
  jest.clearAllMocks();
  jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'user-1' }));
});

describe('Weather backend internals', () => {
  describe('classifySourceHealth', () => {
    it('returns unknown for source that has never been fetched', () => {
      const result = internals.classifySourceHealth({ lastFetchAt: null });
      expect(result.health).toBe('unknown');
      expect(result.healthReason).toContain('Never fetched');
    });

    it('returns green for recently successful fetch', () => {
      const result = internals.classifySourceHealth({
        lastFetchAt: new Date(),
        lastFetchStatus: 'success'
      });
      expect(result.health).toBe('green');
      expect(result.healthReason).toBe('Healthy');
    });

    it('returns yellow for stale successful fetch', () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const result = internals.classifySourceHealth({
        lastFetchAt: fiveHoursAgo,
        lastFetchStatus: 'success'
      });
      expect(result.health).toBe('yellow');
      expect(result.healthReason).toContain('Stale');
    });

    it('returns red for source with error status', () => {
      const result = internals.classifySourceHealth({
        lastFetchAt: new Date(),
        lastFetchStatus: 'error',
        lastError: 'Timeout'
      });
      expect(result.health).toBe('red');
      expect(result.healthReason).toBe('Timeout');
    });

    it('returns red with default message when error has no lastError', () => {
      const result = internals.classifySourceHealth({
        lastFetchAt: new Date(),
        lastFetchStatus: 'error',
        lastError: null
      });
      expect(result.health).toBe('red');
      expect(result.healthReason).toBe('Last fetch failed');
    });
  });

  describe('normalizeUSState', () => {
    it('normalizes state abbreviation', () => {
      expect(internals.normalizeUSState('TX')).toBe('TX');
      expect(internals.normalizeUSState('tx')).toBe('TX');
      expect(internals.normalizeUSState(' ca ')).toBe('CA');
    });

    it('normalizes full state name', () => {
      expect(internals.normalizeUSState('Texas')).toBe('TX');
      expect(internals.normalizeUSState('california')).toBe('CA');
      expect(internals.normalizeUSState('New York')).toBe('NY');
    });

    it('returns null for invalid state', () => {
      expect(internals.normalizeUSState('XX')).toBeNull();
      expect(internals.normalizeUSState('Narnia')).toBeNull();
      expect(internals.normalizeUSState('')).toBeNull();
      expect(internals.normalizeUSState(null)).toBeNull();
    });
  });

  describe('US_ZIP_REGEX', () => {
    it('matches valid US ZIP codes', () => {
      expect(internals.US_ZIP_REGEX.test('78701')).toBe(true);
      expect(internals.US_ZIP_REGEX.test('10001')).toBe(true);
      expect(internals.US_ZIP_REGEX.test('90210-1234')).toBe(true);
    });

    it('rejects invalid ZIP codes', () => {
      expect(internals.US_ZIP_REGEX.test('1234')).toBe(false);
      expect(internals.US_ZIP_REGEX.test('123456')).toBe(false);
      expect(internals.US_ZIP_REGEX.test('abcde')).toBe(false);
      expect(internals.US_ZIP_REGEX.test('')).toBe(false);
    });
  });
});

describe('Weather endpoint validation', () => {
  describe('POST /api/news/preferences/weather-locations', () => {
    it('rejects request without city or zipCode', async () => {
      const app = buildApp();
      NewsPreferences.findOne.mockResolvedValue({ weatherLocations: [], save: jest.fn() });

      const res = await request(app)
        .post('/api/news/preferences/weather-locations')
        .set('Authorization', 'Bearer valid-token')
        .send({ state: 'TX' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('City or ZIP code is required');
    });

    it('rejects invalid US ZIP code', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/news/preferences/weather-locations')
        .set('Authorization', 'Bearer valid-token')
        .send({ city: 'Austin', zipCode: '1234' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid US ZIP code');
    });

    it('rejects invalid US state', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/news/preferences/weather-locations')
        .set('Authorization', 'Bearer valid-token')
        .send({ city: 'Austin', state: 'Narnia' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid US state');
    });

    it('rejects when already at max 3 locations', async () => {
      const app = buildApp();
      const mockPrefs = {
        weatherLocations: [
          { _id: 'w1', city: 'Austin', isPrimary: false },
          { _id: 'w2', city: 'Dallas', isPrimary: false },
          { _id: 'w3', city: 'Houston', isPrimary: true }
        ],
        save: jest.fn()
      };
      NewsPreferences.findOne.mockResolvedValue(mockPrefs);

      const res = await request(app)
        .post('/api/news/preferences/weather-locations')
        .set('Authorization', 'Bearer valid-token')
        .send({ city: 'San Antonio', zipCode: '78201' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Maximum 3 weather locations');
    });

    it('adds weather location with valid data', async () => {
      const app = buildApp();
      const locations = [];
      const mockPrefs = {
        weatherLocations: locations,
        save: jest.fn().mockResolvedValue(true)
      };
      NewsPreferences.findOne.mockResolvedValue(mockPrefs);

      const res = await request(app)
        .post('/api/news/preferences/weather-locations')
        .set('Authorization', 'Bearer valid-token')
        .send({ city: 'Austin', state: 'Texas', zipCode: '78701', lat: 30.26, lon: -97.74 });

      expect(res.status).toBe(200);
      expect(mockPrefs.save).toHaveBeenCalled();
      expect(locations.length).toBe(1);
      expect(locations[0].state).toBe('TX');
      expect(locations[0].isPrimary).toBe(true);
    });
  });

  describe('PUT /api/news/preferences/weather-locations', () => {
    it('rejects more than 3 locations', async () => {
      const app = buildApp();

      const res = await request(app)
        .put('/api/news/preferences/weather-locations')
        .set('Authorization', 'Bearer valid-token')
        .send({
          locations: [
            { city: 'A' }, { city: 'B' }, { city: 'C' }, { city: 'D' }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Maximum 3');
    });

    it('replaces all weather locations with valid data', async () => {
      const app = buildApp();
      const updatedPrefs = { weatherLocations: [{ city: 'Austin', state: 'TX' }] };
      NewsPreferences.findOneAndUpdate.mockResolvedValue(updatedPrefs);

      const res = await request(app)
        .put('/api/news/preferences/weather-locations')
        .set('Authorization', 'Bearer valid-token')
        .send({ locations: [{ city: 'Austin', state: 'TX' }] });

      expect(res.status).toBe(200);
      expect(res.body.preferences).toBeDefined();
    });
  });

  describe('DELETE /api/news/preferences/weather-locations/:locationId', () => {
    it('removes a weather location', async () => {
      const app = buildApp();
      const mockPrefs = {
        weatherLocations: [],
        save: jest.fn().mockResolvedValue(true)
      };
      NewsPreferences.findOneAndUpdate.mockResolvedValue(mockPrefs);

      const res = await request(app)
        .delete('/api/news/preferences/weather-locations/w1')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
    });

    it('returns 404 when preferences not found', async () => {
      const app = buildApp();
      NewsPreferences.findOneAndUpdate.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/news/preferences/weather-locations/w1')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
    });
  });
});
