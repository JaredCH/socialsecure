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
  getFriends: jest.fn()
};

const mockTopFriend = {};
const mockPresence = {};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/Friendship', () => mockFriendship);
jest.mock('../models/TopFriend', () => mockTopFriend);
jest.mock('../models/Presence', () => mockPresence);
jest.mock('../services/notifications', () => ({
  createNotification: jest.fn()
}));
jest.mock('../services/realtime', () => ({
  getPresenceMapForUsers: jest.fn(),
  buildPresencePayload: jest.fn()
}));

const jwt = require('jsonwebtoken');
const { getPresenceMapForUsers, buildPresencePayload } = require('../services/realtime');
const friendsRouter = require('./friends');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/friends', friendsRouter);
  return app;
};

describe('Friends presence response', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'viewer-1' }));
    mockUser.findById.mockResolvedValue({
      _id: 'viewer-1',
      registrationStatus: 'active'
    });
    mockFriendship.getFriends.mockResolvedValue([
      {
        _id: 'friend-1',
        username: 'alice',
        realName: 'Alice',
        friendshipId: 'friendship-1'
      }
    ]);
    getPresenceMapForUsers.mockResolvedValue(new Map([
      ['friend-1', { status: 'online', lastSeen: null }]
    ]));
    mockUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'friend-1',
            realtimePreferences: {
              enabled: true,
              showPresence: true,
              showLastSeen: true
            }
          }
        ])
      })
    });
    buildPresencePayload.mockReturnValue({
      userId: 'friend-1',
      status: 'online',
      lastSeen: null
    });
  });

  it('decorates the friends list with presence details', async () => {
    const app = buildApp();

    const response = await request(app)
      .get('/api/friends')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(getPresenceMapForUsers).toHaveBeenCalledWith(['friend-1']);
    expect(response.body.friends[0]).toMatchObject({
      _id: 'friend-1',
      username: 'alice',
      presence: {
        userId: 'friend-1',
        status: 'online',
        lastSeen: null
      }
    });
  });
});
