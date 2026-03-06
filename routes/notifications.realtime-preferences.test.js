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

const mockNotification = {};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/Session', () => mockSession);
jest.mock('../models/Notification', () => mockNotification);

const jwt = require('jsonwebtoken');
const notificationsRouter = require('./notifications');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationsRouter);
  return app;
};

const mockAuthenticatedUser = (overrides = {}) => {
  jwt.verify.mockReturnValue({ userId: 'user-1' });
  mockSession.findOne.mockResolvedValue({
    _id: 'session-1',
    lastActivity: null,
    save: jest.fn().mockResolvedValue(true)
  });

  const user = {
    _id: 'user-1',
    notificationPreferences: {
      likes: { inApp: true, email: false, push: false },
      comments: { inApp: true, email: true, push: false },
      mentions: { inApp: true, email: true, push: false },
      follows: { inApp: true, email: false, push: false },
      messages: { inApp: true, email: false, push: false },
      system: { inApp: true, email: true, push: false },
      securityAlerts: { inApp: true, email: true, push: false }
    },
    realtimePreferences: {
      enabled: true,
      showPresence: true,
      showLastSeen: true
    },
    unreadNotificationCount: 0,
    ...overrides
  };

  mockUser.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue(user)
  });
};

describe('Notification realtime preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticatedUser();
    mockUser.updateOne.mockResolvedValue({ acknowledged: true });
  });

  it('returns realtime preferences alongside notification preferences', async () => {
    const app = buildApp();

    const response = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.preferences).toBeDefined();
    expect(response.body.realtimePreferences).toEqual({
      enabled: true,
      showPresence: true,
      showLastSeen: true
    });
  });

  it('persists realtime preferences updates', async () => {
    const app = buildApp();

    const response = await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', 'Bearer token')
      .send({
        likes: { inApp: false },
        realtime: {
          enabled: false,
          showPresence: false,
          showLastSeen: false
        }
      });

    expect(response.status).toBe(200);
    expect(mockUser.updateOne).toHaveBeenCalledWith(
      { _id: 'user-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          realtimePreferences: {
            enabled: false,
            showPresence: false,
            showLastSeen: false
          }
        })
      })
    );
    expect(response.body.realtimePreferences).toEqual({
      enabled: false,
      showPresence: false,
      showLastSeen: false
    });
  });
});
