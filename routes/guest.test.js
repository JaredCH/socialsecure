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
  findOne: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  findById: jest.fn()
};

const mockChatMessage = {
  getRoomMessages: jest.fn(),
  countDocuments: jest.fn()
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
jest.mock('../models/ChatMessage', () => mockChatMessage);
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
    mockChatRoom.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([])
          })
        })
      })
    });
    mockChatRoom.countDocuments.mockResolvedValue(0);
    mockChatRoom.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    mockChatMessage.getRoomMessages.mockResolvedValue([]);
    mockChatMessage.countDocuments.mockResolvedValue(0);
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

  it('lists discovery rooms for guests with pagination metadata', async () => {
    const app = buildApp();
    const roomDoc = {
      _id: 'room-state-tx',
      name: 'Texas',
      type: 'state',
      discoveryGroup: 'states',
      sortOrder: 0,
      defaultLanding: false,
      members: ['u1'],
      messageCount: 4,
      lastActivity: new Date('2024-01-01T00:00:00.000Z')
    };
    mockChatRoom.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([roomDoc])
          })
        })
      })
    });
    mockChatRoom.countDocuments.mockResolvedValue(1);

    const response = await request(app).get('/api/guest/chat/rooms/all?page=1&limit=50');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rooms).toHaveLength(1);
    expect(response.body.rooms[0]).toEqual(expect.objectContaining({
      _id: 'room-state-tx',
      name: 'Texas',
      type: 'state',
      discoveryGroup: 'states',
      sortOrder: 0,
      memberCount: 1
    }));
    expect(response.body.hasMore).toBe(false);
  });

  it('returns guest-readable room messages for a selected room', async () => {
    const app = buildApp();
    mockChatRoom.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'room-topic-ai',
        name: 'AI',
        type: 'topic',
        discoverable: true,
        archivedAt: null,
        members: []
      })
    });
    mockChatMessage.getRoomMessages.mockResolvedValue([
      {
        _id: 'm-1',
        roomId: 'room-topic-ai',
        content: 'hello guests',
        userId: { _id: 'u-2', username: 'buddy' },
        createdAt: '2024-01-01T00:00:00.000Z'
      }
    ]);
    mockChatMessage.countDocuments.mockResolvedValue(1);

    const response = await request(app).get('/api/guest/chat/rooms/room-topic-ai/messages?page=1&limit=25');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        _id: 'm-1',
        content: 'hello guests'
      })
    ]));
    expect(response.body.pagination).toEqual(expect.objectContaining({
      page: 1,
      limit: 25,
      total: 1,
      hasMore: false
    }));
  });
});
