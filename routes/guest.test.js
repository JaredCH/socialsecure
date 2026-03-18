const request = require('supertest');
const express = require('express');

const mockPost = {
  find: jest.fn(),
  countDocuments: jest.fn()
};

const mockUser = {
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn()
};

const mockChatRoom = {
  ensureDefaultDiscoveryRooms: jest.fn(),
  findOrCreateByLocation: jest.fn(),
  findOne: jest.fn()
};

const mockLocationCacheService = {
  getArticlesForLocation: jest.fn()
};

const mockLocationNormalizer = {
  normalizeLocationInput: jest.fn()
};

const mockFetchWeatherForLocation = jest.fn();

jest.mock('../models/Post', () => mockPost);
jest.mock('../models/User', () => mockUser);
jest.mock('../models/ChatRoom', () => mockChatRoom);
jest.mock('../services/locationCacheService', () => mockLocationCacheService);
jest.mock('../services/locationNormalizer', () => mockLocationNormalizer);
jest.mock('./news', () => ({
  internals: { fetchWeatherForLocation: mockFetchWeatherForLocation }
}));

const guestRouter = require('./guest');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/guest', guestRouter);
  return app;
};

describe('Guest routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocationNormalizer.normalizeLocationInput.mockResolvedValue({
      city: 'austin',
      state: 'tx',
      country: 'us',
      locationKey: 'austin_tx_us'
    });
    mockLocationCacheService.getArticlesForLocation.mockResolvedValue({
      locationKey: 'austin_tx_us',
      cacheHit: true,
      articles: []
    });
    mockChatRoom.ensureDefaultDiscoveryRooms.mockResolvedValue();
    mockChatRoom.findOrCreateByLocation.mockResolvedValue({ room: null, created: false });
    mockChatRoom.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    mockUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([])
            })
          })
        })
      })
    });
    mockUser.countDocuments.mockResolvedValue(0);
  });

  it('attaches Austin guest defaults for unauthenticated requests', async () => {
    const app = buildApp();
    const response = await request(app).get('/api/guest/news/preferences');

    expect(response.status).toBe(200);
    expect(response.body.preferences.locations[0]).toMatchObject({
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      countryCode: 'US'
    });
  });

  it('enforces read-only methods on guest endpoints', async () => {
    const app = buildApp();
    const response = await request(app)
      .post('/api/guest/news/feed')
      .send({});

    expect(response.status).toBe(405);
    expect(response.body.error).toBe('Guest endpoints are read-only');
  });

  it('filters guest discovery posts to public audience at query level', async () => {
    const app = buildApp();
    const mockFindChain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis()
    };
    mockFindChain.populate
      .mockReturnValueOnce(mockFindChain)
      .mockReturnValueOnce(Promise.resolve([]));
    mockPost.find.mockReturnValue(mockFindChain);

    const response = await request(app).get('/api/guest/discovery/posts');

    expect(response.status).toBe(200);
    expect(mockPost.find).toHaveBeenCalledWith(expect.objectContaining({
      visibility: 'public',
      relationshipAudience: 'public'
    }));
  });

  it('filters guest social feed to public relationship audience at query level', async () => {
    const app = buildApp();
    mockUser.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'owner-1',
          username: 'buddy'
        })
      })
    });
    const mockFindChain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([])
    };
    mockPost.find.mockReturnValue(mockFindChain);
    mockPost.countDocuments.mockResolvedValue(0);

    const response = await request(app).get('/api/guest/social/buddy/feed');

    expect(response.status).toBe(200);
    expect(mockPost.find).toHaveBeenCalledWith(expect.objectContaining({
      targetFeedId: 'owner-1',
      visibility: 'public',
      relationshipAudience: 'public'
    }));
  });

  it('returns guest weather for Austin TX defaults', async () => {
    const app = buildApp();
    mockFetchWeatherForLocation.mockResolvedValue({
      weather: { provider: 'open-meteo', current: { temperature: 75 } },
      error: null,
      cacheHit: false,
      resolved: { lat: 30.2672, lon: -97.7431, city: 'Austin', state: 'TX' }
    });

    const response = await request(app).get('/api/guest/news/weather');

    expect(response.status).toBe(200);
    expect(response.body.locations).toHaveLength(1);
    expect(response.body.locations[0]).toMatchObject({
      lat: 30.2672,
      lon: -97.7431,
      weather: { provider: 'open-meteo', current: { temperature: 75 } }
    });
    expect(response.body.fallbackSource).toBe('guestDefault');
    expect(mockFetchWeatherForLocation).toHaveBeenCalledWith(expect.objectContaining({
      lat: 30.2672,
      lon: -97.7431,
      city: 'Austin',
      state: 'TX',
      zipCode: '78701'
    }));
  });
});
