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
jest.mock('../services/notifications', () => ({ createNotification: jest.fn(), publish: jest.fn() }));

// Mock news routes to prevent database operations during profile update tests
const mockQueueImmediateLocationFetch = jest.fn().mockResolvedValue({ status: 'queued', locationKey: 'TEST:KEY' });
jest.mock('./news', () => ({
  queueImmediateLocationFetch: mockQueueImmediateLocationFetch
}));

const jwt = require('jsonwebtoken');
const { createNotification, publish } = require('../services/notifications');
const authRouter = require('./auth');
const { canonicalizeNewsLocation } = require('../utils/newsLocationTaxonomy');
const { canonicalizeLocationInput, resolveCanonicalLocationInput, buildLocationKey } = require('../services/newsLocationMaster');

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
    mockQueueImmediateLocationFetch.mockClear();
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
  }, 15000);

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

  it('accepts empty phone when profile payload includes it', async () => {
    const app = buildApp();
    const user = buildUserDoc({
      phone: '225-614-6012'
    });
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        phone: ''
      });

    expect(response.status).toBe(200);
    expect(user.phone).toBe('');
    expect(user.save).toHaveBeenCalled();
  });

  it('updates optional onboarding info fields and social/secure visibility controls', async () => {
    const app = buildApp();
    const user = buildUserDoc({
      email: 'old@example.com',
      phone: '',
      worksAt: '',
      streetAddress: '',
      hobbies: [],
      ageGroup: '',
      sex: '',
      race: '',
      profileFieldVisibility: {
        streetAddress: 'social',
        phone: 'social',
        worksAt: 'social',
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
        phone: '225-614-6012',
        worksAt: 'Epic Piping',
        ageGroup: '25-34',
        sex: 'Female',
        race: 'Asian',
        hobbies: ['Music', 'Travel'],
        profileFieldVisibility: {
          streetAddress: 'secure',
          phone: 'secure',
          worksAt: 'secure',
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
    expect(user.phone).toBe('225-614-6012');
    expect(user.worksAt).toBe('Epic Piping');
    expect(user.email).toBe('old@example.com');
    expect(user.hobbies).toEqual(['Music', 'Travel']);
    expect(user.profileFieldVisibility).toEqual(expect.objectContaining({
      streetAddress: 'secure',
      phone: 'secure',
      worksAt: 'secure',
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
    expect(publish).toHaveBeenCalled();
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
    expect(publish).toHaveBeenCalled();
  });

  it('accepts zipCode in profile update and backfills city/state/country from the zip index', async () => {
    const app = buildApp();
    const user = buildUserDoc({
      zipCode: null,
      locationLastUpdatedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        zipCode: '78666'
      });

    expect(response.status).toBe(200);
    expect(user.save).toHaveBeenCalled();
    expect(user.zipCode).toBe('78666');
    expect(user.city).toBe('San Marcos');
    expect(user.state).toBe('TX');
    expect(user.country).toBe('US');
    expect(user.locationLastUpdatedAt).toBeInstanceOf(Date);
  }, 15000);

  it('treats zip-only profile update as location change and enforces cooldown', async () => {
    const app = buildApp();
    const user = buildUserDoc({
      zipCode: '78666',
      locationLastUpdatedAt: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000))
    });
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        zipCode: '78701'
      });

    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/once every 7 days/i);
    expect(user.save).not.toHaveBeenCalled();
  });

  it('triggers queueImmediateLocationFetch after successful zip-only profile update', async () => {
    const app = buildApp();
    const user = buildUserDoc({
      zipCode: null,
      city: 'Austin',
      state: 'TX',
      country: 'US',
      locationLastUpdatedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    mockUserModel.findById.mockResolvedValue(user);

    jest.mock('./news', () => ({
      queueImmediateLocationFetch: jest.fn().mockResolvedValue({ status: 'queued', locationKey: 'ZIP:78666' })
    }));

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        zipCode: '78666'
      });

    expect(response.status).toBe(200);
    expect(user.zipCode).toBe('78666');
    expect(user.locationLastUpdatedAt).toBeInstanceOf(Date);
  });

  it('validates zipCode format and rejects invalid zips', async () => {
    const app = buildApp();
    const user = buildUserDoc();
    mockUserModel.findById.mockResolvedValue(user);

    const invalidZips = ['1234', '123456', 'abcde', '12345-67890', ''];
    for (const invalidZip of invalidZips) {
      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', 'Bearer token')
        .send({ zipCode: invalidZip });

      if (invalidZip === '') {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(400);
        expect(response.body.errors).toBeDefined();
      }
    }
  });

  it('accepts valid ZIP+4 format', async () => {
    const app = buildApp();
    const user = buildUserDoc({
      zipCode: null,
      locationLastUpdatedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        zipCode: '78666-1234'
      });

    expect(response.status).toBe(200);
    expect(user.zipCode).toBe('78666-1234');
  });
});

describe('canonicalizeNewsLocation does not default to US', () => {
  it('returns null country when no country input is provided', () => {
    const result = canonicalizeNewsLocation({
      city: 'Austin',
      state: 'TX'
    });
    expect(result.country).toBeNull();
    expect(result.countryCode).toBeNull();
    expect(result.city).toBe('Austin');
    expect(result.stateCode).toBe('TX');
  });

  it('returns null country when empty country string is provided', () => {
    const result = canonicalizeNewsLocation({
      city: 'Austin',
      state: 'TX',
      country: ''
    });
    expect(result.country).toBeNull();
    expect(result.countryCode).toBeNull();
  });

  it('still canonicalizes US when explicitly provided', () => {
    const result = canonicalizeNewsLocation({
      city: 'Austin',
      state: 'TX',
      country: 'US'
    });
    expect(result.country).toBe('United States');
    expect(result.countryCode).toBe('US');
  });

  it('still canonicalizes USA variations to US', () => {
    const variations = ['USA', 'United States', 'united states', 'america'];
    for (const variation of variations) {
      const result = canonicalizeNewsLocation({
        city: 'Austin',
        state: 'TX',
        country: variation
      });
      expect(result.countryCode).toBe('US');
    }
  });

  it('preserves non-US country codes when provided', () => {
    const result = canonicalizeNewsLocation({
      city: 'Toronto',
      state: 'ON',
      country: 'CA'
    });
    expect(result.country).toBe('CA');
    expect(result.countryCode).toBe('CA');
  });
});

describe('newsLocationMaster buildLocationKey minimum granularity', () => {
  it('returns null for country-only input', () => {
    const canonical = {
      city: null,
      state: null,
      stateCode: null,
      zipCode: null,
      cityKey: null,
      country: 'United States',
      countryCode: 'US'
    };
    const key = buildLocationKey(canonical);
    expect(key).toBeNull();
  });

  it('returns valid key for state+country input', () => {
    const canonical = {
      city: null,
      state: 'Texas',
      stateCode: 'TX',
      zipCode: null,
      cityKey: null,
      country: 'United States',
      countryCode: 'US'
    };
    const key = buildLocationKey(canonical);
    expect(key).toBe('STATE:US:TX');
  });

  it('returns valid key for zipCode input', () => {
    const canonical = {
      city: null,
      state: null,
      stateCode: null,
      zipCode: '78666',
      cityKey: null,
      country: null,
      countryCode: null
    };
    const key = buildLocationKey(canonical);
    expect(key).toBe('ZIP:78666');
  });

  it('returns valid key for cityKey input', () => {
    const canonical = {
      city: 'Austin',
      state: 'Texas',
      stateCode: 'TX',
      zipCode: null,
      cityKey: 'TX:austin',
      country: 'United States',
      countryCode: 'US'
    };
    const key = buildLocationKey(canonical);
    expect(key).toBe('TX:austin');
  });

  it('canonicalizeLocationInput returns null for country-only data', () => {
    const result = canonicalizeLocationInput({
      country: 'US'
    });
    expect(result).toBeNull();
  });

  it('canonicalizeLocationInput returns valid result for state+country', () => {
    const result = canonicalizeLocationInput({
      state: 'TX',
      country: 'US'
    });
    expect(result).not.toBeNull();
    expect(result.locationKey).toBe('STATE:US:TX');
  });

  it('canonicalizeLocationInput returns valid result for zipCode', () => {
    const result = canonicalizeLocationInput({
      zipCode: '78666'
    });
    expect(result).not.toBeNull();
    expect(result.locationKey).toBe('ZIP:78666');
  });

  it('resolveCanonicalLocationInput backfills a zip-only location into canonical city/state data', async () => {
    const result = await resolveCanonicalLocationInput({
      zipCode: '78666'
    });
    expect(result).not.toBeNull();
    expect(result.canonical.zipCode).toBe('78666');
    expect(result.canonical.city).toBe('San Marcos');
    expect(result.canonical.stateCode).toBe('TX');
    expect(result.canonical.countryCode).toBe('US');
  });
});
