const jwt = require('jsonwebtoken');

const { normalizeRealtimePreferences } = require('../utils/realtimePreferences');
const presenceService = require('./presenceService');

const Friendship = require('../models/Friendship');
const ChatConversation = require('../models/ChatConversation');
const ChatRoom = require('../models/ChatRoom');
const Presence = require('../models/Presence');
const User = require('../models/User');

const MAX_REPLAY_EVENTS = 50;
const TYPING_RATE_LIMIT_MS = 800;
const INACTIVE_PRESENCE_WINDOW_MS = presenceService.INACTIVE_PRESENCE_WINDOW_MS;

let ioInstance = null;
let eventCounter = 0;

const userSocketIds = new Map();
const replayBufferByUser = new Map();
const typingStateBySocket = new Map();

// Active room viewer tracking: which users have a socket in a given room
// roomViewers: Map<roomId, Map<userId, Set<socketId>>>
const roomViewers = new Map();
// socketRooms: Map<socketId, Set<roomId>> — for disconnect cleanup
const socketRooms = new Map();

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

const setRealtimeIo = (io) => {
  ioInstance = io;
};

const getMissedEvents = (userId, sinceTimestamp = 0) => {
  const normalizedUserId = String(userId || '').trim();
  const queue = replayBufferByUser.get(normalizedUserId) || [];
  return queue
    .filter((entry) => {
      const ts = entry.payload?._meta?.timestamp
        ? new Date(entry.payload._meta.timestamp).getTime()
        : 0;
      return ts >= sinceTimestamp;
    })
    .map((entry) => ({ eventName: entry.event, payload: entry.payload }));
};

const emitToUser = (userId, event, payload, options = {}) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || !ioInstance) return null;

  // Accept either `store: false` or `record: false` to suppress replay buffering.
  const shouldStore = options.store !== false && options.record !== false;
  if (shouldStore) {
    storeReplayEvent(normalizedUserId, event, payload);
  }
  // Emit the raw payload to the socket (no _meta wrapper on the wire).
  ioInstance.to(`user:${normalizedUserId}`).emit(event, payload);
  return payload;
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

const toTimestamp = (value) => {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const normalizePresenceRecord = (presence, referenceTime = Date.now()) =>
  presenceService.normalizePresenceRecord(presence, referenceTime);

const buildPresencePayload = (userId, presence, preferencesInput = {}) =>
  presenceService.buildPresencePayload(userId, presence, preferencesInput);

const broadcastPresenceUpdate = async (userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return;

  const [friendIds, presence, user, chatRooms, conversations] = await Promise.all([
    getFriendIds(normalizedUserId),
    Presence.findOne({ userId: normalizedUserId }).select('status lastSeen lastActivity').lean(),
    User.findById(normalizedUserId).select('realtimePreferences').lean(),
    ChatRoom.find({ members: normalizedUserId }).select('_id').lean(),
    ChatConversation.find({ participants: normalizedUserId }).select('_id').lean()
  ]);

  const payload = buildPresencePayload(normalizedUserId, presence, user?.realtimePreferences);

  emitToUsers(friendIds, 'friend:presence', payload);

  const roomIds = new Set([
    ...chatRooms.map((room) => String(room?._id || '')).filter(Boolean),
    ...conversations.map((conversation) => String(conversation?._id || '')).filter(Boolean)
  ]);
  for (const roomId of roomIds) {
    emitToSocketRoom(`room:${roomId}`, 'presence:update', payload);
  }
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

  await presenceService.updateConnection(normalizedUserId, normalizedSocketId, isConnected, socketSet);

  await broadcastPresenceUpdate(normalizedUserId);
};

// ── Active room viewer helpers ─────────────────────────────────────
const addRoomViewer = (roomId, userId, socketId) => {
  if (!roomViewers.has(roomId)) roomViewers.set(roomId, new Map());
  const viewers = roomViewers.get(roomId);
  if (!viewers.has(userId)) viewers.set(userId, new Set());
  viewers.get(userId).add(socketId);

  if (!socketRooms.has(socketId)) socketRooms.set(socketId, new Set());
  socketRooms.get(socketId).add(roomId);
};

const removeRoomViewer = (roomId, userId, socketId) => {
  const viewers = roomViewers.get(roomId);
  if (!viewers) return false;
  const sockets = viewers.get(userId);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    viewers.delete(userId);
    if (viewers.size === 0) roomViewers.delete(roomId);
    return true; // user fully left this room
  }
  return false; // user still has other sockets in this room
};

const cleanupSocketRooms = (socketId, userId) => {
  const rooms = socketRooms.get(socketId);
  if (!rooms) return [];
  const leftRoomIds = [];
  for (const roomId of rooms) {
    if (removeRoomViewer(roomId, userId, socketId)) {
      leftRoomIds.push(roomId);
    }
  }
  socketRooms.delete(socketId);
  return leftRoomIds;
};

const getRoomActiveViewerIds = (roomId) => {
  const viewers = roomViewers.get(String(roomId || '').trim());
  return viewers ? [...viewers.keys()] : [];
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
  const token = String(auth.token || '').trim();

  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const user = await User.findById(decoded.userId).select('_id username realName realtimePreferences').lean();
    if (!user) {
      return null;
    }
    return {
      userId: String(user._id),
      displayName: user.username || user.realName || 'user',
      realtimePreferences: normalizeRealtimePreferences(user.realtimePreferences)
    };
  } catch {
    return null;
  }
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
      // Only allow the authenticated socket owner to join their own user room.
      if (!normalizedUserId || normalizedUserId !== socket.data?.userId) return;
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

    socket.on('join-room', async (roomId) => {
      const normalizedRoomId = String(roomId || '').trim();
      if (!normalizedRoomId) return;
      socket.join(`room:${normalizedRoomId}`);

      const userId = socket.data?.userId;
      if (!userId) return;
      const viewersBefore = roomViewers.get(normalizedRoomId);
      const isNewViewer = !viewersBefore || !viewersBefore.has(userId);
      addRoomViewer(normalizedRoomId, userId, socket.id);
      if (isNewViewer) {
        try {
          const viewerUser = await User.findById(userId)
            .select('_id username realName avatarUrl realtimePreferences')
            .lean();
          if (viewerUser) {
            const presenceDoc = await Presence.findOne({ userId }).select('status lastSeen lastActivity').lean();
            const payload = {
              roomId: normalizedRoomId,
              user: {
                _id: viewerUser._id,
                username: viewerUser.username || null,
                realName: viewerUser.realName || null,
                avatarUrl: viewerUser.avatarUrl || null,
                presence: buildPresencePayload(userId, presenceDoc, viewerUser.realtimePreferences)
              }
            };
            emitToSocketRoom(`room:${normalizedRoomId}`, 'room:viewer-join', payload);
          }
        } catch (err) {
          console.warn('Failed to broadcast room viewer join:', err?.message || err);
        }
      }
    });

    socket.on('leave-room', (roomId) => {
      const normalizedRoomId = String(roomId || '').trim();
      if (!normalizedRoomId) return;
      socket.leave(`room:${normalizedRoomId}`);

      const userId = socket.data?.userId;
      if (!userId) return;
      const fullyLeft = removeRoomViewer(normalizedRoomId, userId, socket.id);
      const sr = socketRooms.get(socket.id);
      if (sr) { sr.delete(normalizedRoomId); if (sr.size === 0) socketRooms.delete(socket.id); }
      if (fullyLeft) {
        emitToSocketRoom(`room:${normalizedRoomId}`, 'room:viewer-leave', {
          roomId: normalizedRoomId,
          userId
        });
      }
    });

    socket.on('heartbeat', async () => {
      const userId = socket.data?.userId;
      if (!userId) return;
      await presenceService.recordHeartbeat(userId);
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

      const userId = socket.data?.userId;
      if (userId) {
        const leftRoomIds = cleanupSocketRooms(socket.id, userId);
        for (const roomId of leftRoomIds) {
          emitToSocketRoom(`room:${roomId}`, 'room:viewer-leave', { roomId, userId });
        }
        await updatePresenceConnection(userId, socket.id, false);
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

const emitFeedPostRemoved = ({ userIds, postId }) => {
  emitToUsers(userIds, 'feed:post-removed', { postId: String(postId) });
};

const emitFeedInteraction = ({ userIds, interaction }) => {
  emitToUsers(userIds, 'feed:interaction', interaction);
};

const emitChatMessage = ({ userIds, message }) => {
  emitToUsers(userIds, 'chat:message', { message });
};

const isUserInRealtimeRoom = (userId, roomId) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedRoomId = String(roomId || '').trim();
  if (!normalizedUserId || !normalizedRoomId || !ioInstance) return false;

  const userSockets = userSocketIds.get(normalizedUserId);
  if (!userSockets || userSockets.size === 0) return false;

  const roomMembers = ioInstance.sockets?.adapter?.rooms?.get(`room:${normalizedRoomId}`);
  if (!roomMembers || roomMembers.size === 0) return false;

  for (const socketId of userSockets) {
    if (roomMembers.has(socketId)) {
      return true;
    }
  }
  return false;
};

const getPresenceMapForUsers = async (userIds) =>
  presenceService.getPresenceMap(userIds);

module.exports = {
  initializeRealtime,
  setRealtimeIo,
  emitToUsers,
  getMissedEvents,
  emitFeedPost,
  emitFeedPostRemoved,
  emitFeedInteraction,
  emitChatMessage,
  isUserInRealtimeRoom,
  getFriendIds,
  getPresenceMapForUsers,
  buildPresencePayload,
  normalizePresenceRecord,
  getRoomActiveViewerIds
};
