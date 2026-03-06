let ioInstance = null;

const MAX_EVENT_REPLAY = 50;
const userSockets = new Map();
const userPresence = new Map();
const userEventBuffer = new Map();

const normalizeUserId = (userId) => String(userId || '').trim();

const setRealtimeIo = (io) => {
  ioInstance = io;
};

const getRealtimeIo = () => ioInstance;

const attachUserSocket = (userId, socketId) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedSocketId = String(socketId || '').trim();
  if (!normalizedUserId || !normalizedSocketId) return;
  const socketIds = userSockets.get(normalizedUserId) || new Set();
  socketIds.add(normalizedSocketId);
  userSockets.set(normalizedUserId, socketIds);
};

const detachUserSocket = (userId, socketId) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedSocketId = String(socketId || '').trim();
  if (!normalizedUserId || !normalizedSocketId) return;
  const socketIds = userSockets.get(normalizedUserId);
  if (!socketIds) return;
  socketIds.delete(normalizedSocketId);
  if (socketIds.size === 0) {
    userSockets.delete(normalizedUserId);
  } else {
    userSockets.set(normalizedUserId, socketIds);
  }
};

const isUserOnline = (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;
  const socketIds = userSockets.get(normalizedUserId);
  return Boolean(socketIds && socketIds.size > 0);
};

const setPresence = (userId, presence) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;
  const nowIso = new Date().toISOString();
  const current = userPresence.get(normalizedUserId) || { status: 'offline', lastSeen: nowIso };
  userPresence.set(normalizedUserId, {
    status: presence?.status || current.status || 'offline',
    lastSeen: presence?.lastSeen || current.lastSeen || nowIso,
    lastActivity: presence?.lastActivity || nowIso
  });
};

const getPresence = (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;
  return userPresence.get(normalizedUserId) || null;
};

const recordUserEvent = (userId, event) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId || !event) return;
  const existing = userEventBuffer.get(normalizedUserId) || [];
  const next = [...existing, event];
  if (next.length > MAX_EVENT_REPLAY) {
    next.splice(0, next.length - MAX_EVENT_REPLAY);
  }
  userEventBuffer.set(normalizedUserId, next);
};

const emitToUsers = (userIds, eventName, payload, options = {}) => {
  if (!ioInstance || !eventName || !Array.isArray(userIds)) return;
  const shouldRecord = options.record !== false;
  const uniqueUserIds = [...new Set(userIds.map(normalizeUserId).filter(Boolean))];
  const eventEnvelope = {
    eventName,
    payload,
    ts: Date.now()
  };

  for (const userId of uniqueUserIds) {
    ioInstance.to(`user:${userId}`).emit(eventName, payload);
    if (shouldRecord) {
      recordUserEvent(userId, eventEnvelope);
    }
  }
};

const emitToRoom = (roomName, eventName, payload) => {
  if (!ioInstance || !roomName || !eventName) return;
  ioInstance.to(roomName).emit(eventName, payload);
};

const getMissedEvents = (userId, sinceTs) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return [];
  const events = userEventBuffer.get(normalizedUserId) || [];
  const since = Number.parseInt(sinceTs, 10);
  if (!Number.isFinite(since) || since <= 0) {
    return events.slice(-MAX_EVENT_REPLAY);
  }
  return events.filter((event) => Number(event?.ts || 0) > since).slice(-MAX_EVENT_REPLAY);
};

module.exports = {
  setRealtimeIo,
  getRealtimeIo,
  attachUserSocket,
  detachUserSocket,
  isUserOnline,
  setPresence,
  getPresence,
  emitToUsers,
  emitToRoom,
  getMissedEvents
};
