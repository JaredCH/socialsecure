const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

// Mock models — variable names MUST start with "mock" per Jest factory scope rules
const mockUser = {
  find: jest.fn(),
  findById: jest.fn()
};
const mockPost = {
  find: jest.fn()
};
const mockFriendship = {
  find: jest.fn()
};
const mockBlockList = {
  find: jest.fn()
};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/Post', () => mockPost);
jest.mock('../models/Friendship', () => mockFriendship);
jest.mock('../models/BlockList', () => mockBlockList);

const jwt = require('jsonwebtoken');
const discoveryRouter = require('./discovery');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/discovery', discoveryRouter);
  return app;
};

// Time constants for readability
const DAY_MS = 24 * 60 * 60 * 1000;

// Default successful JWT auth
const mockAuth = () => {
  jwt.verify.mockImplementation((token, secret, cb) =>
    cb(null, { userId: 'viewer-1' })
  );
};

// Build a chainable Mongoose-like query stub that resolves to `data`
const chainable = (data) => {
  const q = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(data)
  };
  return q;
};

// Default: no friends, no blocked users
const mockNoSocialGraph = () => {
  // Friendship.find uses chained .select().lean()
  mockFriendship.find.mockReturnValue(chainable([]));
  // BlockList.find uses chained .select().lean()
  mockBlockList.find.mockReturnValue(chainable([]));
};

describe('Discovery routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
    mockNoSocialGraph();
    mockUser.findById.mockReturnValue(chainable({ city: 'TestCity', state: 'TS', country: 'US' }));
    // Default: no posts
    mockPost.find.mockReturnValue(chainable([]));
    // Default: no users
    mockUser.find.mockReturnValue(chainable([]));
  });

  // ─── Authentication ───────────────────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    jwt.verify.mockImplementation((token, secret, cb) =>
      cb(new Error('no token'), null)
    );
    const app = buildApp();
    const res = await request(app).get('/api/discovery/users');
    expect(res.status).toBe(401);
  });

  it('returns 403 when token is invalid', async () => {
    jwt.verify.mockImplementation((token, secret, cb) =>
      cb(new Error('invalid'), null)
    );
    const app = buildApp();
    const res = await request(app)
      .get('/api/discovery/users')
      .set('Authorization', 'Bearer bad');
    expect(res.status).toBe(403);
  });

  // ─── GET /api/discovery/users ─────────────────────────────────────────────

  describe('GET /api/discovery/users', () => {
    it('returns suggested users with required fields', async () => {
      const app = buildApp();

      mockUser.find.mockReturnValue(
        chainable([
          {
            _id: 'user-2',
            username: 'alice',
            realName: 'Alice',
            bio: 'Hello',
            avatarUrl: '',
            city: 'TestCity',
            state: 'TS',
            country: 'US',
            createdAt: new Date()
          }
        ])
      );

      const res = await request(app)
        .get('/api/discovery/users')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users[0]).toHaveProperty('whySuggested');
      expect(res.body.users[0]).toHaveProperty('rankScore');
      expect(res.body.pagination).toMatchObject({ page: 1 });
    });

    it('excludes the viewer from results', async () => {
      const app = buildApp();

      // The route excludes viewerId ('viewer-1') via the excludeIds set passed to $nin
      mockUser.find.mockImplementation((query) => {
        // Confirm $nin contains viewer-1
        const nin = query?._id?.$nin;
        if (nin) {
          expect(nin.map(String)).toContain('viewer-1');
        }
        return chainable([]);
      });

      await request(app)
        .get('/api/discovery/users')
        .set('Authorization', 'Bearer token');
    });

    it('boosts users with mutual friends via rankScore', async () => {
      const app = buildApp();

      // Viewer has friend 'friend-1'
      mockFriendship.find.mockImplementation((query) => {
        // First call: get viewer's friends
        if (query.$or && query.$or[0]?.requester === 'viewer-1') {
          return chainable([{ requester: 'viewer-1', recipient: 'friend-1' }]);
        }
        // Second call: fan-out to friend's friends → user-3 shares friend-1
        return chainable([{ requester: 'friend-1', recipient: 'user-3' }]);
      });

      // mutualCandidateIds will contain 'user-3'
      mockUser.find.mockImplementation((query) => {
        if (query._id && query._id.$in) {
          // Mutual candidate fetch
          return chainable([{
            _id: 'user-3',
            username: 'bob',
            realName: 'Bob',
            bio: '',
            avatarUrl: '',
            city: 'OtherCity',
            state: 'OT',
            country: 'US',
            createdAt: new Date(Date.now() - 60 * DAY_MS)
          }]);
        }
        // Other candidate fetch
        return chainable([]);
      });

      const res = await request(app)
        .get('/api/discovery/users')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      const bob = res.body.users.find((u) => u.username === 'bob');
      expect(bob).toBeDefined();
      // Should have mutual-friend signal in whySuggested
      expect(bob.whySuggested).toMatch(/mutual friend/i);
      // rankScore should reflect mutual-friend bonus (≥ 2)
      expect(bob.rankScore).toBeGreaterThanOrEqual(2);
    });

    it('boosts users in the same city via location signal', async () => {
      const app = buildApp();

      mockUser.find.mockReturnValue(
        chainable([
          {
            _id: 'user-4',
            username: 'charlie',
            realName: 'Charlie',
            bio: '',
            avatarUrl: '',
            city: 'TestCity', // same as viewer
            state: 'TS',
            country: 'US',
            createdAt: new Date(Date.now() - 60 * DAY_MS)
          },
          {
            _id: 'user-5',
            username: 'dave',
            realName: 'Dave',
            bio: '',
            avatarUrl: '',
            city: 'OtherCity', // different city
            state: 'OT',
            country: 'CA',
            createdAt: new Date(Date.now() - 60 * DAY_MS)
          }
        ])
      );

      const res = await request(app)
        .get('/api/discovery/users')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      const charlie = res.body.users.find((u) => u.username === 'charlie');
      const dave = res.body.users.find((u) => u.username === 'dave');
      expect(charlie).toBeDefined();
      expect(dave).toBeDefined();
      // Charlie (same city) must rank higher than Dave
      expect(charlie.rankScore).toBeGreaterThan(dave.rankScore);
      expect(charlie.whySuggested).toMatch(/same city/i);
    });

    it('boosts new accounts via recency signal', async () => {
      const app = buildApp();

      mockUser.find.mockReturnValue(
        chainable([
          {
            _id: 'user-new',
            username: 'newuser',
            realName: 'New User',
            bio: '',
            avatarUrl: '',
            city: 'OtherCity',
            state: 'OT',
            country: 'CA',
            createdAt: new Date() // just created
          },
          {
            _id: 'user-old',
            username: 'olduser',
            realName: 'Old User',
            bio: '',
            avatarUrl: '',
            city: 'OtherCity',
            state: 'OT',
            country: 'CA',
            createdAt: new Date(Date.now() - 365 * DAY_MS)
          }
        ])
      );

      const res = await request(app)
        .get('/api/discovery/users')
        .set('Authorization', 'Bearer token');

      const newUser = res.body.users.find((u) => u.username === 'newuser');
      const oldUser = res.body.users.find((u) => u.username === 'olduser');
      expect(newUser.rankScore).toBeGreaterThan(oldUser.rankScore);
      expect(newUser.whySuggested).toMatch(/new member/i);
    });

    it('respects pagination parameters', async () => {
      const app = buildApp();
      const users = Array.from({ length: 5 }, (_, i) => ({
        _id: `user-${i}`,
        username: `user${i}`,
        realName: `User ${i}`,
        bio: '',
        avatarUrl: '',
        city: 'C',
        state: 'S',
        country: 'US',
        createdAt: new Date()
      }));

      mockUser.find.mockReturnValue(chainable(users));

      const res = await request(app)
        .get('/api/discovery/users?page=1&limit=2')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(2);
      expect(res.body.pagination.hasMore).toBe(true);
      expect(res.body.pagination.total).toBe(5);
    });

    it('returns empty list with hasMore false when no candidates exist', async () => {
      const app = buildApp();
      mockUser.find.mockReturnValue(chainable([]));

      const res = await request(app)
        .get('/api/discovery/users')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(0);
      expect(res.body.pagination.hasMore).toBe(false);
    });
  });

  // ─── GET /api/discovery/posts ─────────────────────────────────────────────

  describe('GET /api/discovery/posts', () => {
    const makePost = (overrides = {}) => ({
      _id: 'post-1',
      authorId: { _id: 'author-1', username: 'alice', realName: 'Alice', avatarUrl: '', city: 'C', state: 'S', country: 'US' },
      content: 'Hello world',
      mediaUrls: [],
      likes: [],
      comments: [],
      createdAt: new Date(),
      location: { type: 'Point', coordinates: [0, 0] },
      locationRadius: null,
      ...overrides
    });

    it('returns suggested posts with required fields', async () => {
      const app = buildApp();
      mockPost.find.mockReturnValue(chainable([makePost()]));

      const res = await request(app)
        .get('/api/discovery/posts')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.posts)).toBe(true);
      expect(res.body.posts[0]).toHaveProperty('whySuggested');
      expect(res.body.posts[0]).toHaveProperty('rankScore');
      expect(res.body.posts[0]).toHaveProperty('author');
      expect(res.body.pagination).toMatchObject({ page: 1 });
    });

    it('ranks highly engaged posts above low-engagement posts', async () => {
      const app = buildApp();
      const popular = makePost({
        _id: 'post-popular',
        likes: ['u1', 'u2', 'u3', 'u4', 'u5'],
        comments: [{ content: 'x' }, { content: 'y' }, { content: 'z' }],
        // older but popular
        createdAt: new Date(Date.now() - DAY_MS / 2)
      });
      const fresh = makePost({
        _id: 'post-fresh',
        likes: [],
        comments: [],
        createdAt: new Date()
      });

      mockPost.find.mockReturnValue(chainable([fresh, popular]));

      const res = await request(app)
        .get('/api/discovery/posts')
        .set('Authorization', 'Bearer token');

      const popularResult = res.body.posts.find((p) => String(p._id) === 'post-popular');
      const freshResult = res.body.posts.find((p) => String(p._id) === 'post-fresh');
      expect(popularResult).toBeDefined();
      expect(freshResult).toBeDefined();
      // popular post has 5 likes + 6 (3 comments × 2) = 11 engagement pts
      // fresh post has 10 recency pts but 0 engagement
      expect(popularResult.rankScore).toBeGreaterThan(freshResult.rankScore);
      expect(popularResult.whySuggested).toMatch(/popular post/i);
    });

    it('boosts posts from friends via friend signal', async () => {
      const app = buildApp();

      // viewer-1 is friends with 'friend-author'
      mockFriendship.find.mockReturnValue(chainable([
        { requester: 'viewer-1', recipient: 'friend-author' }
      ]));

      const friendPost = makePost({
        _id: 'friend-post',
        authorId: { _id: 'friend-author', username: 'friend', realName: 'Friend', avatarUrl: '' },
        createdAt: new Date(Date.now() - DAY_MS) // 1 day ago
      });
      const strangerPost = makePost({
        _id: 'stranger-post',
        authorId: { _id: 'stranger', username: 'stranger', realName: 'Stranger', avatarUrl: '' },
        createdAt: new Date(Date.now() - DAY_MS) // same age
      });

      mockPost.find.mockReturnValue(chainable([friendPost, strangerPost]));

      const res = await request(app)
        .get('/api/discovery/posts')
        .set('Authorization', 'Bearer token');

      const fp = res.body.posts.find((p) => String(p._id) === 'friend-post');
      const sp = res.body.posts.find((p) => String(p._id) === 'stranger-post');
      expect(fp).toBeDefined();
      expect(sp).toBeDefined();
      expect(fp.rankScore).toBeGreaterThan(sp.rankScore);
      expect(fp.whySuggested).toMatch(/from a friend/i);
    });

    it('boosts nearby posts when coordinates are provided', async () => {
      const app = buildApp();

      const nearbyPost = makePost({
        _id: 'nearby-post',
        // New York City ~ [-74.006, 40.7128]
        location: { type: 'Point', coordinates: [-74.006, 40.7128] },
        createdAt: new Date(Date.now() - 2 * DAY_MS)
      });
      const farPost = makePost({
        _id: 'far-post',
        // Los Angeles ~ [-118.2437, 34.0522]
        location: { type: 'Point', coordinates: [-118.2437, 34.0522] },
        createdAt: new Date(Date.now() - 2 * DAY_MS)
      });

      mockPost.find.mockReturnValue(chainable([farPost, nearbyPost]));

      // Request from near New York City
      const res = await request(app)
        .get('/api/discovery/posts?latitude=40.7&longitude=-74.0')
        .set('Authorization', 'Bearer token');

      const np = res.body.posts.find((p) => String(p._id) === 'nearby-post');
      const fp = res.body.posts.find((p) => String(p._id) === 'far-post');
      expect(np).toBeDefined();
      expect(fp).toBeDefined();
      expect(np.rankScore).toBeGreaterThan(fp.rankScore);
      expect(np.whySuggested).toMatch(/nearby/i);
    });

    it('respects pagination parameters', async () => {
      const app = buildApp();
      const posts = Array.from({ length: 6 }, (_, i) =>
        makePost({ _id: `post-${i}`, createdAt: new Date(Date.now() - i * 1000) })
      );
      mockPost.find.mockReturnValue(chainable(posts));

      const res = await request(app)
        .get('/api/discovery/posts?page=1&limit=3')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.posts).toHaveLength(3);
      expect(res.body.pagination.hasMore).toBe(true);
      expect(res.body.pagination.total).toBe(6);
    });

    it('returns empty list with hasMore false when no posts exist', async () => {
      const app = buildApp();
      mockPost.find.mockReturnValue(chainable([]));

      const res = await request(app)
        .get('/api/discovery/posts')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.posts).toHaveLength(0);
      expect(res.body.pagination.hasMore).toBe(false);
    });
  });

  // ─── Analytics impression endpoints ──────────────────────────────────────

  describe('POST /api/discovery/users/impression', () => {
    it('acknowledges impression event', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/discovery/users/impression')
        .set('Authorization', 'Bearer token')
        .send({ userId: 'user-2' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/discovery/posts/impression', () => {
    it('acknowledges impression event', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/discovery/posts/impression')
        .set('Authorization', 'Bearer token')
        .send({ postId: 'post-1' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
