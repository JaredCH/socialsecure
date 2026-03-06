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
  county: 'Orange County',
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

  it('registers with county and normalizes zip code', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        realName: 'New User',
        username: 'new_user',
        email: 'new@example.com',
        password: 'StrongPass1',
        county: '  Orange County  ',
        zipCode: 'k1a 0b1'
      });

    expect(response.status).toBe(201);
    expect(mockUserModel).toHaveBeenCalledWith(expect.objectContaining({
      county: 'Orange County',
      zipCode: 'K1A0B1'
    }));
    expect(response.body.user).toMatchObject({
      county: 'Orange County',
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
        county: 'Orange County',
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
});
