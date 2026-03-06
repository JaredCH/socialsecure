const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('./models/User');
const Friendship = require('./models/Friendship');
const { initializeRealtime } = require('./services/realtime');
const { ensureUniversalAdminAccount } = require('./services/universalAdmin');

const TYPING_THROTTLE_MS = 1000;
const SOCKET_JWT_SECRET = process.env.JWT_SECRET || '';
const MAX_FEED_SUBSCRIPTIONS = 200;
const UNIVERSAL_ADMIN_USERNAME = 'ADMIN';
const UNIVERSAL_ADMIN_EMAIL = 'admin@socialsecure.local';
const UNIVERSAL_ADMIN_PASSWORD = process.env.UNIVERSAL_ADMIN_PASSWORD || ['381989', 'Please', '1!'].join('');
const UNIVERSAL_ADMIN_ENCRYPTION_PASSWORD = process.env.UNIVERSAL_ADMIN_ENCRYPTION_PASSWORD || UNIVERSAL_ADMIN_PASSWORD;

const cleanEnv = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.replace(/^['\"]|['\"]$/g, '');
};

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
    console.log(`Route mounted: ${mountPath}`);
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
cspDirectives['img-src'] = [
  ...(cspDirectives['img-src'] || []),
  ...openStreetMapTileSources
];

app.use(helmet({
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

console.log(`Environment: ${nodeEnv}`);
console.log(`Allowed CORS origins: ${configuredOrigins.join(', ')}`);
console.log(`Trust proxy hops: ${normalizedTrustProxyHops}`);
console.log(`Mongo source: ${cleanEnv(process.env.MONGODB_URI) ? 'MONGODB_URI' : cleanEnv(process.env.MONGO_URL) ? 'MONGO_URL' : cleanEnv(process.env.MONGO_PUBLIC_URL) ? 'MONGO_PUBLIC_URL' : 'local-default'}`);

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
  } else {
    console.log('Production environment variables detected.');
  }

  if (!cleanEnv(process.env.RAILWAY_PUBLIC_DOMAIN) && !cleanEnv(process.env.CLIENT_URL)) {
    console.warn('WARNING: Neither RAILWAY_PUBLIC_DOMAIN nor CLIENT_URL is set. CORS may not work correctly.');
  }
}

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('MongoDB connected successfully');
  try {
    await ensureUniversalAdminAccount({
      username: UNIVERSAL_ADMIN_USERNAME,
      email: UNIVERSAL_ADMIN_EMAIL,
      password: UNIVERSAL_ADMIN_PASSWORD,
      encryptionPassword: UNIVERSAL_ADMIN_ENCRYPTION_PASSWORD
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

let newsRoutes = null;
let mapsRoutes = null;
try {
  newsRoutes = require('./routes/news');
  app.use('/api/news', newsRoutes.router);
  console.log('Route mounted: /api/news');
} catch (error) {
  console.error('Failed to mount route /api/news:', error);
}

try {
  mapsRoutes = require('./routes/maps');
  app.use('/api/maps', mapsRoutes.router);
  console.log('Route mounted: /api/maps');
} catch (error) {
  console.error('Failed to mount route /api/maps:', error);
}

// Start news ingestion scheduler
if (process.env.NODE_ENV !== 'test') {
  try {
    if (newsRoutes && typeof newsRoutes.startIngestionScheduler === 'function') {
      newsRoutes.startIngestionScheduler();
    }
  } catch (error) {
    console.error('Failed to start news ingestion scheduler:', error);
  }
}

// Start maps scheduled jobs
if (process.env.NODE_ENV !== 'test') {
  try {
    if (mapsRoutes && typeof mapsRoutes.startScheduledJobs === 'function') {
      mapsRoutes.startScheduledJobs();
    }
  } catch (error) {
    console.error('Failed to start maps scheduled jobs:', error);
  }
}

const frontendBuildPath = path.join(__dirname, 'frontend', 'build');
const frontendIndexPath = path.join(frontendBuildPath, 'index.html');
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

if (isProduction || hasFrontendBuild) {
  app.use(express.static(frontendBuildPath));

  app.get(/^\/(?!api|health).*/, (req, res, next) => {
    if (!hasFrontendBuild) return next();
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
  if ((isProduction || hasFrontendBuild) && req.method === 'GET') {
    return res.sendFile(frontendIndexPath);
  }
  return res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
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

const getFriendIds = async (userId) => {
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }]
  }).select('requester recipient').lean();

  const ids = new Set();
  for (const friendship of friendships) {
    const requester = String(friendship.requester);
    const recipient = String(friendship.recipient);
    ids.add(requester === String(userId) ? recipient : requester);
  }
  return [...ids];
};

initializeRealtime(io);

if (process.env.NODE_ENV !== 'test') {
  try {
    startEventScheduleIngestionScheduler();
    startEventRoomLifecycleScheduler();
  } catch (error) {
    console.error('Failed to start event schedulers:', error);
  }
}

module.exports = { app, server };
