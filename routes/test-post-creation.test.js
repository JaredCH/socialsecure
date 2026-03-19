const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockPostModel = jest.fn();
mockPostModel.findById = jest.fn();
mockPostModel.find = jest.fn();

jest.mock('../models/Post', () => mockPostModel);
jest.mock('../models/User', () => ({
  findById: jest.fn(),
  find: jest.fn()
}));
jest.mock('../models/Friendship', () => ({
  find: jest.fn(),
  findOne: jest.fn()
}));
jest.mock('../models/BlockList', () => ({
  find: jest.fn(),
  findOne: jest.fn()
}));
jest.mock('../models/MuteList', () => ({
  find: jest.fn()
}));
const mockSiteContentFilterFindOne = jest.fn();
jest.mock('../models/SiteContentFilter', () => ({
  findOne: (...args) => mockSiteContentFilterFindOne(...args)
}));
jest.mock('../services/notifications', () => ({
  createNotification: jest.fn().mockResolvedValue(null)
}));

const jwt = require('jsonwebtoken');
const Post = require('../models/Post');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const BlockList = require('../models/BlockList');
const MuteList = require('../models/MuteList');
const feedRouter = require('./feed');

const AUTHOR_ID = '507f1f77bcf86cd799439011';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/feed', feedRouter);
  return app;
};

const mockAuthenticatedUser = () => {
  jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: AUTHOR_ID }));
  User.findById.mockImplementation((id) => {
    if (id === AUTHOR_ID) {
      return {
        select: jest.fn().mockResolvedValue({
          _id: AUTHOR_ID,
          onboardingStatus: 'completed',
          circles: []
        })
      };
    }

    return Promise.resolve({
      _id: id,
      username: 'target-user'
    });
  });
};

const mockNoSocialBlocks = () => {
  BlockList.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    })
  });

  Friendship.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    })
  });
  Friendship.findOne.mockResolvedValue(null);

  BlockList.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    })
  });
  MuteList.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    })
  });
};

describe('Post creation debug', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticatedUser();
    mockNoSocialBlocks();
    mockSiteContentFilterFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        zeroToleranceWords: [],
        maturityCensoredWords: []
      })
    });
  });

  it('creates a basic text post to own feed', async () => {
    const app = buildApp();
    const savedDoc = {
      _id: 'post-basic',
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockResolvedValue(true),
      toObject: jest.fn().mockReturnValue({
        _id: 'post-basic',
        content: 'Hello world',
        authorId: AUTHOR_ID,
        targetFeedId: AUTHOR_ID,
        visibility: 'public',
        relationshipAudience: 'public',
        likes: [],
        comments: [],
        mediaUrls: [],
        createdAt: new Date().toISOString()
      })
    };
    Post.mockImplementation((payload) => ({
      ...savedDoc,
      ...payload
    }));

    const response = await request(app)
      .post('/api/feed/post')
      .set('Authorization', 'Bearer token')
      .send({
        content: 'Hello world',
        mediaUrls: [],
        visibility: 'public',
        targetFeedId: AUTHOR_ID,
      });

    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(response.body, null, 2));
    expect(response.status).toBe(201);
  });

  it('creates a post to own feed with the EXACT payload from Feed.js', async () => {
    const app = buildApp();
    const savedDoc = {
      _id: 'post-feed-page',
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockResolvedValue(true),
      toObject: jest.fn().mockReturnValue({
        _id: 'post-feed-page',
        content: 'Test post from feed page',
        authorId: AUTHOR_ID,
        targetFeedId: AUTHOR_ID,
        visibility: 'public',
        relationshipAudience: 'public',
        likes: [],
        comments: [],
        mediaUrls: [],
        createdAt: new Date().toISOString()
      })
    };
    Post.mockImplementation((payload) => ({
      ...savedDoc,
      ...payload
    }));

    // This is exactly what Feed.js sends
    const response = await request(app)
      .post('/api/feed/post')
      .set('Authorization', 'Bearer token')
      .send({
        content: 'Test post from feed page',
        mediaUrls: [],
        visibility: 'public',
        targetFeedId: AUTHOR_ID,
      });

    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(response.body, null, 2));
    expect(response.status).toBe(201);
  });

  it('creates a post with save throwing an error to see what happens', async () => {
    const app = buildApp();
    Post.mockImplementation((payload) => ({
      _id: 'post-fail',
      ...payload,
      save: jest.fn().mockRejectedValue(new Error('MongoDB save failed')),
      populate: jest.fn().mockResolvedValue(true)
    }));

    const response = await request(app)
      .post('/api/feed/post')
      .set('Authorization', 'Bearer token')
      .send({
        content: 'This should fail',
        mediaUrls: [],
        visibility: 'public',
        targetFeedId: AUTHOR_ID,
      });

    console.log('Error response status:', response.status);
    console.log('Error response body:', JSON.stringify(response.body, null, 2));
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to create post');
    expect(response.body.details).toBe('MongoDB save failed');
  });

  it('creates a post from Social.js with default relationship audience', async () => {
    const app = buildApp();
    const savedDoc = {
      _id: 'post-social-page',
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockResolvedValue(true),
      toObject: jest.fn().mockReturnValue({
        _id: 'post-social-page',
        content: 'Social page post',
        authorId: AUTHOR_ID,
        targetFeedId: AUTHOR_ID,
        visibility: 'public',
        relationshipAudience: 'public',
        likes: [],
        comments: [],
        mediaUrls: [],
        createdAt: new Date().toISOString()
      })
    };
    Post.mockImplementation((payload) => ({
      ...savedDoc,
      ...payload
    }));

    // Social.js sends these additional fields
    const response = await request(app)
      .post('/api/feed/post')
      .set('Authorization', 'Bearer token')
      .send({
        content: 'Social page post',
        mediaUrls: [],
        visibility: 'public',
        relationshipAudience: 'public',
        visibleToCircles: [],
        visibleToUsers: [],
        excludeUsers: [],
        locationRadius: null,
        expiresAt: null,
        targetFeedId: AUTHOR_ID,
        interaction: null,
      });

    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(response.body, null, 2));
    expect(response.status).toBe(201);
  });
});
