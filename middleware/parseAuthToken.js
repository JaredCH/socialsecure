'use strict';

const jwt = require('jsonwebtoken');

const DEFAULT_JWT_SECRET = 'your-secret-key-change-in-production';

/** Parse and validate bearer auth tokens for required or optional route authentication. */
const createAuthError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const extractBearerToken = (req) => {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;
  const [scheme, token] = authHeader.split(' ');
  if (!/^Bearer$/i.test(scheme || '') || !token) return null;
  return token;
};

const verifyToken = (token, callback) => {
  jwt.verify(token, process.env.JWT_SECRET || DEFAULT_JWT_SECRET, callback);
};

const parseAuthToken = (mode = 'requireAuth') => (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    if (mode === 'optionalAuth') {
      req.user = null;
      return next();
    }
    return next(createAuthError(401, 'Authentication required', 'AUTH_REQUIRED'));
  }

  return verifyToken(token, (error, decoded) => {
    if (error || !decoded) {
      if (mode === 'optionalAuth') {
        req.user = null;
        return next();
      }
      return next(createAuthError(403, 'Invalid or expired token', 'AUTH_INVALID'));
    }
    req.user = decoded;
    return next();
  });
};

const decodeAuthToken = (req) => {
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || DEFAULT_JWT_SECRET);
    return decoded && typeof decoded === 'object' ? decoded : null;
  } catch {
    return null;
  }
};

const authErrorHandler = (err, _req, res, next) => {
  if (!err || !err.code || !String(err.code).startsWith('AUTH_')) {
    return next(err);
  }

  return res.status(err.status || 401).json({
    error: err.message || 'Authentication failed',
    code: err.code
  });
};

module.exports = {
  parseAuthToken,
  requireAuth: parseAuthToken('requireAuth'),
  optionalAuth: parseAuthToken('optionalAuth'),
  decodeAuthToken,
  extractBearerToken,
  authErrorHandler
};
