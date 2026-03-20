const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockUser = {
  findById: jest.fn(),
  updateOne: jest.fn()
};

const mockSession = {
  findOne: jest.fn()
};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/Session', () => mockSession);

const jwt = require('jsonwebtoken');
const settingsRouter = require('./settings');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRouter);
  return app;
};

const buildMockUser = (overrides = {}) => ({
  _id: 'user-1',
  notificationPreferences: {
    likes: { inApp: true, email: false, push: false }
  },
  realtimePreferences: {
    enabled: true,
    showPresence: true,
    showLastSeen: true
  },
  securityPreferences: {
    loginNotifications: true,
    sessionTimeout: 60,
    requirePasswordForSensitive: true
  },
  profileFieldVisibility: {
    firstName: 'public',
    lastName: 'public',
    streetAddress: 'social',
    phone: 'social',
    email: 'social',
    worksAt: 'social',
    hobbies: 'social',
    ageGroup: 'social',
    sex: 'social',
    race: 'social'
  },
  friendListPrivacy: 'friends',
  topFriendsPrivacy: 'public',
  profileTheme: 'default',
  stripImageMetadataOnUpload: false,
  enableMaturityWordCensor: true,
  ...overrides
});

const mockAuthenticatedUser = (overrides = {}) => {
  jwt.verify.mockReturnValue({ userId: 'user-1' });
  mockSession.findOne.mockResolvedValue({
    _id: 'session-1',
    lastActivity: null,
    save: jest.fn().mockResolvedValue(true)
  });

  const user = buildMockUser(overrides);

  mockUser.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue(user)
  });
};

describe('Settings route – unified preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticatedUser();
    mockUser.updateOne.mockResolvedValue({ acknowledged: true });
  });

  // ── GET /api/settings/preferences ──────────────────────────────────

  describe('GET /api/settings/preferences', () => {
    it('returns all preference domains with version', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/settings/preferences')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body._version).toBe(1);
      expect(res.body).toHaveProperty('notifications');
      expect(res.body).toHaveProperty('realtime');
      expect(res.body).toHaveProperty('security');
      expect(res.body).toHaveProperty('privacy');
      expect(res.body).toHaveProperty('ui');
    });

    it('normalizes notification preferences', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/settings/preferences')
        .set('Authorization', 'Bearer token');

      // likes was provided partially; should have been normalized
      expect(res.body.notifications.likes).toEqual({
        inApp: true, email: false, push: false
      });
      // comments was not provided; should be default
      expect(res.body.notifications.comments).toEqual({
        inApp: true, email: true, push: false
      });
    });

    it('returns 401 when no token is provided', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/settings/preferences');
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/settings/defaults ─────────────────────────────────────

  describe('GET /api/settings/defaults', () => {
    it('returns defaults without authentication', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/settings/defaults');

      expect(res.status).toBe(200);
      expect(res.body._version).toBe(1);
      expect(res.body.notifications).toBeDefined();
      expect(res.body.realtime).toBeDefined();
      expect(res.body.security).toBeDefined();
      expect(res.body.privacy).toBeDefined();
      expect(res.body.ui).toBeDefined();
    });
  });

  // ── PUT /api/settings/preferences ──────────────────────────────────

  describe('PUT /api/settings/preferences', () => {
    it('updates notification preferences', async () => {
      const app = buildApp();
      const res = await request(app)
        .put('/api/settings/preferences')
        .set('Authorization', 'Bearer token')
        .send({
          notifications: {
            likes: { inApp: false, email: true, push: false }
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUser.updateOne).toHaveBeenCalledWith(
        { _id: 'user-1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            notificationPreferences: expect.objectContaining({
              likes: { inApp: false, email: true, push: false }
            })
          })
        })
      );
    });

    it('updates realtime preferences', async () => {
      const app = buildApp();
      const res = await request(app)
        .put('/api/settings/preferences')
        .set('Authorization', 'Bearer token')
        .send({
          realtime: { enabled: false, showPresence: false, showLastSeen: false }
        });

      expect(res.status).toBe(200);
      expect(mockUser.updateOne).toHaveBeenCalledWith(
        { _id: 'user-1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            realtimePreferences: { enabled: false, showPresence: false, showLastSeen: false }
          })
        })
      );
    });

    it('updates security preferences', async () => {
      const app = buildApp();
      const res = await request(app)
        .put('/api/settings/preferences')
        .set('Authorization', 'Bearer token')
        .send({
          security: { sessionTimeout: 120 }
        });

      expect(res.status).toBe(200);
      expect(mockUser.updateOne).toHaveBeenCalledWith(
        { _id: 'user-1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            securityPreferences: expect.objectContaining({ sessionTimeout: 120 })
          })
        })
      );
    });

    it('updates UI preferences', async () => {
      const app = buildApp();
      const res = await request(app)
        .put('/api/settings/preferences')
        .set('Authorization', 'Bearer token')
        .send({
          ui: { profileTheme: 'dark' }
        });

      expect(res.status).toBe(200);
      expect(mockUser.updateOne).toHaveBeenCalledWith(
        { _id: 'user-1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            profileTheme: 'dark'
          })
        })
      );
    });

    it('rejects requests with no valid domains', async () => {
      const app = buildApp();
      const res = await request(app)
        .put('/api/settings/preferences')
        .set('Authorization', 'Bearer token')
        .send({ foo: 'bar' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/At least one preference domain/);
    });

    it('rejects non-object body', async () => {
      const app = buildApp();
      const res = await request(app)
        .put('/api/settings/preferences')
        .set('Authorization', 'Bearer token')
        .send('not-json');

      expect(res.status).toBe(400);
    });

    it('can update multiple domains at once', async () => {
      const app = buildApp();
      const res = await request(app)
        .put('/api/settings/preferences')
        .set('Authorization', 'Bearer token')
        .send({
          realtime: { enabled: false },
          security: { loginNotifications: false },
          ui: { profileTheme: 'forest' }
        });

      expect(res.status).toBe(200);
      const setArg = mockUser.updateOne.mock.calls[0][1].$set;
      expect(setArg.realtimePreferences).toBeDefined();
      expect(setArg.securityPreferences).toBeDefined();
      expect(setArg.profileTheme).toBe('forest');
    });
  });
});
