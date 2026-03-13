/**
 * Test file specifically for verifying ZIP 78666 (San Marcos, TX) weather resolution fix.
 * This tests the fix that added ZIP 78666 to the STATIC_ZIP_LOCATION_INDEX.
 * 
 * Expected coordinates: 29.8833, -97.9411
 * Expected city: San Marcos
 * Expected state: Texas / TX
 */

const request = require('supertest');
const express = require('express');

// Mock dependencies
jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../models/Article', () => ({ find: jest.fn(), countDocuments: jest.fn(), findDuplicate: jest.fn(), findByIdAndUpdate: jest.fn(), findById: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../models/RssSource', () => ({ find: jest.fn(), findOne: jest.fn(), create: jest.fn(), findByIdAndDelete: jest.fn(), findByIdAndUpdate: jest.fn(), updateMany: jest.fn() }));
jest.mock('../models/NewsPreferences', () => ({ findOne: jest.fn(), create: jest.fn(), findOneAndUpdate: jest.fn(), updateMany: jest.fn() }));
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/NewsIngestionRecord', () => ({ create: jest.fn(), deleteMany: jest.fn() }));
jest.mock('node-geocoder', () => jest.fn(() => ({ geocode: jest.fn().mockResolvedValue([]) })));

const jwt = require('jsonwebtoken');
const newsRoutes = require('./news');
const { internals } = newsRoutes;
const zipLocationIndex = require('../services/zipLocationIndex');

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

describe('ZIP 78666 (San Marcos, TX) Weather Resolution Fix', () => {
  describe('Static ZIP Location Index', () => {
    it('should have ZIP 78666 in the static index', () => {
      const { STATIC_ZIP_LOCATION_INDEX } = zipLocationIndex;
      expect(STATIC_ZIP_LOCATION_INDEX['78666']).toBeDefined();
      expect(STATIC_ZIP_LOCATION_INDEX['78666'].zipCode).toBe('78666');
    });

    it('should resolve ZIP 78666 to correct coordinates (29.8833, -97.9411)', () => {
      const { STATIC_ZIP_LOCATION_INDEX } = zipLocationIndex;
      expect(STATIC_ZIP_LOCATION_INDEX['78666'].latitude).toBe(29.8833);
      expect(STATIC_ZIP_LOCATION_INDEX['78666'].longitude).toBe(-97.9411);
    });

    it('should resolve ZIP 78666 to San Marcos, Texas', () => {
      const { STATIC_ZIP_LOCATION_INDEX } = zipLocationIndex;
      expect(STATIC_ZIP_LOCATION_INDEX['78666'].city).toBe('San Marcos');
      expect(STATIC_ZIP_LOCATION_INDEX['78666'].state).toBe('Texas');
      expect(STATIC_ZIP_LOCATION_INDEX['78666'].stateCode).toBe('TX');
    });

    it('should have correct county and country for ZIP 78666', () => {
      const { STATIC_ZIP_LOCATION_INDEX } = zipLocationIndex;
      expect(STATIC_ZIP_LOCATION_INDEX['78666'].county).toBe('Hays County');
      expect(STATIC_ZIP_LOCATION_INDEX['78666'].country).toBe('United States');
      expect(STATIC_ZIP_LOCATION_INDEX['78666'].countryCode).toBe('US');
    });
  });

  describe('findZipLocation function', () => {
    it('should return ZIP 78666 data without database lookup', async () => {
      const location = await zipLocationIndex.findZipLocation('78666');
      expect(location).not.toBeNull();
      expect(location.zipCode).toBe('78666');
      expect(location.latitude).toBe(29.8833);
      expect(location.longitude).toBe(-97.9411);
    });

    it('should handle ZIP code with whitespace', async () => {
      const location = await zipLocationIndex.findZipLocation(' 78666 ');
      expect(location).not.toBeNull();
      expect(location.zipCode).toBe('78666');
    });
  });

  describe('resolveZipLocation function', () => {
    it('should resolve ZIP 78666 without geocoding fallback', async () => {
      const location = await zipLocationIndex.resolveZipLocation('78666', { allowGeocode: false, persist: false });
      expect(location).not.toBeNull();
      expect(location.zipCode).toBe('78666');
      expect(location.latitude).toBe(29.8833);
      expect(location.longitude).toBe(-97.9411);
      expect(location.source).toBe('static-seed');
    });
  });

  describe('ZIP 70726 (Denham Springs, LA) - Second static entry', () => {
    it('should also resolve ZIP 70726 correctly', async () => {
      const { STATIC_ZIP_LOCATION_INDEX } = zipLocationIndex;
      expect(STATIC_ZIP_LOCATION_INDEX['70726']).toBeDefined();
      expect(STATIC_ZIP_LOCATION_INDEX['70726'].zipCode).toBe('70726');
      expect(STATIC_ZIP_LOCATION_INDEX['70726'].city).toBe('Denham Springs');
      expect(STATIC_ZIP_LOCATION_INDEX['70726'].state).toBe('Louisiana');
      expect(STATIC_ZIP_LOCATION_INDEX['70726'].stateCode).toBe('LA');
      expect(STATIC_ZIP_LOCATION_INDEX['70726'].latitude).toBe(30.4735);
      expect(STATIC_ZIP_LOCATION_INDEX['70726'].longitude).toBe(-90.9568);
    });
  });
});

describe('Fallback to Open-Meteo geocoding for non-static ZIPs', () => {
  it('should return null coordinates for ZIP codes not in static index when geocode returns empty', async () => {
    // ZIP 90210 is not in the static index, and mocked geocoder returns empty
    const location = await zipLocationIndex.resolveZipLocation('90210', { allowGeocode: true, persist: false });
    // With mocked geocoder returning empty, coordinates should be null
    // The function returns a partial result with zipCode but null coordinates
    expect(location).not.toBeNull();
    expect(location.zipCode).toBe('90210');
    expect(location.latitude).toBeNull();
    expect(location.longitude).toBeNull();
    expect(location.source).toBe('geocode-fallback');
  });

  it('should return null for invalid ZIP codes', async () => {
    const location = await zipLocationIndex.findZipLocation('invalid');
    expect(location).toBeNull();
  });

  it('should return null for empty ZIP codes', async () => {
    const location = await zipLocationIndex.findZipLocation('');
    expect(location).toBeNull();
  });
});

describe('Weather endpoint integration for ZIP 78666', () => {
  it('should accept ZIP 78666 as a valid location hint', async () => {
    const app = buildApp();
    const mockPrefs = {
      weatherLocations: [],
      save: jest.fn().mockResolvedValue(true)
    };
    const NewsPreferences = require('../models/NewsPreferences');
    NewsPreferences.findOne.mockResolvedValue(mockPrefs);

    const res = await request(app)
      .post('/api/news/preferences/weather-locations')
      .set('Authorization', 'Bearer valid-token')
      .send({ zipCode: '78666' });

    // Should not return 400 (validation error)
    expect(res.status).not.toBe(400);
    // The request should be accepted (200) since ZIP 78666 is valid
    expect(res.status).toBe(200);
  });
});

describe('fetchWeatherForLocation with ZIP 78666', () => {
  it('should NOT return "Unable to resolve weather data" error for ZIP 78666', async () => {
    // This test verifies that when fetchWeatherForLocation is called with ZIP 78666,
    // it should resolve coordinates successfully and not return the error
    const { fetchWeatherForLocation } = internals;
    
    // Mock the weather API response by clearing the cache
    const { weatherCache } = internals;
    weatherCache.clear?.() || (weatherCache.keys && weatherCache.keys().forEach(key => weatherCache.delete(key)));
    
    // Call fetchWeatherForLocation with ZIP 78666
    const result = await fetchWeatherForLocation({ zipCode: '78666' });
    
    // The result should NOT have the "Unable to resolve" error
    // If coordinates are resolved, we might get a weather API error (network) but NOT the resolution error
    if (result.error) {
      expect(result.error).not.toBe('Unable to resolve weather data for this location');
    }
    
    // If successful, resolved should have coordinates
    if (result.resolved) {
      expect(result.resolved.lat).toBe(29.8833);
      expect(result.resolved.lon).toBe(-97.9411);
    }
  });
});