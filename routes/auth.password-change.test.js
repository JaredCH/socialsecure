const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'jwt-token'),
  verify: jest.fn(() => ({ userId: 'user-1', onboardingStatus: 'completed' }))
}));

const mockSession = {
  _id: 'session-1',
  save: jest.fn().mockResolvedValue(true)
};

const mockSessionModel = {
  findOne: jest.fn().mockResolvedValue(mockSession),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
  updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 })
};

const mockSecurityEventModel = {
  create: jest.fn().mockResolvedValue({})
};

const mutableUser = {
  _id: 'user-1',
  mustResetPassword: true,
  passwordHash: 'old-hash',
  comparePassword: jest.fn().mockResolvedValue(true),
  save: jest.fn().mockResolvedValue(true),
  toPublicProfile: jest.fn(() => ({ _id: 'user-1', username: 'user1', mustResetPassword: false }))
};

const mockUserFindById = jest.fn();
const mockUserModel = {
  findById: (...args) => mockUserFindById(...args),
  findOne: jest.fn().mockResolvedValue(null),
  generateUniversalId: jest.fn(() => 'universal-id')
};

jest.mock('../models/User', () => mockUserModel);
jest.mock('../models/Session', () => mockSessionModel);
jest.mock('../models/SecurityEvent', () => mockSecurityEventModel);
jest.mock('../models/DeviceKey', () => ({
  countDocuments: jest.fn().mockResolvedValue(0)
}));

const authRouter = require('./auth');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
};

describe('Auth password change endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutableUser.mustResetPassword = true;
    mutableUser.passwordHash = 'old-hash';
    mutableUser.comparePassword.mockResolvedValue(true);
    mutableUser.save.mockResolvedValue(true);
    mutableUser.toPublicProfile.mockReturnValue({ _id: 'user-1', username: 'user1', mustResetPassword: false });

    mockUserFindById
      .mockImplementationOnce(() => ({ select: jest.fn().mockResolvedValue(mutableUser) }))
      .mockImplementationOnce(() => Promise.resolve(mutableUser));
  });

  it('changes password and clears mustResetPassword flag', async () => {
    const app = buildApp();
    const response = await request(app)
      .post('/api/auth/password/change')
      .set('Authorization', 'Bearer token')
      .send({
        currentPassword: 'TempPass123',
        newPassword: 'NewPass123',
        confirmPassword: 'NewPass123'
      });

    expect(response.status).toBe(200);
    expect(mutableUser.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(mutableUser.mustResetPassword).toBe(false);
    expect(mutableUser.save).toHaveBeenCalled();
    expect(mockSessionModel.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', isRevoked: false },
      expect.objectContaining({
        $set: expect.objectContaining({
          isRevoked: true
        })
      })
    );
    expect(response.body.user.mustResetPassword).toBe(false);
  });
});
