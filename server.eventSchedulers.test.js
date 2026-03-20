describe('server event scheduler startup', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('registers and starts all jobs via job runtime outside test environment', () => {
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

      // Mock job runtime to track define/startAll calls
      const mockDefine = jest.fn();
      const mockStartAll = jest.fn();
      const mockRuntime = { define: mockDefine, startAll: mockStartAll, jobs: new Map() };

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
      jest.doMock('./services/eventScheduleIngestion', () => ({ runEventScheduleIngestion: jest.fn() }));
      jest.doMock('./services/eventRoomLifecycle', () => ({ reconcileEventRooms: jest.fn() }));
      jest.doMock('./services/sportsScheduleIngestion', () => ({ runSportsScheduleIngestion: jest.fn() }));
      jest.doMock('./services/newsArticleCleanup', () => ({ purgeOldArticles: jest.fn() }));
      jest.doMock('./services/jobRuntime', () => ({ JobRuntime: jest.fn(), runtime: mockRuntime }));
      jest.doMock('./services/newsIngestion.categories', () => ({ ingestAllCategories: jest.fn() }));
      jest.doMock('./services/cacheRefreshWorker', () => ({ refreshAllCachedLocations: jest.fn(), REFRESH_INTERVAL_MS: 3300000, getCacheSchedulerState: jest.fn() }));
      jest.doMock('./services/locationCacheService', () => ({ CACHE_TTL_MS: 3600000, getArticlesForLocation: jest.fn(), getCacheMetrics: jest.fn(), searchCachedArticles: jest.fn() }));
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
        startScheduledJobs: jest.fn(),
        cleanupJob: jest.fn(),
        heatmapJob: jest.fn()
      }));

      require('./server');

      // All 8 jobs should be registered
      const definedNames = mockDefine.mock.calls.map(c => c[0]);
      expect(definedNames).toContain('spotlight-cleanup');
      expect(definedNames).toContain('heatmap-recompute');
      expect(definedNames).toContain('news-cache-refresh');
      expect(definedNames).toContain('news-category-ingest');
      expect(definedNames).toContain('sports-schedule-ingest');
      expect(definedNames).toContain('event-schedule-ingest');
      expect(definedNames).toContain('event-room-lifecycle');
      expect(definedNames).toContain('article-cleanup');

      // startAll should have been called once
      expect(mockStartAll).toHaveBeenCalledTimes(1);
    });
  });

  test('does NOT start jobs in test environment', () => {
    process.env.NODE_ENV = 'test';

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

      const mockDefine = jest.fn();
      const mockStartAll = jest.fn();
      const mockRuntime = { define: mockDefine, startAll: mockStartAll, jobs: new Map() };

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
      jest.doMock('./services/eventScheduleIngestion', () => ({ runEventScheduleIngestion: jest.fn() }));
      jest.doMock('./services/eventRoomLifecycle', () => ({ reconcileEventRooms: jest.fn() }));
      jest.doMock('./services/sportsScheduleIngestion', () => ({ runSportsScheduleIngestion: jest.fn() }));
      jest.doMock('./services/newsArticleCleanup', () => ({ purgeOldArticles: jest.fn() }));
      jest.doMock('./services/jobRuntime', () => ({ JobRuntime: jest.fn(), runtime: mockRuntime }));
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
        startScheduledJobs: jest.fn(),
        cleanupJob: jest.fn(),
        heatmapJob: jest.fn()
      }));

      require('./server');

      // No jobs should be registered in test environment
      expect(mockDefine).not.toHaveBeenCalled();
      expect(mockStartAll).not.toHaveBeenCalled();
    });
  });
});
