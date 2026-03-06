const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({ userId: 'admin-user-id' }))
}));

const adminAuthUser = { _id: 'admin-user-id', isAdmin: true, moderationStatus: 'active' };
let targetUser;

const mockUserFindById = jest.fn();
const mockUserCountDocuments = jest.fn().mockResolvedValue(0);
const mockUserFind = jest.fn(() => ({
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([])
}));

jest.mock('../models/User', () => ({
  findById: (...args) => mockUserFindById(...args),
  countDocuments: (...args) => mockUserCountDocuments(...args),
  find: (...args) => mockUserFind(...args),
  findByIdAndDelete: jest.fn().mockResolvedValue(null)
}));

const mockEmptyQueryResult = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([])
};

jest.mock('../models/Post', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  find: jest.fn(() => ({ ...mockEmptyQueryResult })),
  findByIdAndDelete: jest.fn().mockResolvedValue(null),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/ChatMessage', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  find: jest.fn(() => ({ ...mockEmptyQueryResult })),
  findByIdAndDelete: jest.fn().mockResolvedValue(null),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/ConversationMessage', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  find: jest.fn(() => ({ ...mockEmptyQueryResult })),
  findByIdAndDelete: jest.fn().mockResolvedValue(null),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/Report', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/BlockList', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/MuteList', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/ChatRoom', () => ({
  countDocuments: jest.fn().mockResolvedValue(0)
}));

jest.mock('../models/ChatConversation', () => ({
  countDocuments: jest.fn().mockResolvedValue(0)
}));

const moderationRouter = require('./moderation');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/moderation', moderationRouter);
  return app;
};

describe('Moderation control panel admin actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    targetUser = {
      _id: 'target-user-id',
      username: 'member',
      passwordHash: 'old-hash',
      mustResetPassword: false,
      mutedUntil: null,
      muteReason: '',
      moderationStatus: 'active',
      moderationHistory: [],
      save: jest.fn().mockResolvedValue(true)
    };

    mockUserFindById.mockImplementation((id) => {
      if (id === 'admin-user-id') {
        return {
          select: jest.fn().mockResolvedValue(adminAuthUser)
        };
      }
      if (id === 'target-user-id') {
        return Promise.resolve(targetUser);
      }
      return Promise.resolve(null);
    });
  });

  it('resets password with random 8-digit temporary password and flags one-time reset', async () => {
    const app = buildApp();
    const response = await request(app)
      .post('/api/moderation/control-panel/users/target-user-id/reset-password')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.temporaryPassword).toMatch(/^\d{8}$/);
    expect(targetUser.mustResetPassword).toBe(true);
    expect(typeof targetUser.passwordHash).toBe('string');
    expect(targetUser.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(targetUser.moderationHistory).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'password_reset' })])
    );
    expect(targetUser.save).toHaveBeenCalled();
  });

  it('applies mute duration and appends mute history entry', async () => {
    const app = buildApp();
    const response = await request(app)
      .post('/api/moderation/control-panel/users/target-user-id/mute')
      .set('Authorization', 'Bearer token')
      .send({ durationKey: '48h', reason: 'cooldown' });

    expect(response.status).toBe(200);
    expect(targetUser.moderationStatus).toBe('suspended');
    expect(targetUser.muteReason).toBe('cooldown');
    expect(targetUser.mutedUntil).toBeTruthy();
    expect(targetUser.moderationHistory).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'mute' })])
    );
    expect(targetUser.save).toHaveBeenCalled();
  });

  it('prevents deleting own admin account', async () => {
    const app = buildApp();
    const response = await request(app)
      .delete('/api/moderation/control-panel/users/admin-user-id')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/cannot delete their own account/i);
  });
});
