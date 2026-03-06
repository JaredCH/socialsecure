const jwt = require('jsonwebtoken');
const Friendship = require('../models/Friendship');
const Presence = require('../models/Presence');
const User = require('../models/User');
const { normalizeRealtimePreferences } = require('../utils/realtimePreferences');

const MAX_REPLAY_EVENTS = 50;
const TYPING_RATE_LIMIT_MS = 800;

let ioInstance = null;
let eventCounter = 0;

const userSocketIds = new Map();
const replayBufferByUser = new Map();
const typingStateBySocket = new Map();

const toEventId = () => `${Date.now()}-${++eventCounter}`;

const withMeta = (payload = {}) => ({
  ...payload,
  _meta: {
    eventId: toEventId(),
    timestamp: new Date().toISOString()
  }
});

const storeReplayEvent = (userId, event, payload) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return payload;

  const enrichedPayload = withMeta(payload);
  const current = replayBufferByUser.get(normalizedUserId) || [];
  current.push({ event, payload: enrichedPayload });
  if (current.length > MAX_REPLAY_EVENTS) {
    current.splice(0, current.length - MAX_REPLAY_EVENTS);
  }
  replayBufferByUser.set(normalizedUserId, current);
  return enrichedPayload;
};

const emitToUser = (userId, event, payload, options = {}) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || !ioInstance) return null;

  const shouldStore = options.store !== false;
  const finalPayload = shouldStore ? storeReplayEvent(normalizedUserId, event, payload) : withMeta(payload);
  ioInstance.to(`user:${normalizedUserId}`).emit(event, finalPayload);
  return finalPayload;
};

const emitToUsers = (userIds, event, payloadFactory, options = {}) => {
  const uniqueIds = [...new Set((Array.isArray(userIds) ? userIds : []).map((value) => String(value || '').trim()).filter(Boolean))];
  for (const userId of uniqueIds) {
    const payload = typeof payloadFactory === 'function' ? payloadFactory(userId) : payloadFactory;
    emitToUser(userId, event, payload, options);
  }
};

const emitToSocketRoom = (roomName, event, payload) => {
  if (!ioInstance || !roomName) return;
  ioInstance.to(roomName).emit(event, withMeta(payload));
};

const getFriendIds = async (userId) => {
  if (!userId) return [];

  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [
      { requester: userId },
      { recipient: userId }
    ]
  }).select('requester recipient').lean();

  const ids = new Set();
  for (const friendship of friendships) {
    const requester = String(friendship.requester);
    const recipient = String(friendship.recipient);
    ids.add(requester === String(userId) ? recipient : requester);
  }
  return [...ids];
};

const buildPresencePayload = (userId, presence, preferencesInput = {}) => {
  const preferences = normalizeRealtimePreferences(preferencesInput);
  if (!preferences.showPresence) {
    return {
      userId: String(userId),
      status: 'hidden',
      lastSeen: null
    };
  }

  return {
    userId: String(userId),
    status: presence?.status === 'online' ? 'online' : 'offline',
    lastSeen: preferences.showLastSeen ? presence?.lastSeen || null : null
  };
};

const broadcastPresenceUpdate = async (userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return;

  const [friendIds, presence, user] = await Promise.all([
    getFriendIds(normalizedUserId),
    Presence.findOne({ userId: normalizedUserId }).select('status lastSeen lastActivity').lean(),
    User.findById(normalizedUserId).select('realtimePreferences').lean()
  ]);

  emitToUsers(friendIds, 'friend:presence', buildPresencePayload(normalizedUserId, presence, user?.realtimePreferences));
};

const updatePresenceConnection = async (userId, socketId, isConnected) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedSocketId = String(socketId || '').trim();
  if (!normalizedUserId || !normalizedSocketId) return;

  const socketSet = userSocketIds.get(normalizedUserId) || new Set();
  if (isConnected) {
    socketSet.add(normalizedSocketId);
  } else {
    socketSet.delete(normalizedSocketId);
  }

  if (socketSet.size > 0) {
    userSocketIds.set(normalizedUserId, socketSet);
  } else {
    userSocketIds.delete(normalizedUserId);
  }

  const now = new Date();
  const socketIds = [...socketSet];
  await Presence.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: socketIds.length > 0 ? 'online' : 'offline',
        lastActivity: now,
        lastSeen: socketIds.length > 0 ? null : now,
        socketIds
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await broadcastPresenceUpdate(normalizedUserId);
};

const replayMissedEvents = (socket, userId, lastEventId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || !socket) return;

  const queue = replayBufferByUser.get(normalizedUserId) || [];
  if (queue.length === 0) return;

  if (!lastEventId) {
    const start = Math.max(queue.length - MAX_REPLAY_EVENTS, 0);
    for (const entry of queue.slice(start)) {
      socket.emit(entry.event, entry.payload);
    }
    return;
  }

  const index = queue.findIndex((entry) => entry.payload?._meta?.eventId === lastEventId);
  const missed = index >= 0 ? queue.slice(index + 1) : queue;
  for (const entry of missed) {
    socket.emit(entry.event, entry.payload);
  }
};

const authenticateSocket = async (socket) => {
  const auth = socket?.handshake?.auth || {};
  const fallbackUserId = String(auth.userId || '').trim();
  const token = String(auth.token || '').trim();

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      const user = await User.findById(decoded.userId).select('_id username realName realtimePreferences').lean();
      if (user) {
        return {
          userId: String(user._id),
          displayName: user.username || user.realName || 'user',
          realtimePreferences: normalizeRealtimePreferences(user.realtimePreferences)
        };
      }
    } catch {
      // fall back to existing join-user compatibility below
    }
  }

  if (!fallbackUserId) {
    return null;
  }

  const fallbackUser = await User.findById(fallbackUserId).select('_id username realName realtimePreferences').lean();
  if (!fallbackUser) {
    return null;
  }

  return {
    userId: String(fallbackUser._id),
    displayName: fallbackUser.username || fallbackUser.realName || 'user',
    realtimePreferences: normalizeRealtimePreferences(fallbackUser.realtimePreferences)
  };
};

const canEmitTyping = (socketId, scope, targetId, status) => {
  if (status === 'stop') return true;
  const key = `${String(socketId)}:${String(scope)}:${String(targetId)}`;
  const now = Date.now();
  const previous = typingStateBySocket.get(key) || 0;
  if ((now - previous) < TYPING_RATE_LIMIT_MS) {
    return false;
  }
  typingStateBySocket.set(key, now);
  return true;
};

const bindSocketHandlers = () => {
  if (!ioInstance) return;

  ioInstance.on('connection', async (socket) => {
    const auth = await authenticateSocket(socket);
    if (auth?.userId) {
      socket.data.userId = auth.userId;
      socket.data.displayName = auth.displayName;
      socket.data.realtimePreferences = auth.realtimePreferences;
      socket.join(`user:${auth.userId}`);
      await updatePresenceConnection(auth.userId, socket.id, true);
      replayMissedEvents(socket, auth.userId, socket.handshake?.auth?.lastEventId || null);
    }

    socket.on('join-user', async (userId) => {
      const normalizedUserId = String(userId || '').trim();
      if (!normalizedUserId) return;
      socket.join(`user:${normalizedUserId}`);
    });

    socket.on('subscribe-post', (postId) => {
      const normalizedPostId = String(postId || '').trim();
      if (!normalizedPostId) return;
      socket.join(`post:${normalizedPostId}`);
    });

    socket.on('unsubscribe-post', (postId) => {
      const normalizedPostId = String(postId || '').trim();
      if (!normalizedPostId) return;
      socket.leave(`post:${normalizedPostId}`);
    });

    socket.on('join-room', (roomId) => {
      const normalizedRoomId = String(roomId || '').trim();
      if (!normalizedRoomId) return;
      socket.join(`room:${normalizedRoomId}`);
    });

    socket.on('leave-room', (roomId) => {
      const normalizedRoomId = String(roomId || '').trim();
      if (!normalizedRoomId) return;
      socket.leave(`room:${normalizedRoomId}`);
    });

    socket.on('replay-missed-events', ({ lastEventId } = {}) => {
      if (!socket.data?.userId) return;
      replayMissedEvents(socket, socket.data.userId, lastEventId || null);
    });

    socket.on('typing_start', (payload = {}) => {
      const userId = String(socket.data?.userId || '').trim();
      const displayName = socket.data?.displayName || 'user';
      const scope = String(payload.scope || '').trim().toLowerCase();
      const targetId = String(payload.targetId || '').trim();
      if (!userId || !targetId || !['chat', 'comment'].includes(scope)) return;
      if (!canEmitTyping(socket.id, scope, targetId, 'start')) return;

      const roomName = scope === 'chat' ? `room:${targetId}` : `post:${targetId}`;
      socket.to(roomName).emit('typing', {
        scope,
        targetId,
        userId,
        label: displayName,
        status: 'start'
      });
    });

    socket.on('typing_stop', (payload = {}) => {
      const userId = String(socket.data?.userId || '').trim();
      const displayName = socket.data?.displayName || 'user';
      const scope = String(payload.scope || '').trim().toLowerCase();
      const targetId = String(payload.targetId || '').trim();
      if (!userId || !targetId || !['chat', 'comment'].includes(scope)) return;
      if (!canEmitTyping(socket.id, scope, targetId, 'stop')) return;

      const roomName = scope === 'chat' ? `room:${targetId}` : `post:${targetId}`;
      socket.to(roomName).emit('typing', {
        scope,
        targetId,
        userId,
        label: displayName,
        status: 'stop'
      });
    });

    socket.on('disconnect', async () => {
      for (const key of [...typingStateBySocket.keys()]) {
        if (key.startsWith(`${socket.id}:`)) {
          typingStateBySocket.delete(key);
        }
      }

      if (socket.data?.userId) {
        await updatePresenceConnection(socket.data.userId, socket.id, false);
      }
    });
  });
};

const initializeRealtime = (io) => {
  ioInstance = io;
  bindSocketHandlers();
};

const emitFeedPost = ({ userIds, post }) => {
  emitToUsers(userIds, 'feed:new-post', { post });
};

const emitFeedInteraction = ({ userIds, interaction }) => {
  emitToUsers(userIds, 'feed:interaction', interaction);
};

const emitChatMessage = ({ userIds, message }) => {
  emitToUsers(userIds, 'chat:message', { message });
};

const emitCommentTypingRoomUpdate = ({ postId, payload }) => {
  emitToSocketRoom(`post:${String(postId)}`, 'typing', payload);
};

const getPresenceMapForUsers = async (userIds) => {
  const normalized = [...new Set((Array.isArray(userIds) ? userIds : []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (normalized.length === 0) return new Map();

  const presences = await Presence.find({ userId: { $in: normalized } })
    .select('userId status lastSeen lastActivity')
    .lean();

  return new Map(presences.map((presence) => [String(presence.userId), presence]));
};

module.exports = {
  initializeRealtime,
  emitFeedPost,
  emitFeedInteraction,
  emitChatMessage,
  getFriendIds,
  getPresenceMapForUsers,
  buildPresencePayload
};
