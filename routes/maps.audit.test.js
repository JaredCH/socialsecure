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

  it('returns live friends and recently-hidden friends for up to 60 seconds', async () => {
    const app = buildApp();
    const now = Date.now();
    mockLocationPresence.getFriendsLocations.mockResolvedValue([
      {
        user: { _id: 'friend-1', username: 'liveFriend', realName: 'Live Friend', avatarUrl: null },
        location: { coordinates: [-73.9857, 40.7484] },
        shareWithFriends: true,
        lastActivityAt: new Date(now - 25 * 1000),
        isActive: true
      },
      {
        user: { _id: 'friend-2', username: 'recentlyHidden', realName: 'Recently Hidden', avatarUrl: null },
        location: { coordinates: [-73.98, 40.74] },
        shareWithFriends: false,
        lastActivityAt: new Date(now - 40 * 1000),
        isActive: true
      },
      {
        user: { _id: 'friend-3', username: 'staleFriend', realName: 'Stale Friend', avatarUrl: null },
        location: { coordinates: [-73.97, 40.73] },
        shareWithFriends: false,
        lastActivityAt: new Date(now - 2 * 60 * 1000),
        isActive: true
      }
    ]);

    const response = await request(app)
      .get('/api/maps/friends')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.friends).toHaveLength(2);
    expect(response.body.friends[0]).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ _id: 'friend-1', username: 'liveFriend' }),
        isLive: true
      })
    );
    expect(response.body.friends[0].liveAgeSeconds).toBeGreaterThanOrEqual(0);
    expect(response.body.friends[0].liveAgeSeconds).toBeLessThanOrEqual(60);
    expect(response.body.friends[1]).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ _id: 'friend-2', username: 'recentlyHidden' }),
        isLive: false
      })
    );
    expect(response.body.friends[1].liveAgeSeconds).toBeGreaterThanOrEqual(0);
    expect(response.body.friends[1].liveAgeSeconds).toBeLessThanOrEqual(60);
  });

  it('jitter heatmap coordinates and timestamps for privacy', async () => {
    const app = buildApp();
    const computedAt = new Date('2026-01-01T12:00:00.000Z');
    mockHeatmapAggregation.getTiles
      .mockResolvedValueOnce([
        {
          center: { lat: 40.7484, lng: -73.9857 },
          data: { userCount: 8, spotlightCount: 2 },
          computedAt
        }
      ]);

    const randomSpy = jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.25)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(1);

    try {
      const response = await request(app)
        .get('/api/maps/heatmap')
        .query({
          north: 41,
          south: 40,
          east: -73,
          west: -74
        });

      expect(response.status).toBe(200);
      expect(response.body.heatmap).toHaveLength(1);
      expect(response.body.heatmap[0]).toEqual(
        expect.objectContaining({
          intensity: 0.8,
          userCount: 8,
          spotlightCount: 2,
          jitteredAt: '2026-01-01T12:30:00.000Z'
        })
      );
      expect(response.body.heatmap[0].lat).not.toBe(40.7484);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
