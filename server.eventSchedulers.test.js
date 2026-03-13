describe('server event scheduler startup', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('starts event schedulers outside test environment', () => {
    process.env.NODE_ENV = 'production';

    jest.isolateModules(() => {
      const app = {
        set: jest.fn(),
        use: jest.fn(),
        get: jest.fn(),
        listen: jest.fn((port, host, callback) => {
          if (typeof callback === 'function') callback();
          return { close: jest.fn() };
        })
      };
      const noopMiddleware = () => (req, res, next) => next();
      const express = jest.fn(() => app);
      express.static = jest.fn(() => (req, res, next) => next());
      express.json = jest.fn(noopMiddleware);
      express.urlencoded = jest.fn(noopMiddleware);
      const startEventScheduleIngestionScheduler = jest.fn();
      const startEventRoomLifecycleScheduler = jest.fn();
      const startSportsScheduleScheduler = jest.fn();

      jest.doMock('express', () => express);
      jest.doMock('mongoose', () => ({ connect: jest.fn().mockResolvedValue(undefined) }));
      jest.doMock('cors', () => jest.fn(noopMiddleware));
      jest.doMock('helmet', () => {
        const helmet = jest.fn(noopMiddleware);
        helmet.contentSecurityPolicy = {
          getDefaultDirectives: () => ({})
        };
        return helmet;
      });
      jest.doMock('express-rate-limit', () => jest.fn(noopMiddleware));
      jest.doMock('cookie-parser', () => jest.fn(noopMiddleware));
      jest.doMock('dotenv', () => ({ config: jest.fn() }));
      jest.doMock('socket.io', () => jest.fn(() => ({})));
      jest.doMock('fs', () => ({ existsSync: jest.fn(() => false) }));
      jest.doMock('./services/realtime', () => ({ initializeRealtime: jest.fn() }));
      jest.doMock('./services/universalAdmin', () => ({ ensureUniversalAdminAccount: jest.fn().mockResolvedValue(undefined) }));
      jest.doMock('./services/notifications', () => ({ setNotificationIo: jest.fn() }));
      jest.doMock('./services/eventScheduleIngestion', () => ({ startEventScheduleIngestionScheduler }));
      jest.doMock('./services/eventRoomLifecycle', () => ({ startEventRoomLifecycleScheduler }));
      jest.doMock('./services/sportsScheduleIngestion', () => ({ startSportsScheduleScheduler }));
      jest.doMock('./models/User', () => ({}));
      jest.doMock('./models/Friendship', () => ({ find: jest.fn() }));

      const routePaths = [
        './routes/auth',
        './routes/users',
        './routes/feed',
        './routes/gallery',
        './routes/public',
        './routes/chat',
        './routes/market',
        './routes/location',
        './routes/universal',
        './routes/friends',
        './routes/circles',
        './routes/moderation',
        './routes/notifications',
        './routes/discovery',
        './routes/calendar',
        './routes/resume',
        './routes/social-page'
      ];
      for (const routePath of routePaths) {
        jest.doMock(routePath, () => (req, res, next) => next());
      }
      jest.doMock('./routes/news', () => ({
        router: (req, res, next) => next(),
        startIngestionScheduler: jest.fn()
      }));
      jest.doMock('./routes/maps', () => ({
        router: (req, res, next) => next(),
        startScheduledJobs: jest.fn()
      }));

      require('./server');

      expect(startEventScheduleIngestionScheduler).toHaveBeenCalledTimes(1);
      expect(startEventRoomLifecycleScheduler).toHaveBeenCalledTimes(1);
      expect(startSportsScheduleScheduler).toHaveBeenCalledTimes(1);
    });
  });
});
