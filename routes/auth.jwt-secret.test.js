const request = require('supertest');
const express = require('express');

// Do NOT mock jsonwebtoken – we need the real sign/verify to test secret consistency.

const AUTHOR_ID = '507f1f77bcf86cd799439011';

const mockSession = {
  _id: 'session-1',
  lastActivity: null,
  save: jest.fn().mockResolvedValue(true)
};

const mockUserDoc = {
  _id: AUTHOR_ID,
  username: 'admin',
  realName: 'Admin',
  email: 'admin@test.com',
  registrationStatus: 'active',
  onboardingStatus: 'completed',
  onboardingStep: 4,
  circles: [],
  enableMaturityWordCensor: true,
  comparePassword: jest.fn().mockResolvedValue(true),
  toPublicProfile: jest.fn(() => ({
    _id: AUTHOR_ID,
    username: 'admin',
    realName: 'Admin'
  }))
};

jest.mock('../models/User', () => {
  const mockFindById = jest.fn().mockImplementation(() => ({
    select: jest.fn().mockResolvedValue(mockUserDoc)
  }));
  return {
    findById: mockFindById,
    findOne: jest.fn().mockResolvedValue(mockUserDoc),
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    }),
    generateUniversalId: jest.fn(() => 'universal-id')
  };
});
jest.mock('../models/Session', () => ({
  findOne: jest.fn().mockResolvedValue(mockSession),
  findOneAndUpdate: jest.fn().mockResolvedValue(mockSession),
  updateMany: jest.fn().mockResolvedValue({})
}));
jest.mock('../models/SecurityEvent', () => ({
  create: jest.fn().mockResolvedValue({})
}));
jest.mock('../models/DeviceKey', () => ({
  countDocuments: jest.fn().mockResolvedValue(0)
}));

const mockPostModel = jest.fn();
mockPostModel.findById = jest.fn();
mockPostModel.find = jest.fn();
jest.mock('../models/Post', () => mockPostModel);
jest.mock('../models/Friendship', () => ({
  find: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    })
  }),
  findOne: jest.fn().mockResolvedValue(null)
}));
jest.mock('../models/BlockList', () => ({
  find: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    })
  }),
  findOne: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    })
  })
}));
jest.mock('../models/MuteList', () => ({
  find: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    })
  })
}));
jest.mock('../models/SiteContentFilter', () => ({
  findOne: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue({ zeroToleranceWords: [], maturityCensoredWords: [] })
  })
}));
jest.mock('../services/notifications', () => ({
  createNotification: jest.fn().mockResolvedValue(null)
}));
jest.mock('../services/realtime', () => ({
  emitFeedInteraction: jest.fn(),
  emitFeedPost: jest.fn()
}));

const authRouter = require('./auth');
const feedRouter = require('./feed');
const Post = require('../models/Post');

describe('JWT secret consistency between auth and feed routes', () => {
  let app;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.JWT_SECRET;

    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/feed', feedRouter);
  });

  afterEach(() => {
    if (originalJwtSecret !== undefined) {
      process.env.JWT_SECRET = originalJwtSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  it('token issued by auth login is accepted by feed post route', async () => {
    // Step 1: Login through the auth route to get a real token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'admin', password: 'password123' });

    expect(loginResponse.status).toBe(200);
    const { token } = loginResponse.body;
    expect(token).toBeTruthy();

    // Step 2: Use that token to create a post through the feed route
    const savedDoc = {
      _id: 'post-jwt-test',
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockResolvedValue(true)
    };
    Post.mockImplementation((payload) => ({
      ...savedDoc,
      ...payload
    }));

    const postResponse = await request(app)
      .post('/api/feed/post')
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'Testing JWT secret consistency',
        targetFeedId: AUTHOR_ID,
        visibility: 'public'
      });

    // The request should succeed (201), NOT fail with 403 (invalid token)
    expect(postResponse.status).not.toBe(403);
    expect(postResponse.status).toBe(201);
    expect(postResponse.body.success).toBe(true);
  });
});
