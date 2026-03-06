const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockLocationPresence = {
  updatePresence: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  getFriendsLocations: jest.fn()
};

const mockSpotlight = {
  createSpotlight: jest.fn(),
  addReaction: jest.fn(),
  getByLocation: jest.fn(),
  getFriendsSpotlights: jest.fn(),
  findOne: jest.fn(),
  cleanupExpired: jest.fn()
};

const mockHeatmapAggregation = {
  getTiles: jest.fn(),
  recomputeRegion: jest.fn()
};

const mockUser = {};

jest.mock('../models/LocationPresence', () => mockLocationPresence);
jest.mock('../models/Spotlight', () => mockSpotlight);
jest.mock('../models/HeatmapAggregation', () => mockHeatmapAggregation);
jest.mock('../models/User', () => mockUser);

const jwt = require('jsonwebtoken');
const mapsModule = require('./maps');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/maps', mapsModule.router);
  return app;
};

describe('Maps route audit fixes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'user-1' }));

    mockLocationPresence.updatePresence.mockResolvedValue({ _id: 'presence-1' });
    mockSpotlight.getByLocation.mockResolvedValue([]);
    mockHeatmapAggregation.getTiles.mockResolvedValue([]);
    mockHeatmapAggregation.recomputeRegion.mockResolvedValue();
  });

  it('accepts 0 latitude/longitude and forwards normalized coordinates to presence update', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/maps/presence')
      .set('Authorization', 'Bearer token')
      .send({
        latitude: 0,
        longitude: 0,
        precisionLevel: 4
      });

    expect(response.status).toBe(200);
    expect(mockLocationPresence.updatePresence).toHaveBeenCalledWith(
      'user-1',
      { latitude: 0, longitude: 0 },
      expect.objectContaining({ latitude: 0, longitude: 0, precisionLevel: 4 })
    );
  });

  it('rejects non-numeric coordinates for presence updates', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/maps/presence')
      .set('Authorization', 'Bearer token')
      .send({
        latitude: 'not-a-number',
        longitude: -73.9857
      });

    expect(response.status).toBe(400);
    expect(mockLocationPresence.updatePresence).not.toHaveBeenCalled();
  });

  it('restricts nearby spotlight visibility to public states only', async () => {
    const app = buildApp();

    const response = await request(app)
      .get('/api/maps/spotlight/nearby')
      .query({
        lat: 0,
        lng: 0,
        state: 'friends_only'
      });

    expect(response.status).toBe(200);
    expect(mockSpotlight.getByLocation).toHaveBeenCalledWith(
      0,
      0,
      5000,
      expect.objectContaining({ state: ['trending', 'public_glow'] })
    );
  });

  it('accepts zero-valued map bounds for heatmap retrieval', async () => {
    const app = buildApp();

    const response = await request(app)
      .get('/api/maps/heatmap')
      .query({
        north: 1,
        south: 0,
        east: 0,
        west: -1
      });

    expect(response.status).toBe(200);
    expect(mockHeatmapAggregation.getTiles).toHaveBeenCalledWith(
      { north: 1, south: 0, east: 0, west: -1 },
      5
    );
  });
});
