'use strict';

const getClientIp = (req) => {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req?.ip || req?.socket?.remoteAddress || 'unknown';
};

const logEvent = ({ eventType, userId = null, metadata = {}, req }) => {
  const payload = {
    eventType,
    userId: userId ? String(userId) : null,
    metadata,
    ipAddress: getClientIp(req),
    userAgent: req?.get?.('user-agent') || req?.headers?.['user-agent'] || null,
    createdAt: new Date().toISOString()
  };

  console.log('[event]', JSON.stringify(payload));
  return payload;
};

module.exports = {
  logEvent
};
