const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn()
}));

const mockUserModel = { findById: jest.fn(), findOne: jest.fn() };
const mockSessionModel = {
  findOne: jest.fn()
};
jest.mock('../models/User', () => mockUserModel);
jest.mock('../models/Session', () => mockSessionModel);
jest.mock('../models/SecurityEvent', () => ({ create: jest.fn() }));
jest.mock('../services/notifications', () => ({ createNotification: jest.fn() }));

const jwt = require('jsonwebtoken');
const { createNotification } = require('../services/notifications');
const authRouter = require('./auth');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
};

const buildUserDoc = (overrides = {}) => {
  const user = {
    _id: 'user-1',
    realName: 'Test User',
    city: 'Austin',
    state: 'TX',
    country: 'US',
    bio: '',
    locationLastUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
    save: jest.fn().mockResolvedValue(true),
    toPublicProfile: jest.fn(function toPublicProfile() {
      return {
        _id: this._id,
        realName: this.realName,
        city: this.city,
        state: this.state,
        country: this.country,
        bio: this.bio
      };
    }),
    ...overrides
  };
  return user;
};

describe('Auth profile location update cooldown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockReturnValue({ userId: 'user-1' });
    mockUserModel.findOne.mockResolvedValue(null);
    mockSessionModel.findOne.mockResolvedValue({ save: jest.fn().mockResolvedValue(true) });
  });

  it('allows location updates when the 7-day cooldown has elapsed', async () => {
    const app = buildApp();
    const user = buildUserDoc({
      locationLastUpdatedAt: new Date(Date.now() - (8 * 24 * 60 * 60 * 1000))
    });
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        city: 'San Marcos',
        state: 'TX',
        country: 'US'
      });

    expect(response.status).toBe(200);
    expect(user.save).toHaveBeenCalled();
    expect(user.city).toBe('San Marcos');
    expect(user.locationLastUpdatedAt).toBeInstanceOf(Date);
  });

  it('rejects location changes within the 7-day cooldown window', async () => {
    const app = buildApp();
    const user = buildUserDoc({
      locationLastUpdatedAt: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000))
    });
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        city: 'San Marcos'
      });

    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/once every 7 days/i);
    expect(user.save).not.toHaveBeenCalled();
  });

  it('still allows non-location profile updates during the cooldown', async () => {
    const app = buildApp();
    const user = buildUserDoc({
      locationLastUpdatedAt: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000))
    });
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        bio: 'Updated bio'
      });

    expect(response.status).toBe(200);
    expect(user.bio).toBe('Updated bio');
    expect(user.save).toHaveBeenCalled();
  });

  it('updates optional onboarding info fields and social/secure visibility controls', async () => {
    const app = buildApp();
    const user = buildUserDoc({
      email: 'old@example.com',
      phone: '',
      streetAddress: '',
      hobbies: [],
      ageGroup: '',
      sex: '',
      race: '',
      profileFieldVisibility: {
        streetAddress: 'social',
        phone: 'social',
        email: 'social',
        ageGroup: 'social',
        sex: 'social',
        race: 'social',
        hobbies: 'social'
      }
    });
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        streetAddress: '123 Main St',
        phone: '+15551112222',
        ageGroup: '25-34',
        sex: 'Female',
        race: 'Asian',
        hobbies: ['Music', 'Travel'],
        profileFieldVisibility: {
          streetAddress: 'secure',
          phone: 'secure',
          email: 'secure',
          ageGroup: 'social',
          sex: 'secure',
          race: 'social',
          hobbies: 'secure'
        }
      });

    expect(response.status).toBe(200);
    expect(user.save).toHaveBeenCalled();
    expect(user.streetAddress).toBe('123 Main St');
    expect(user.phone).toBe('+15551112222');
    expect(user.email).toBe('old@example.com');
    expect(user.hobbies).toEqual(['Music', 'Travel']);
    expect(user.profileFieldVisibility).toEqual(expect.objectContaining({
      streetAddress: 'secure',
      phone: 'secure',
      email: 'secure',
      ageGroup: 'social',
      sex: 'secure',
      race: 'social',
      hobbies: 'secure'
    }));
  });

  it('marks street address as pending when another active user already has it', async () => {
    const app = buildApp();
    const user = buildUserDoc({
      username: 'new_user',
      realName: 'New User',
      streetAddress: ''
    });
    const existingResident = {
      _id: 'user-2',
      addressApprovalRequests: [],
      save: jest.fn().mockResolvedValue(true)
    };
    mockUserModel.findById.mockResolvedValue(user);
    mockUserModel.findOne.mockResolvedValue(existingResident);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        streetAddress: '123 Main St'
      });

    expect(response.status).toBe(200);
    expect(response.body.addressPendingApproval).toBe(true);
    expect(user.streetAddress).toBe('');
    expect(user.pendingStreetAddress).toBe('123 Main St');
    expect(user.pendingStreetAddressStatus).toBe('pending');
    expect(existingResident.save).toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalled();
  });

  it('allows resident to approve an address request', async () => {
    const app = buildApp();
    const owner = buildUserDoc({
      _id: 'user-owner',
      addressApprovalRequests: [{
        _id: 'request-1',
        requesterId: 'user-requester',
        requesterUsername: 'pending_user',
        requesterRealName: 'Pending User',
        address: '123 Main St',
        status: 'pending',
        requestedAt: new Date('2026-01-01T00:00:00.000Z'),
        respondedAt: null
      }]
    });
    const requester = buildUserDoc({
      _id: 'user-requester',
      streetAddress: '',
      pendingStreetAddress: '123 Main St',
      pendingStreetAddressStatus: 'pending'
    });

    mockUserModel.findById
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(owner) })
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce(requester);

    const response = await request(app)
      .post('/api/auth/address-approval/respond')
      .set('Authorization', 'Bearer token')
      .send({
        requestId: 'request-1',
        decision: 'approved'
      });

    expect(response.status).toBe(200);
    expect(requester.streetAddress).toBe('123 Main St');
    expect(requester.pendingStreetAddressStatus).toBe('approved');
    expect(owner.addressApprovalRequests[0].status).toBe('approved');
    expect(createNotification).toHaveBeenCalled();
  });
});
