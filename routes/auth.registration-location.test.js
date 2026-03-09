const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'jwt-token')
}));

const mockUserFindOne = jest.fn();
const mockGenerateUniversalId = jest.fn(() => 'universal-user-id');
const mockUserSave = jest.fn().mockResolvedValue(true);
const mockToPublicProfile = jest.fn(() => ({
  _id: 'user-1',
  username: 'new_user',
  country: 'US',
  county: null,
  zipCode: 'K1A0B1'
}));

const mockUserModel = jest.fn(function userConstructor(data) {
  Object.assign(this, data);
  this._id = 'user-1';
  this.onboardingStatus = 'pending';
  this.save = mockUserSave;
  this.toPublicProfile = mockToPublicProfile;
});
mockUserModel.findOne = mockUserFindOne;
mockUserModel.generateUniversalId = mockGenerateUniversalId;

const mockSessionModel = {
  findOneAndUpdate: jest.fn().mockResolvedValue({})
};

const mockSecurityEventModel = {
  create: jest.fn().mockResolvedValue({})
};

jest.mock('../models/User', () => mockUserModel);
jest.mock('../models/Session', () => mockSessionModel);
jest.mock('../models/SecurityEvent', () => mockSecurityEventModel);

const authRouter = require('./auth');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
};

describe('Auth registration location fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindOne.mockResolvedValue(null);
  });

  it('registers without county and normalizes zip code', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        realName: 'New User',
        username: 'new_user',
        email: 'new@example.com',
        password: 'StrongPass1',
        countryCode: 'us',
        zipCode: 'k1a 0b1'
      });

    expect(response.status).toBe(201);
    expect(mockUserModel).toHaveBeenCalledWith(expect.objectContaining({
      country: 'US',
      zipCode: 'K1A0B1'
    }));
    expect(mockUserModel.mock.calls[0][0].county).toBeUndefined();
    expect(response.body.user).toMatchObject({
      country: 'US',
      county: null,
      zipCode: 'K1A0B1'
    });
  });

  it('rejects malformed zip code with explicit validation error', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        realName: 'New User',
        username: 'new_user',
        email: 'new@example.com',
        password: 'StrongPass1',
        countryCode: 'US',
        zipCode: '12'
      });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ msg: expect.stringMatching(/zip code must be a valid/i) })
      ])
    );
    expect(mockUserModel).not.toHaveBeenCalled();
  });

  it('rejects invalid country selection', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        realName: 'New User',
        username: 'new_user',
        email: 'new@example.com',
        password: 'StrongPass1',
        countryCode: 'USA',
        zipCode: 'K1A0B1'
      });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ msg: expect.stringMatching(/country.*list/i) })
      ])
    );
    expect(mockUserModel).not.toHaveBeenCalled();
  });

  it('accepts optional profile discovery fields with visibility settings', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        realName: 'New User',
        username: 'new_user',
        email: 'new@example.com',
        password: 'StrongPass1',
        countryCode: 'US',
        zipCode: '73301',
        streetAddress: 'Austin, TX',
        worksAt: 'Acme Corp',
        hobbies: ['Hiking', 'Music'],
        ageGroup: '25-34',
        sex: 'Female',
        race: 'Other',
        profileFieldVisibility: {
          streetAddress: 'social',
          worksAt: 'public',
          hobbies: 'public',
          ageGroup: 'public',
          sex: 'secure',
          race: 'social'
        }
      });

    expect(response.status).toBe(201);
    expect(mockUserModel).toHaveBeenCalledWith(expect.objectContaining({
      streetAddress: 'Austin, TX',
      worksAt: 'Acme Corp',
      hobbies: ['Hiking', 'Music'],
      ageGroup: '25-34',
      sex: 'Female',
      race: 'Other',
      profileFieldVisibility: expect.objectContaining({
        worksAt: 'public',
        hobbies: 'public'
      })
    }));
  });
});
