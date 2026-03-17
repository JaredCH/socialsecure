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
  realName: 'New User',
  country: 'US',
  county: 'Hays County',
  zipCode: '78666',
  city: 'San Marcos',
  state: 'TX'
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

const mockNewsPreferencesModel = {
  findOneAndUpdate: jest.fn().mockResolvedValue({})
};

const mockTriggerLocationIngest = jest.fn().mockResolvedValue({ status: 'queued', zipCode: '78666' });

const mockExpandCityRoomsForZip = jest.fn().mockResolvedValue({ created: [] });

jest.mock('../models/User', () => mockUserModel);
jest.mock('../models/Session', () => mockSessionModel);
jest.mock('../models/SecurityEvent', () => mockSecurityEventModel);
jest.mock('../models/NewsPreferences', () => mockNewsPreferencesModel);
jest.mock('../models/ChatRoom', () => ({
  expandCityRoomsForZip: mockExpandCityRoomsForZip
}));
jest.mock('../services/newsIngestion.local', () => ({
  triggerLocationIngest: mockTriggerLocationIngest
}));

const authRouter = require('./auth');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
};

describe('Auth registration minimal identity flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindOne.mockResolvedValue(null);
    mockNewsPreferencesModel.findOneAndUpdate.mockResolvedValue({});
    mockTriggerLocationIngest.mockResolvedValue({ status: 'queued', zipCode: '78666' });
  });

  it('registers with first/last name, username, email, and zip while backfilling city/state', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'New',
        lastName: 'User',
        username: 'new_user',
        email: 'new@example.com',
        zipCode: '78666'
      });

    expect(response.status).toBe(201);
    expect(mockUserModel).toHaveBeenCalledWith(expect.objectContaining({
      realName: 'New User',
      username: 'new_user',
      email: 'new@example.com',
      city: 'San Marcos',
      state: 'TX',
      country: 'US',
      county: 'Hays County',
      zipCode: '78666',
      mustResetPassword: false
    }));
    expect(mockUserModel.mock.calls[0][0].passwordHash).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      username: 'new_user',
      realName: 'New User',
      email: 'new@example.com'
    });
    expect(mockNewsPreferencesModel.findOneAndUpdate).toHaveBeenCalledWith(
      { user: 'user-1' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          user: 'user-1',
          locations: [expect.objectContaining({
            city: 'San Marcos',
            cityKey: 'TX:san-marcos',
            zipCode: '78666',
            state: 'Texas',
            stateCode: 'TX',
            country: 'United States',
            countryCode: 'US',
            county: 'Hays County',
            isPrimary: true
          })]
        })
      }),
      expect.objectContaining({ upsert: true, new: true, setDefaultsOnInsert: true })
    );
    expect(mockTriggerLocationIngest).toHaveBeenCalledWith('78666');
    expect(response.body.registrationNewsPrefetch).toEqual({ status: 'queued', zipCode: '78666' });
    expect(response.body.requiresPasswordReset).toBe(false);
  });

  it('rejects registration when no name information is provided', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'new_user',
        email: 'new@example.com',
        zipCode: '78666'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/name is required/i);
    expect(mockUserModel).not.toHaveBeenCalled();
  });

  it('returns username availability for live registration checks', async () => {
    const app = buildApp();

    mockUserFindOne.mockResolvedValueOnce({ _id: 'taken-user' });
    const takenResponse = await request(app).get('/api/auth/username-availability?username=taken_name');
    expect(takenResponse.status).toBe(200);
    expect(takenResponse.body.available).toBe(false);

    mockUserFindOne.mockResolvedValueOnce(null);
    const availableResponse = await request(app).get('/api/auth/username-availability?username=free_name');
    expect(availableResponse.status).toBe(200);
    expect(availableResponse.body.available).toBe(true);
  });
});
