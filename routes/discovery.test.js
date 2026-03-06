const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockUser = {
  findById: jest.fn(),
  find: jest.fn()
};

const mockFriendship = {
  find: jest.fn()
};

const mockBlockList = {
  find: jest.fn()
};

const mockPost = {
  find: jest.fn()
};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/Friendship', () => mockFriendship);
jest.mock('../models/BlockList', () => mockBlockList);
jest.mock('../models/Post', () => mockPost);

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const BlockList = require('../models/BlockList');
const Post = require('../models/Post');
const discoveryRouter = require('./discovery');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/discovery', discoveryRouter);
  return app;
};

const mockAuthUser = () => {
  jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'viewer-1' }));
  mockUser.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: 'viewer-1',
      onboardingStatus: 'completed',
      city: 'Austin',
      state: 'TX',
      country: 'US'
    })
  });
};

const mockFriendAndBlockLookups = () => {
  mockFriendship.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { requester: 'viewer-1', recipient: 'friend-1' }
      ])
    })
  });

  mockBlockList.find
    .mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    })
    .mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });
};

describe('Discovery routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ranked and paginated user discovery results', async () => {
    const app = buildApp();
    mockAuthUser();
    mockFriendAndBlockLookups();

    mockUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                _id: 'u-1',
                username: 'alice',
                realName: 'Alice Doe',
                city: 'Austin',
                state: 'TX',
                country: 'US',
                friendCount: 20,
                createdAt: new Date('2026-03-01T00:00:00.000Z')
              },
              {
                _id: 'u-2',
                username: 'zoe',
                realName: 'Zoe Smith',
                city: 'Boston',
                state: 'MA',
                country: 'US',
                friendCount: 2,
                createdAt: new Date('2025-12-01T00:00:00.000Z')
              }
            ])
          })
        })
      })
    });

    const response = await request(app)
      .get('/api/discovery/users?q=ali&page=1&limit=1')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.total).toBe(2);
    expect(response.body.users[0]).toMatchObject({
      _id: 'u-1',
      username: 'alice'
    });
    expect(response.body.users[0].ranking.signals).toHaveProperty('textMatch');
    expect(response.body.users[0].ranking.signals).toHaveProperty('locationSignal');
    expect(response.body.users[0].ranking.signals).toHaveProperty('socialSignal');
  });

  it('caches repeated user discovery query responses briefly', async () => {
    const app = buildApp();
    mockAuthUser();
    mockFriendAndBlockLookups();

    mockUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                _id: 'u-1',
                username: 'alice',
                realName: 'Alice Doe',
                city: 'Austin',
                state: 'TX',
                country: 'US',
                friendCount: 3,
                createdAt: new Date('2026-03-02T00:00:00.000Z')
              }
            ])
          })
        })
      })
    });

    const first = await request(app)
      .get('/api/discovery/users?q=ali&page=1&limit=10')
      .set('Authorization', 'Bearer token');

    expect(first.status).toBe(200);
    expect(first.body.cached).toBe(false);

    const second = await request(app)
      .get('/api/discovery/users?q=ali&page=1&limit=10')
      .set('Authorization', 'Bearer token');

    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(mockUser.find).toHaveBeenCalledTimes(1);
  });

  it('accepts click analytics events and rejects invalid event types', async () => {
    const app = buildApp();
    mockAuthUser();

    const accepted = await request(app)
      .post('/api/discovery/events')
      .set('Authorization', 'Bearer token')
      .send({ eventType: 'profile_click', metadata: { targetUserId: 'u-1' } });

    expect(accepted.status).toBe(202);
    expect(accepted.body.success).toBe(true);

    const socialAccepted = await request(app)
      .post('/api/discovery/events')
      .set('Authorization', 'Bearer token')
      .send({ eventType: 'social_profile_section_clicked', metadata: { sectionId: 'timeline' } });

    expect(socialAccepted.status).toBe(202);
    expect(socialAccepted.body.success).toBe(true);

    const rejected = await request(app)
      .post('/api/discovery/events')
      .set('Authorization', 'Bearer token')
      .send({ eventType: 'invalid_type' });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toMatch(/invalid discovery eventtype/i);
  });

  it('returns ranked and paginated post discovery results', async () => {
    const app = buildApp();
    mockAuthUser();
    mockFriendAndBlockLookups();

    const mockPost = (id, content, likesCount, friendAuthor) => ({
      _id: id,
      content,
      visibility: 'public',
      authorId: {
        _id: friendAuthor ? 'friend-1' : `author-${id}`,
        username: friendAuthor ? 'frienduser' : `user${id}`,
        realName: friendAuthor ? 'Friend User' : `User ${id}`,
        city: 'Austin',
        state: 'TX',
        country: 'US'
      },
      targetFeedId: { _id: `feed-${id}`, username: `feed${id}`, realName: `Feed ${id}` },
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      likes: Array.from({ length: likesCount }, (_, i) => `like-${i}`),
      comments: [],
      locationRadius: null,
      location: { coordinates: [0, 0] },
      expiresAt: null,
      excludeUsers: [],
      canView: jest.fn().mockReturnValue(true)
    });

    Post.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue([
              mockPost('p-1', 'Popular post with many likes', 20, false),
              mockPost('p-2', 'Friend post content', 1, true)
            ])
          })
        })
      })
    });

    const response = await request(app)
      .get('/api/discovery/posts?page=1&limit=10')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.posts)).toBe(true);
    expect(response.body.posts.length).toBeGreaterThan(0);
    expect(response.body.hasMore).toBe(false);
    expect(response.body.rankingSignals).toEqual(
      expect.arrayContaining(['engagement', 'freshness', 'socialSignal', 'textMatch'])
    );
    expect(response.body.posts[0].ranking.signals).toHaveProperty('engagement');
    expect(response.body.posts[0].ranking.signals).toHaveProperty('freshness');
    expect(response.body.posts[0].ranking.signals).toHaveProperty('socialSignal');
  });
});
