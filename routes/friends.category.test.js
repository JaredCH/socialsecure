const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockUser = {
  findById: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn()
};

const mockFriendship = {
  findById: jest.fn(),
  findFriendship: jest.fn(),
  getFriends: jest.fn()
};

const mockTopFriend = {
  updateOne: jest.fn(),
  updateOrder: jest.fn(),
  getOrCreate: jest.fn(),
  findOne: jest.fn()
};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/Friendship', () => mockFriendship);
jest.mock('../models/TopFriend', () => mockTopFriend);
jest.mock('../models/Presence', () => ({}));
jest.mock('../services/notifications', () => ({
  createNotification: jest.fn(),
  publish: jest.fn()
}));
jest.mock('../services/realtime', () => ({
  getPresenceMapForUsers: jest.fn().mockResolvedValue(new Map()),
  buildPresencePayload: jest.fn().mockReturnValue({ status: 'offline', lastSeen: null })
}));

const jwt = require('jsonwebtoken');
const friendsRouter = require('./friends');
const { createNotification, publish } = require('../services/notifications');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/friends', friendsRouter);
  return app;
};

describe('Friends category and top5 routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: '507f1f77bcf86cd799439011' }));
    mockUser.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      registrationStatus: 'active'
    });
    mockUser.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mockTopFriend.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mockTopFriend.getOrCreate.mockResolvedValue({ friends: [] });
    mockTopFriend.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ friends: [] })
      })
    });
  });

  it('updates requester-owned friendship category', async () => {
    const friendshipDoc = {
      _id: '507f1f77bcf86cd799439099',
      requester: { toString: () => '507f1f77bcf86cd799439011' },
      recipient: { toString: () => '507f1f77bcf86cd799439022' },
      status: 'accepted',
      requesterCategory: 'social',
      recipientCategory: 'social',
      save: jest.fn().mockResolvedValue(true)
    };
    mockFriendship.findById.mockResolvedValue(friendshipDoc);

    const app = buildApp();
    const response = await request(app)
      .put('/api/friends/507f1f77bcf86cd799439099/category')
      .set('Authorization', 'Bearer token')
      .send({ category: 'secure' });

    expect(response.status).toBe(200);
    expect(friendshipDoc.requesterCategory).toBe('secure');
    expect(friendshipDoc.save).toHaveBeenCalled();
    expect(response.body).toMatchObject({ success: true, category: 'secure' });
  });

  it('rejects category updates when friendship is not accepted', async () => {
    mockFriendship.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      requester: { toString: () => '507f1f77bcf86cd799439011' },
      recipient: { toString: () => '507f1f77bcf86cd799439022' },
      status: 'pending'
    });

    const app = buildApp();
    const response = await request(app)
      .put('/api/friends/507f1f77bcf86cd799439099/category')
      .set('Authorization', 'Bearer token')
      .send({ category: 'secure' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/accepted friendships/i);
  });

  it('removes both users from top friends when blocking an accepted friend', async () => {
    mockFriendship.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      requester: '507f1f77bcf86cd799439011',
      recipient: '507f1f77bcf86cd799439022',
      status: 'accepted',
      save: jest.fn().mockResolvedValue(true)
    });

    const app = buildApp();
    const response = await request(app)
      .post('/api/friends/507f1f77bcf86cd799439099/block')
      .set('Authorization', 'Bearer token')
      .send({});

    expect(response.status).toBe(200);
    expect(mockTopFriend.updateOne).toHaveBeenCalledTimes(2);
    expect(mockTopFriend.updateOne).toHaveBeenNthCalledWith(1, { user: '507f1f77bcf86cd799439011' }, { $pull: { friends: '507f1f77bcf86cd799439022' } });
    expect(mockTopFriend.updateOne).toHaveBeenNthCalledWith(2, { user: '507f1f77bcf86cd799439022' }, { $pull: { friends: '507f1f77bcf86cd799439011' } });
  });

  it('includes viewer-owned category in relationship payload', async () => {
    mockFriendship.findFriendship.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      requester: { toString: () => '507f1f77bcf86cd799439011' },
      recipient: { toString: () => '507f1f77bcf86cd799439022' },
      status: 'accepted',
      requesterCategory: 'secure',
      recipientCategory: 'social'
    });
    mockUser.findById
      .mockResolvedValueOnce({
        _id: '507f1f77bcf86cd799439011',
        registrationStatus: 'active'
      })
      .mockResolvedValueOnce({
        _id: '507f1f77bcf86cd799439022',
        registrationStatus: 'active'
      });

    const app = buildApp();
    const response = await request(app)
      .get('/api/friends/relationship/507f1f77bcf86cd799439022')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.relationship).toBe('accepted');
    expect(response.body.category).toBe('secure');
  });

  it('creates a requester notification when a pending request is accepted', async () => {
    const acceptedAt = new Date('2026-03-17T00:00:00.000Z');
    const friendshipDoc = {
      _id: '507f1f77bcf86cd799439099',
      requester: { toString: () => '507f1f77bcf86cd799439022' },
      recipient: { toString: () => '507f1f77bcf86cd799439011' },
      status: 'pending',
      acceptedAt: null,
      requesterCategory: 'social',
      recipientCategory: 'social',
      save: jest.fn().mockImplementation(function save() {
        this.acceptedAt = acceptedAt;
        return Promise.resolve(true);
      })
    };
    mockFriendship.findById.mockResolvedValue(friendshipDoc);

    const app = buildApp();
    const response = await request(app)
      .post('/api/friends/507f1f77bcf86cd799439099/accept')
      .set('Authorization', 'Bearer token')
      .send({});

    expect(response.status).toBe(200);
    expect(friendshipDoc.status).toBe('accepted');
    expect(mockUser.updateOne).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith('friend_request_accepted', expect.objectContaining({
      recipientId: friendshipDoc.requester,
      senderId: friendshipDoc.recipient
    }));
  });

  it('creates a requester notification when a pending request is declined', async () => {
    const friendshipDoc = {
      _id: '507f1f77bcf86cd799439099',
      requester: { toString: () => '507f1f77bcf86cd799439022' },
      recipient: { toString: () => '507f1f77bcf86cd799439011' },
      status: 'pending',
      declinedAt: null,
      save: jest.fn().mockResolvedValue(true)
    };
    mockFriendship.findById.mockResolvedValue(friendshipDoc);

    const app = buildApp();
    const response = await request(app)
      .post('/api/friends/507f1f77bcf86cd799439099/decline')
      .set('Authorization', 'Bearer token')
      .send({});

    expect(response.status).toBe(200);
    expect(friendshipDoc.status).toBe('declined');
    expect(publish).toHaveBeenCalledWith('friend_request_declined', expect.objectContaining({
      recipientId: friendshipDoc.requester,
      senderId: friendshipDoc.recipient
    }));
  });

  it('allows requester to cancel an outgoing pending request and notifies recipient', async () => {
    const friendshipDoc = {
      _id: '507f1f77bcf86cd799439099',
      requester: { toString: () => '507f1f77bcf86cd799439011' },
      recipient: { toString: () => '507f1f77bcf86cd799439022' },
      status: 'pending',
      save: jest.fn().mockResolvedValue(true)
    };
    mockFriendship.findById.mockResolvedValue(friendshipDoc);

    const app = buildApp();
    const response = await request(app)
      .delete('/api/friends/507f1f77bcf86cd799439099')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(friendshipDoc.status).toBe('removed');
    expect(response.body.message).toMatch(/request canceled/i);
    expect(publish).toHaveBeenCalledWith('friend_request_canceled', expect.objectContaining({
      recipientId: friendshipDoc.recipient,
      senderId: friendshipDoc.requester
    }));
  });

  it('returns backend top5 validation errors from update route', async () => {
    const error = new Error('Cannot have more than 5 top friends');
    error.status = 400;
    mockTopFriend.updateOrder.mockRejectedValue(error);

    const app = buildApp();
    const response = await request(app)
      .put('/api/friends/top')
      .set('Authorization', 'Bearer token')
      .send({
        friendIds: [
          '507f1f77bcf86cd799439021',
          '507f1f77bcf86cd799439022',
          '507f1f77bcf86cd799439023',
          '507f1f77bcf86cd799439024',
          '507f1f77bcf86cd799439025',
          '507f1f77bcf86cd799439026',
          '507f1f77bcf86cd799439027',
          '507f1f77bcf86cd799439028',
          '507f1f77bcf86cd799439029'
        ]
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/more than 5/i);
  });

  it('creates a partner request for an accepted friendship', async () => {
    const friendshipDoc = {
      _id: '507f1f77bcf86cd799439099',
      requester: { toString: () => '507f1f77bcf86cd799439011' },
      recipient: { toString: () => '507f1f77bcf86cd799439022' },
      status: 'accepted',
      partnerStatus: 'none',
      partnerRequestedBy: null,
      partnerRequestedAt: null,
      save: jest.fn().mockResolvedValue(true)
    };
    mockFriendship.findById.mockResolvedValue(friendshipDoc);

    const app = buildApp();
    const response = await request(app)
      .patch('/api/friends/507f1f77bcf86cd799439099/partner')
      .set('Authorization', 'Bearer token')
      .send({ action: 'request' });

    expect(response.status).toBe(200);
    expect(friendshipDoc.partnerStatus).toBe('pending');
    expect(friendshipDoc.partnerRequestedBy).toEqual('507f1f77bcf86cd799439011');
    expect(response.body.partner).toMatchObject({
      status: 'pending',
      requestedByViewer: true,
      canRespond: false
    });
  });

  it('accepts an incoming partner request', async () => {
    const friendshipDoc = {
      _id: '507f1f77bcf86cd799439099',
      requester: { toString: () => '507f1f77bcf86cd799439022' },
      recipient: { toString: () => '507f1f77bcf86cd799439011' },
      status: 'accepted',
      partnerStatus: 'pending',
      partnerRequestedBy: { toString: () => '507f1f77bcf86cd799439022' },
      partnerRequestedAt: new Date(),
      save: jest.fn().mockResolvedValue(true)
    };
    mockFriendship.findById.mockResolvedValue(friendshipDoc);

    const app = buildApp();
    const response = await request(app)
      .patch('/api/friends/507f1f77bcf86cd799439099/partner')
      .set('Authorization', 'Bearer token')
      .send({ action: 'accept' });

    expect(response.status).toBe(200);
    expect(friendshipDoc.partnerStatus).toBe('accepted');
    expect(response.body.partner).toMatchObject({
      status: 'accepted',
      requestedByViewer: false,
      canRespond: false
    });
  });
});
