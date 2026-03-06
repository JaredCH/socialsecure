const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockPost = {
  findById: jest.fn()
};

const mockUser = {
  findById: jest.fn()
};

const mockFriendship = {
  find: jest.fn()
};

const mockBlockList = {
  find: jest.fn(),
  findOne: jest.fn()
};

const mockMuteList = {
  find: jest.fn()
};

jest.mock('../models/Post', () => mockPost);
jest.mock('../models/User', () => mockUser);
jest.mock('../models/Friendship', () => mockFriendship);
jest.mock('../models/BlockList', () => mockBlockList);
jest.mock('../models/MuteList', () => mockMuteList);
jest.mock('../services/notifications', () => ({
  createNotification: jest.fn()
}));
jest.mock('../services/realtime', () => ({
  emitFeedInteraction: jest.fn(),
  emitFeedPost: jest.fn()
}));

const jwt = require('jsonwebtoken');
const { emitFeedInteraction } = require('../services/realtime');
const feedRouter = require('./feed');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/feed', feedRouter);
  return app;
};

const createSelectLean = (value) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value)
  })
});

describe('Feed realtime broadcasts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'viewer-1' }));

    mockUser.findById
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          _id: 'viewer-1',
          onboardingStatus: 'completed'
        })
      })
      .mockReturnValueOnce(createSelectLean({
        _id: 'viewer-1',
        username: 'viewer',
        realName: 'Viewer'
      }));

    mockFriendship.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { requester: 'viewer-1', recipient: 'friend-2' }
        ])
      })
    });

    const post = {
      _id: 'post-1',
      authorId: 'author-2',
      targetFeedId: 'author-2',
      likes: [],
      comments: [],
      canView: jest.fn().mockReturnValue(true),
      addLike: jest.fn(async function addLike(userId) {
        this.likes.push(userId);
        return this;
      })
    };

    mockPost.findById.mockResolvedValue(post);
  });

  it('emits a realtime interaction event when a post is liked', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/feed/post/post-1/like')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(emitFeedInteraction).toHaveBeenCalledWith(expect.objectContaining({
      interaction: expect.objectContaining({
        type: 'like',
        postId: 'post-1',
        actorId: 'viewer-1',
        likesCount: 1
      })
    }));
  });
});
