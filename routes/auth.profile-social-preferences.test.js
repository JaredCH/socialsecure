const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn()
}));

const mockUserModel = { findById: jest.fn() };
jest.mock('../models/User', () => mockUserModel);
jest.mock('../models/SecurityEvent', () => ({ create: jest.fn() }));

const jwt = require('jsonwebtoken');
const authRouter = require('./auth');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
};

const buildUserDoc = () => {
  const user = {
    _id: 'user-1',
    realName: 'Test User',
    profileTheme: 'default',
    socialPagePreferences: {},
    save: jest.fn().mockResolvedValue(true),
    toPublicProfile: jest.fn(function toPublicProfile() {
      return {
        _id: this._id,
        realName: this.realName,
        profileTheme: this.profileTheme,
        socialPagePreferences: this.socialPagePreferences
      };
    })
  };
  return user;
};

describe('Auth social page preferences profile updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockReturnValue({ userId: 'user-1' });
  });

  it('saves valid social page preferences', async () => {
    const app = buildApp();
    const user = buildUserDoc();
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        socialPagePreferences: {
          themePreset: 'dark',
          accentColorToken: 'amber',
          sectionOrder: ['header', 'timeline', 'gallery', 'shortcuts'],
          hiddenSections: ['composer'],
          hiddenModules: ['referShortcut']
        }
      });

    expect(response.status).toBe(200);
    expect(user.save).toHaveBeenCalled();
    expect(user.socialPagePreferences.themePreset).toBe('dark');
    expect(user.socialPagePreferences.accentColorToken).toBe('amber');
    expect(user.socialPagePreferences.hiddenSections).toContain('composer');
    expect(user.socialPagePreferences.effective.visibleSections).toContain('timeline');
  });

  it('rejects unknown section ids', async () => {
    const app = buildApp();
    const user = buildUserDoc();
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        socialPagePreferences: {
          sectionOrder: ['header', 'timeline', 'unknown-section']
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.errors?.[0]?.msg).toMatch(/unknown section id/i);
    expect(user.save).not.toHaveBeenCalled();
  });

  it('rejects inaccessible theme and accent combinations', async () => {
    const app = buildApp();
    const user = buildUserDoc();
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        socialPagePreferences: {
          themePreset: 'light',
          accentColorToken: 'amber'
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.errors?.[0]?.msg).toMatch(/not allowed/i);
    expect(user.save).not.toHaveBeenCalled();
  });

  it('rejects requests that hide every primary section', async () => {
    const app = buildApp();
    const user = buildUserDoc();
    mockUserModel.findById.mockResolvedValue(user);

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', 'Bearer token')
      .send({
        socialPagePreferences: {
          hiddenSections: ['timeline', 'gallery']
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.errors?.[0]?.msg).toMatch(/primary section/i);
    expect(user.save).not.toHaveBeenCalled();
  });
});
