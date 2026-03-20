const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { initializeRealtime } = require('./services/realtime');
const { ensureUniversalAdminAccount } = require('./services/universalAdmin');
const { runEventScheduleIngestion } = require('./services/eventScheduleIngestion');
const { reconcileEventRooms } = require('./services/eventRoomLifecycle');
const { runSportsScheduleIngestion } = require('./services/sportsScheduleIngestion');
const { purgeOldArticles } = require('./services/newsArticleCleanup');
const { runtime: jobRuntime } = require('./services/jobRuntime');

const UNIVERSAL_ADMIN_USERNAME = 'ADMIN';
const UNIVERSAL_ADMIN_EMAIL = 'admin@socialsecure.local';
const UNIVERSAL_ADMIN_PASSWORD = process.env.UNIVERSAL_ADMIN_PASSWORD || ['381989', 'Please', '1!'].join('');
const UNIVERSAL_ADMIN_ENCRYPTION_PASSWORD = process.env.UNIVERSAL_ADMIN_ENCRYPTION_PASSWORD || UNIVERSAL_ADMIN_PASSWORD;

const cleanEnv = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.replace(/^['\"]|['\"]$/g, '');
};

const parseIntervalMinutes = (envVar, defaultVal, minVal) =>
  Math.max(parseInt(process.env[envVar] || String(defaultVal), 10) || defaultVal, minVal);

const app = express();
const PORT = process.env.PORT || 5000;
const nodeEnv = cleanEnv(process.env.NODE_ENV || 'development');
const isProduction = nodeEnv === 'production';
const trustProxyHops = Number.parseInt(cleanEnv(process.env.TRUST_PROXY_HOPS) || '1', 10);
const normalizedTrustProxyHops = Number.isInteger(trustProxyHops) && trustProxyHops >= 0
  ? trustProxyHops
  : 1;

const railwayPublicDomain = cleanEnv(process.env.RAILWAY_PUBLIC_DOMAIN);
const defaultOrigins = ['http://localhost:3000'];
if (railwayPublicDomain) {
  defaultOrigins.push(`https://${railwayPublicDomain}`);
  defaultOrigins.push(`http://${railwayPublicDomain}`);
}

const configuredOrigins = (cleanEnv(process.env.CLIENT_URL) || defaultOrigins.join(','))
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const hasHttpClientOrigin = configuredOrigins.some((origin) => origin.startsWith('http://'));
const strictBrowserIsolation = !hasHttpClientOrigin;

const corsOrigin = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }

  const normalizedOrigin = origin.replace(/\/$/, '');
  if (configuredOrigins.includes(normalizedOrigin)) {
    callback(null, true);
    return;
  }

  callback(new Error('Not allowed by CORS'));
};

const registerRoute = (mountPath, loader) => {
  try {
    const route = loader();
    app.use(mountPath, route);
    return true;
  } catch (error) {
    console.error(`Failed to mount route ${mountPath}:`, error);
    return false;
  }
};

// Trust proxy for Railway deployment (handles client IP detection behind proxy)
app.set('trust proxy', normalizedTrustProxyHops);

// Security middleware
const cspDirectives = helmet.contentSecurityPolicy.getDefaultDirectives();
const openStreetMapTileSources = [
  'https://a.tile.openstreetmap.org',
  'https://b.tile.openstreetmap.org',
  'https://c.tile.openstreetmap.org'
];
if (!strictBrowserIsolation) {
  // Helmet merges defaults unless a directive is explicitly set to null.
  cspDirectives['upgrade-insecure-requests'] = null;
}
cspDirectives['img-src'] = [
  ...(cspDirectives['img-src'] || []),
  ...openStreetMapTileSources,
  'https:'
];

app.use(helmet({
  crossOriginOpenerPolicy: strictBrowserIsolation ? { policy: 'same-origin' } : false,
  originAgentCluster: strictBrowserIsolation,
  contentSecurityPolicy: {
    directives: cspDirectives
  }
}));
app.use(cors({
  origin: corsOrigin,
  credentials: true
}));

// Rate limiting - trust proxy is set at app level (line 49)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
  validate: {
    xForwardedForHeader: false
  }
});
app.use('/api/', limiter);

// Prevent all API responses from being stored in any cache (HTTP, SW, proxy).
// This is the primary defence-in-depth measure to stop authenticated user data
// leaking across sessions even if the service-worker cache-exclusion rule is
// somehow bypassed.
app.use('/api/', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Body parsing middleware
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
const mongoUri = cleanEnv(process.env.MONGODB_URI)
  || cleanEnv(process.env.MONGO_URL)
  || cleanEnv(process.env.MONGO_PUBLIC_URL)
  || 'mongodb://localhost:27017/socialmedia';

// Validate production environment configuration (non-fatal; keep service bootable for healthchecks)
if (isProduction) {
  const hasJwtSecret = !!cleanEnv(process.env.JWT_SECRET);
  const hasMongodbUri = !!cleanEnv(process.env.MONGODB_URI);
  const hasMongoUrl = !!cleanEnv(process.env.MONGO_URL);
  const hasMongoPublicUrl = !!cleanEnv(process.env.MONGO_PUBLIC_URL);

  if (!hasJwtSecret) {
    console.warn('WARNING: JWT_SECRET is not set in production. Using fallback secret is insecure.');
  }

  if (!hasMongodbUri && !hasMongoUrl && !hasMongoPublicUrl) {
    console.warn('WARNING: No MongoDB connection variable found in production.');
    console.warn('Accepted variables: MONGODB_URI, MONGO_URL, or MONGO_PUBLIC_URL');
    console.warn('For Railway Mongo, set MONGODB_URI=${{mongodb.MONGO_URL}} or use MONGO_URL directly.');
  }

  if (!cleanEnv(process.env.RAILWAY_PUBLIC_DOMAIN) && !cleanEnv(process.env.CLIENT_URL)) {
    console.warn('WARNING: Neither RAILWAY_PUBLIC_DOMAIN nor CLIENT_URL is set. CORS may not work correctly.');
  }
}

mongoose.connect(mongoUri)
.then(async () => {
  try {
    await ensureUniversalAdminAccount({
      username: UNIVERSAL_ADMIN_USERNAME,
      email: UNIVERSAL_ADMIN_EMAIL,
      password: UNIVERSAL_ADMIN_PASSWORD,
      encryptionPassword: UNIVERSAL_ADMIN_ENCRYPTION_PASSWORD,
      resetUsersOnInvalidOnboarding: true
    });
  } catch (error) {
    console.error('Failed to ensure universal ADMIN account:', error);
  }
})
.catch(err => console.error('MongoDB connection error:', err));

// Basic route
app.get('/health', (req, res) => {
  res.json({ message: 'Social Media API v1.0', status: 'active' });
});

app.get('/', (req, res, next) => {
  if (isProduction) return next();
  return res.json({ message: 'Social Media API v1.0', status: 'active' });
});

// API routes
registerRoute('/api/auth', () => require('./routes/auth'));
registerRoute('/api/users', () => require('./routes/users'));
registerRoute('/api/feed', () => require('./routes/feed'));
registerRoute('/api/gallery', () => require('./routes/gallery'));
registerRoute('/api/public', () => require('./routes/public'));
registerRoute('/api/chat', () => require('./routes/chat'));
registerRoute('/api/market', () => require('./routes/market'));
registerRoute('/api/location', () => require('./routes/location'));
registerRoute('/api/universal', () => require('./routes/universal'));
registerRoute('/api/friends', () => require('./routes/friends'));
registerRoute('/api/circles', () => require('./routes/circles'));
registerRoute('/api/moderation', () => require('./routes/moderation'));
registerRoute('/api/notifications', () => require('./routes/notifications'));
registerRoute('/api/discovery', () => require('./routes/discovery'));
registerRoute('/api/calendar', () => require('./routes/calendar'));
registerRoute('/api/resume', () => require('./routes/resume'));
registerRoute('/api/social-page', () => require('./routes/social-page'));
registerRoute('/api/blog', () => require('./routes/blog'));
registerRoute('/api/admin', () => require('./routes/admin'));
registerRoute('/api/guest', () => require('./routes/guest'));
registerRoute('/api/settings', () => require('./routes/settings'));

app.get(/^\/discover(?:\/.*)?$/, (req, res) => {
  const suffix = req.path.replace(/^\/discover/, '');
  const queryIndex = req.originalUrl.indexOf('?');
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
  return res.redirect(301, `/find-friends${suffix}${query}`);
});

let newsRoutes = null;
let mapsRoutes = null;
try {
  newsRoutes = require('./routes/news');
  app.use('/api/news', newsRoutes.router);
} catch (error) {
  console.error('Failed to mount route /api/news:', error);
}

try {
  mapsRoutes = require('./routes/maps');
  app.use('/api/maps', mapsRoutes.router);
} catch (error) {
  console.error('Failed to mount route /api/maps:', error);
}

// ── Job Runtime: register all scheduled/background jobs ─────────────────
if (process.env.NODE_ENV !== 'test') {
  try {
    // Maps jobs
    if (mapsRoutes) {
      if (typeof mapsRoutes.cleanupJob === 'function') {
        jobRuntime.define('spotlight-cleanup', {
          handler: mapsRoutes.cleanupJob,
          queue: 'maps',
          description: 'Remove expired spotlights',
          schedule: { type: 'interval', intervalMs: 15 * 60 * 1000 },
        });
      }
      if (typeof mapsRoutes.heatmapJob === 'function') {
        jobRuntime.define('heatmap-recompute', {
          handler: mapsRoutes.heatmapJob,
          queue: 'maps',
          description: 'Recompute heatmap aggregation tiles',
          schedule: { type: 'interval', intervalMs: 10 * 60 * 1000 },
        });
      }
    }

    // News ingestion jobs
    if (newsRoutes) {
      const { ingestAllCategories } = require('./services/newsIngestion.categories');
      const { refreshAllCachedLocations } = require('./services/cacheRefreshWorker');
      const { CACHE_TTL_MS } = require('./services/locationCacheService');

      const REFRESH_LEAD_MS = 5 * 60 * 1000;
      const REFRESH_INTERVAL_MS = CACHE_TTL_MS - REFRESH_LEAD_MS;

      jobRuntime.define('news-cache-refresh', {
        handler: () => refreshAllCachedLocations(),
        queue: 'news',
        description: 'Refresh stale location news caches',
        schedule: { type: 'interval', intervalMs: REFRESH_INTERVAL_MS, initialDelayMs: 5000 },
      });

      jobRuntime.define('news-category-ingest', {
        handler: () => ingestAllCategories(),
        queue: 'news',
        description: 'Ingest category RSS feeds',
        schedule: { type: 'interval', intervalMs: 60 * 60 * 1000, initialDelayMs: 10000 },
      });
    }

    // Sports schedule ingestion (3am & 3pm UTC)
    jobRuntime.define('sports-schedule-ingest', {
      handler: () => runSportsScheduleIngestion(),
      queue: 'news',
      description: 'Fetch sports schedules from ESPN',
      schedule: {
        type: 'timeOfDay',
        timesUTC: [{ hour: 3, minute: 0 }, { hour: 15, minute: 0 }],
        fallbackIntervalMs: 60 * 60 * 1000,
      },
    });

    // Event schedule ingestion
    const eventIntervalMinutes = parseIntervalMinutes('EVENT_INGESTION_CHECK_INTERVAL_MINUTES', 15, 5);
    jobRuntime.define('event-schedule-ingest', {
      handler: () => runEventScheduleIngestion(),
      queue: 'events',
      description: 'Poll for new community events',
      schedule: { type: 'interval', intervalMs: eventIntervalMinutes * 60 * 1000 },
    });

    // Event room lifecycle reconciliation
    const roomIntervalMinutes = parseIntervalMinutes('EVENT_ROOM_LIFECYCLE_INTERVAL_MINUTES', 15, 5);
    jobRuntime.define('event-room-lifecycle', {
      handler: () => reconcileEventRooms(),
      queue: 'events',
      description: 'Reconcile event chat rooms',
      schedule: { type: 'interval', intervalMs: roomIntervalMinutes * 60 * 1000 },
    });

    // Article cleanup (daily)
    jobRuntime.define('article-cleanup', {
      handler: () => purgeOldArticles(),
      queue: 'maintenance',
      description: 'Purge old articles and ingestion records',
      schedule: { type: 'interval', intervalMs: 24 * 60 * 60 * 1000, initialDelayMs: 30000 },
    });

    // Start all registered jobs
    jobRuntime.startAll();
  } catch (error) {
    console.error('Failed to register/start job runtime:', error);
  }
}

const frontendBuildPath = path.join(__dirname, 'frontend', 'build');
const frontendIndexPath = path.join(frontendBuildPath, 'index.html');
const hasFrontendBuild = fs.existsSync(frontendIndexPath);
const isAssetRequestPath = (requestPath = '') => Boolean(path.extname(requestPath || ''));

if (isProduction || hasFrontendBuild) {
  app.use(express.static(frontendBuildPath));

  app.get(/^\/(?!api|health).*/, (req, res, next) => {
    if (!hasFrontendBuild) return next();
    if (isAssetRequestPath(req.path)) return next();
    return res.sendFile(frontendIndexPath);
  });
} else {
  app.get('/', (req, res) => {
    res.json({ message: 'Social Media API v1.0', status: 'active' });
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      ...(nodeEnv === 'development' && { stack: err.stack })
    }
  });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((req, res) => {
  if ((isProduction || hasFrontendBuild) && req.method === 'GET' && !isAssetRequestPath(req.path)) {
    return res.sendFile(frontendIndexPath);
  }
  return res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// Socket.io setup
const io = require('socket.io')(server, {
  cors: {
    origin: configuredOrigins,
    methods: ['GET', 'POST']
  }
});

const { setNotificationIo } = require('./services/notifications');
setNotificationIo(io);

initializeRealtime(io);

module.exports = { app, server, jobRuntime };
