const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
  sign: jest.fn(() => 'auth-token')
}));

jest.mock('../models/User', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  generateUniversalId: jest.fn(() => 'universal-id')
}));

jest.mock('../models/ReferralInvitation', () => ({
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  getReferralStats: jest.fn(),
  validateReferral: jest.fn(),
  generateUniversalIdHash: jest.fn(() => 'hash'),
  generateToken: jest.fn(() => 'token')
}));

const jwt = require('jsonwebtoken');
const ReferralInvitation = require('../models/ReferralInvitation');
const universalRouter = require('./universal');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/universal', universalRouter);
  return app;
};

describe('Universal referral routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'inviter-1' }));
  });

  it('processes qualification and reward for eligible registered invite', async () => {
    const app = buildApp();
    const invitation = {
      _id: 'invite-1',
      inviterId: 'inviter-1',
      inviteeUserId: 'user-2',
      status: 'registered',
      rewardStatus: 'pending',
      rewardAmount: 0,
      rewardCurrency: 'credits',
      rewardTransactionId: null,
      qualifiedAt: null,
      rewardedAt: null,
      canQualify: jest.fn().mockResolvedValue(true),
      markAsQualified: jest.fn().mockImplementation(async () => {
        invitation.status = 'qualified';
      }),
      markAsRewarded: jest.fn().mockImplementation(async (amount, transactionId) => {
        invitation.status = 'rewarded';
        invitation.rewardStatus = 'processed';
        invitation.rewardAmount = amount;
        invitation.rewardTransactionId = transactionId;
      })
    };

    ReferralInvitation.findOne.mockResolvedValue(invitation);

    const response = await request(app)
      .post('/api/universal/invitations/invite-1/qualify')
      .set('Authorization', 'Bearer test');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.alreadyRewarded).toBe(false);
    expect(invitation.canQualify).toHaveBeenCalledTimes(1);
    expect(invitation.markAsQualified).toHaveBeenCalledTimes(1);
    expect(invitation.markAsRewarded).toHaveBeenCalledWith(100, 'reward_invite-1');
  });

  it('returns idempotent success when reward already processed', async () => {
    const app = buildApp();
    const invitation = {
      _id: 'invite-2',
      inviterId: 'inviter-1',
      inviteeUserId: 'user-2',
      status: 'rewarded',
      rewardStatus: 'processed',
      rewardAmount: 100,
      rewardCurrency: 'credits',
      rewardTransactionId: 'reward_invite-2',
      canQualify: jest.fn(),
      markAsQualified: jest.fn(),
      markAsRewarded: jest.fn()
    };

    ReferralInvitation.findOne.mockResolvedValue(invitation);

    const response = await request(app)
      .post('/api/universal/invitations/invite-2/qualify')
      .set('Authorization', 'Bearer test');

    expect(response.status).toBe(200);
    expect(response.body.alreadyRewarded).toBe(true);
    expect(invitation.canQualify).not.toHaveBeenCalled();
    expect(invitation.markAsQualified).not.toHaveBeenCalled();
    expect(invitation.markAsRewarded).not.toHaveBeenCalled();
  });

  it('rejects qualification when invitee is not eligible yet', async () => {
    const app = buildApp();
    const invitation = {
      _id: 'invite-3',
      inviterId: 'inviter-1',
      inviteeUserId: 'user-2',
      status: 'registered',
      rewardStatus: 'pending',
      canQualify: jest.fn().mockResolvedValue(false),
      markAsQualified: jest.fn(),
      markAsRewarded: jest.fn()
    };

    ReferralInvitation.findOne.mockResolvedValue(invitation);

    const response = await request(app)
      .post('/api/universal/invitations/invite-3/qualify')
      .set('Authorization', 'Bearer test');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/does not meet qualification criteria/i);
    expect(invitation.markAsQualified).not.toHaveBeenCalled();
    expect(invitation.markAsRewarded).not.toHaveBeenCalled();
  });

  it('rejects qualification for revoked invitations', async () => {
    const app = buildApp();
    const invitation = {
      _id: 'invite-4',
      inviterId: 'inviter-1',
      inviteeUserId: 'user-2',
      status: 'revoked',
      rewardStatus: 'cancelled',
      canQualify: jest.fn(),
      markAsQualified: jest.fn(),
      markAsRewarded: jest.fn()
    };

    ReferralInvitation.findOne.mockResolvedValue(invitation);

    const response = await request(app)
      .post('/api/universal/invitations/invite-4/qualify')
      .set('Authorization', 'Bearer test');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/cannot qualify revoked invitation/i);
    expect(invitation.markAsQualified).not.toHaveBeenCalled();
    expect(invitation.markAsRewarded).not.toHaveBeenCalled();
  });
});
