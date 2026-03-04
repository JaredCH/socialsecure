const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const cleanEnv = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.replace(/^['\"]|['\"]$/g, '');
};

const app = express();
const PORT = process.env.PORT || 5000;
const nodeEnv = cleanEnv(process.env.NODE_ENV || 'development');
const isProduction = nodeEnv === 'production';

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

// Security middleware
app.use(helmet());
app.use(cors({
  origin: corsOrigin,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
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
console.log(`Mongo source: ${cleanEnv(process.env.MONGODB_URI) ? 'MONGODB_URI' : cleanEnv(process.env.MONGO_URL) ? 'MONGO_URL' : cleanEnv(process.env.MONGO_PUBLIC_URL) ? 'MONGO_PUBLIC_URL' : 'local-default'}`);

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
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
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/feed', require('./routes/feed'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/public', require('./routes/public'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/market', require('./routes/market'));
app.use('/api/location', require('./routes/location'));
app.use('/api/universal', require('./routes/universal'));
app.use('/api/friends', require('./routes/friends'));

if (isProduction) {
  const frontendBuildPath = path.join(__dirname, 'frontend', 'build');
  app.use(express.static(frontendBuildPath));

  app.get(/^\/(?!api|health).*/, (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
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
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Socket.io setup
const io = require('socket.io')(server, {
  cors: {
    origin: configuredOrigins,
    methods: ['GET', 'POST']
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });
  
  socket.on('send-message', (data) => {
    io.to(data.roomId).emit('new-message', data);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

module.exports = { app, server };
