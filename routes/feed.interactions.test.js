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

describe('Feed interaction routes', () => {
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

  it('rejects invalid poll interaction payload during post creation', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/feed/post')
      .set('Authorization', 'Bearer token')
      .send({
        targetFeedId: AUTHOR_ID,
        interaction: {
          type: 'poll',
          question: 'Pick one',
          options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
          allowMultiple: false,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('interaction');
    expect(response.body.error).toMatch(/no more than 6 options/i);
  });

  it('creates a post with quiz interaction payload', async () => {
    const app = buildApp();
    const savedDoc = {
      _id: 'post-1',
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockResolvedValue(true)
    };
    Post.mockImplementation((payload) => ({
      ...savedDoc,
      ...payload
    }));

    const response = await request(app)
      .post('/api/feed/post')
      .set('Authorization', 'Bearer token')
      .send({
        targetFeedId: AUTHOR_ID,
        content: 'Trivia time',
        interaction: {
          type: 'quiz',
          question: '2+2?',
          options: ['3', '4'],
          correctOptionIndex: 1,
          explanation: 'Basic arithmetic',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        }
      });

    expect(response.status).toBe(201);
    expect(Post).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Trivia time',
        interaction: expect.objectContaining({
          type: 'quiz',
          quiz: expect.objectContaining({
            question: '2+2?',
            options: ['3', '4'],
            correctOptionIndex: 1
          })
        })
      })
    );
  });

  it('rejects zero-tolerance words in post content', async () => {
    const app = buildApp();
    mockSiteContentFilterFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        zeroToleranceWords: ['banned'],
        maturityCensoredWords: []
      })
    });

    const response = await request(app)
      .post('/api/feed/post')
      .set('Authorization', 'Bearer token')
      .send({
        targetFeedId: AUTHOR_ID,
        content: 'This banned word should fail'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('banned');
    expect(Post).not.toHaveBeenCalled();
  });

  it('deduplicates poll vote submissions by user', async () => {
    const app = buildApp();
    const postDoc = {
      _id: 'post-poll',
      interaction: {
        type: 'poll',
        status: 'active',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        poll: {
          question: 'Favorite color?',
          options: ['Red', 'Blue'],
          allowMultiple: false
        }
      },
      interactionResponses: {
        pollVotes: [{ userId: AUTHOR_ID, optionIndexes: [0] }],
        quizAnswers: [],
        countdownFollowers: []
      },
      canView: jest.fn().mockReturnValue(true),
      save: jest.fn().mockResolvedValue(true)
    };

    Post.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(postDoc)
    });

    const response = await request(app)
      .post('/api/feed/post/post-poll/vote')
      .set('Authorization', 'Bearer token')
      .send({ optionIndexes: [1] });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/already voted/i);
  });

  it('locks quiz answer after first submission', async () => {
    const app = buildApp();
    const postDoc = {
      _id: 'post-quiz',
      interaction: {
        type: 'quiz',
        status: 'active',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        quiz: {
          question: 'Capital of France?',
          options: ['Berlin', 'Paris'],
          correctOptionIndex: 1,
          explanation: 'Paris is the capital city of France.'
        }
      },
      interactionResponses: {
        pollVotes: [],
        quizAnswers: [{ userId: AUTHOR_ID, optionIndex: 1, isCorrect: true }],
        countdownFollowers: []
      },
      canView: jest.fn().mockReturnValue(true),
      save: jest.fn().mockResolvedValue(true)
    };

    Post.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(postDoc)
    });

    const response = await request(app)
      .post('/api/feed/post/post-quiz/quiz-answer')
      .set('Authorization', 'Bearer token')
      .send({ optionIndex: 0 });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/locked/i);
  });

  it('rejects submissions for expired poll interactions', async () => {
    const app = buildApp();
    const postDoc = {
      _id: 'post-expired-poll',
      interaction: {
        type: 'poll',
        status: 'active',
        expiresAt: new Date(Date.now() - 1000),
        poll: {
          question: 'Expired poll?',
          options: ['Yes', 'No'],
          allowMultiple: false
        }
      },
      interactionResponses: {
        pollVotes: [],
        quizAnswers: [],
        countdownFollowers: []
      },
      canView: jest.fn().mockReturnValue(true),
      save: jest.fn().mockResolvedValue(true)
    };

    Post.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(postDoc)
    });

    const response = await request(app)
      .post('/api/feed/post/post-expired-poll/vote')
      .set('Authorization', 'Bearer token')
      .send({ optionIndexes: [0] });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/no longer accepting votes/i);
  });
});
