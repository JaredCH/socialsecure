const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockUser = {
  findOne: jest.fn(),
  find: jest.fn()
};

const mockPost = {
  find: jest.fn(),
  countDocuments: jest.fn()
};

const mockBlockList = {
  findOne: jest.fn()
};

const mockResume = {
  findOne: jest.fn()
};

const mockFriendship = {
  find: jest.fn()
};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/Post', () => mockPost);
jest.mock('../models/BlockList', () => mockBlockList);
jest.mock('../models/Resume', () => mockResume);
jest.mock('../models/Friendship', () => mockFriendship);

const jwt = require('jsonwebtoken');
const publicRouter = require('./public');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/public', publicRouter);
  return app;
};

const resolvedQuery = (value) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value)
  })
});

describe('Public circles route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });
    mockBlockList.findOne.mockReturnValue(resolvedQuery(null));
    mockUser.find.mockReturnValue(resolvedQuery([]));
    mockFriendship.find.mockReturnValue(resolvedQuery([]));
  });

  it('returns circles with mutual friend annotations for authenticated viewers', async () => {
    const app = buildApp();
    jwt.verify.mockReturnValue({ userId: 'viewer-1' });
    mockUser.findOne.mockReturnValue(resolvedQuery({
      _id: 'owner-1',
      username: 'owner',
      realName: 'Owner',
      friendListPrivacy: 'public',
      topFriendsPrivacy: 'public',
      circles: [{
        name: 'Core Team',
        color: '#3B82F6',
        relationshipAudience: 'secure',
        profileImageUrl: 'https://example.com/core.jpg',
        members: ['friend-1', 'friend-2']
      }]
    }));
    mockUser.find.mockReturnValue(resolvedQuery([
      { _id: 'friend-1', username: 'alpha', realName: 'Alpha', avatarUrl: '' },
      { _id: 'friend-2', username: 'beta', realName: 'Beta', avatarUrl: '' }
    ]));
    mockFriendship.find.mockReturnValue(resolvedQuery([
      { requester: 'viewer-1', recipient: 'friend-2' }
    ]));

    const response = await request(app)
      .get('/api/public/users/owner/friends/circles')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.circles).toHaveLength(1);
    expect(response.body.circles[0].relationshipAudience).toBe('secure');
    expect(response.body.circles[0].profileImageUrl).toBe('https://example.com/core.jpg');
    expect(response.body.circles[0].members.map((member) => member.isMutual)).toEqual([false, true]);
    expect(response.body.mutualFriendCount).toBe(1);
  });

  it('returns restricted payload when profile is private for non-owner', async () => {
    const app = buildApp();
    mockUser.findOne.mockReturnValue(resolvedQuery({
      _id: 'owner-1',
      username: 'owner',
      realName: 'Owner',
      friendListPrivacy: 'private',
      topFriendsPrivacy: 'private',
      circles: [{ name: 'Should Hide', members: ['friend-1'] }]
    }));

    const response = await request(app).get('/api/public/users/owner/friends/circles');

    expect(response.status).toBe(200);
    expect(response.body.restrictedContent).toBe(true);
    expect(response.body.circles).toEqual([]);
    expect(response.body.mutualFriendCount).toBe(0);
  });
});
