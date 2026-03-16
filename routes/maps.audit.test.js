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

const mockFavoriteLocation = {
  find: jest.fn(),
  create: jest.fn(),
  findOneAndDelete: jest.fn()
};

const mockGeocoder = {
  geocode: jest.fn(),
  reverse: jest.fn()
};

const mockUser = {};

jest.mock('../models/LocationPresence', () => mockLocationPresence);
jest.mock('../models/Spotlight', () => mockSpotlight);
jest.mock('../models/HeatmapAggregation', () => mockHeatmapAggregation);
jest.mock('../models/FavoriteLocation', () => mockFavoriteLocation);
jest.mock('../models/User', () => mockUser);
jest.mock('node-geocoder', () => jest.fn(() => mockGeocoder));

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
    mockFavoriteLocation.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });
    mockFavoriteLocation.create.mockResolvedValue({
      _id: 'favorite-1',
      address: '123 Main St, Austin, TX',
      sourceType: 'address',
      location: { coordinates: [-97.7431, 30.2672] },
      city: 'Austin',
      state: 'Texas',
      country: 'United States',
      createdAt: new Date('2026-03-16T19:00:00.000Z'),
      updatedAt: new Date('2026-03-16T19:00:00.000Z')
    });
    mockFavoriteLocation.findOneAndDelete.mockResolvedValue({ _id: 'favorite-1' });
    mockGeocoder.geocode.mockResolvedValue([]);
    mockGeocoder.reverse.mockResolvedValue([]);
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

  it('returns all friends while marking online/offline state from recent activity', async () => {
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
        location: null,
        shareWithFriends: false,
        lastActivityAt: new Date(now - 2 * 60 * 1000),
        city: 'Austin',
        state: 'Texas',
        isActive: false
      }
    ]);

    const response = await request(app)
      .get('/api/maps/friends')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.friends).toHaveLength(3);
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
        isLive: true,
        lat: 40.74,
        lng: -73.98
      })
    );
    expect(response.body.friends[1].liveAgeSeconds).toBeGreaterThanOrEqual(0);
    expect(response.body.friends[1].liveAgeSeconds).toBeLessThanOrEqual(60);
    expect(response.body.friends[2]).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ _id: 'friend-3', username: 'staleFriend' }),
        isLive: false,
        lat: null,
        lng: null,
        city: 'Austin',
        state: 'Texas'
      })
    );
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

  it('saves typed favorite addresses using geocoded plain-text locations', async () => {
    const app = buildApp();
    mockGeocoder.geocode.mockResolvedValue([
      {
        formattedAddress: '123 Main St, Austin, TX, United States',
        latitude: 30.2672,
        longitude: -97.7431,
        city: 'Austin',
        state: 'Texas',
        country: 'United States'
      }
    ]);

    const response = await request(app)
      .post('/api/maps/favorites')
      .set('Authorization', 'Bearer token')
      .send({ address: '123 Main St, Austin, TX' });

    expect(response.status).toBe(201);
    expect(mockFavoriteLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-1',
        address: '123 Main St, Austin, TX, United States',
        sourceType: 'address',
        location: {
          type: 'Point',
          coordinates: [-97.7431, 30.2672]
        }
      })
    );
    expect(response.body.favorite).toEqual(
      expect.objectContaining({
        address: '123 Main St, Austin, TX',
        lat: 30.2672,
        lng: -97.7431
      })
    );
  });

  it('falls back to GPS coordinates when reverse geocoding a current favorite location fails', async () => {
    const app = buildApp();
    mockGeocoder.reverse.mockRejectedValue(new Error('reverse failed'));
    mockFavoriteLocation.create.mockResolvedValue({
      _id: 'favorite-2',
      address: '30.26720, -97.74310',
      sourceType: 'current_location',
      location: { coordinates: [-97.7431, 30.2672] },
      city: null,
      state: null,
      country: null,
      createdAt: new Date('2026-03-16T19:05:00.000Z'),
      updatedAt: new Date('2026-03-16T19:05:00.000Z')
    });

    const response = await request(app)
      .post('/api/maps/favorites')
      .set('Authorization', 'Bearer token')
      .send({ latitude: 30.2672, longitude: -97.7431 });

    expect(response.status).toBe(201);
    expect(mockFavoriteLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '30.26720, -97.74310',
        sourceType: 'current_location'
      })
    );
    expect(response.body.favorite).toEqual(
      expect.objectContaining({
        address: '30.26720, -97.74310',
        sourceType: 'current_location'
      })
    );
  });
});
