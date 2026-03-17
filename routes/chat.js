const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs/promises');
const multer = require('multer');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const EventSchedule = require('../models/EventSchedule');
const DeviceKey = require('../models/DeviceKey');
const SecurityEvent = require('../models/SecurityEvent');
const BlockList = require('../models/BlockList');
const RoomKeyPackage = require('../models/RoomKeyPackage');
const ChatConversation = require('../models/ChatConversation');
const ConversationMessage = require('../models/ConversationMessage');
const ConversationKeyPackage = require('../models/ConversationKeyPackage');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const SiteContentFilter = require('../models/SiteContentFilter');
const { createNotification } = require('../services/notifications');
const { emitChatMessage, getPresenceMapForUsers, buildPresencePayload } = require('../services/realtime');
const { reconcileEventRooms } = require('../services/eventRoomLifecycle');
const {
  findExactFilterWord,
  censorMaturityText,
  normalizeFilterWords
} = require('../utils/contentFilter');

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const logSecurityEvent = async ({ userId, eventType, req, metadata = {}, severity = 'info' }) => {
  try {
    await SecurityEvent.create({
      userId,
      eventType,
      severity,
      metadata: {
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
        ...metadata
      }
    });
  } catch (error) {
    console.error('Failed to write security event:', error?.message || error);
  }
};

const getContentFilterConfig = async () => {
  const config = await SiteContentFilter.findOne({ key: 'global' }).lean();
  return {
    zeroToleranceWords: normalizeFilterWords(config?.zeroToleranceWords || []),
    maturityCensoredWords: normalizeFilterWords(config?.maturityCensoredWords || [])
  };
};

const decorateRoomMessageContent = (message, maturityWords = [], censorEnabled = true) => {
  if (!message || typeof message !== 'object') return message;
  const rawContent = typeof message.content === 'string' ? message.content : message.content ?? null;
  const contentCensored = typeof rawContent === 'string'
    ? censorMaturityText(rawContent, maturityWords)
    : rawContent;
  return {
    ...message,
    content: censorEnabled ? contentCensored : rawContent,
    contentCensored
  };
};

const getViewerContentFilterPreference = async (viewerId) => {
  if (!viewerId) return true;
  const viewerQuery = User.findById(viewerId).select('enableMaturityWordCensor');
  const viewer = typeof viewerQuery?.lean === 'function'
    ? await viewerQuery.lean()
    : await viewerQuery;
  return viewer?.enableMaturityWordCensor !== false;
};

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
      const user = await User.findById(decoded.userId).select('onboardingStatus');
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (user.onboardingStatus !== 'completed') {
        return res.status(403).json({
          error: 'Complete onboarding before using chat features',
          code: 'ONBOARDING_REQUIRED'
        });
      }

      req.user = decoded;
      next();
    } catch (lookupError) {
      return res.status(500).json({ error: 'Authentication failed' });
    }
  });
};

const optionalAuthenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    req.user = null;
    return next();
  }

  return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
      const user = await User.findById(decoded.userId).select('onboardingStatus');
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (user.onboardingStatus !== 'completed') {
        return res.status(403).json({
          error: 'Complete onboarding before using chat features',
          code: 'ONBOARDING_REQUIRED'
        });
      }

      req.user = decoded;
      return next();
    } catch (lookupError) {
      return res.status(500).json({ error: 'Authentication failed' });
    }
  });
};

const E2EE_LIMITS = {
  deviceId: 128,
  clientMessageId: 128,
  nonce: 4096,
  aad: 8192,
  ciphertext: 131072,
  signature: 16384,
  hash: 128,
  algorithm: 64,
  hashAlgorithm: 32,
  publicKey: 16384
};
const NEARBY_ZIP_THRESHOLD = 25;
const MAX_NEARBY_ZIP_ROOMS = 100;
const METERS_PER_MILE = 1609.34;
const PROFILE_THREAD_ROLE_VALUES = ['friends', 'circles', 'guests'];
const DEFAULT_PROFILE_THREAD_ACCESS = Object.freeze({
  readRoles: ['friends', 'circles'],
  writeRoles: ['friends', 'circles']
});
const unifiedChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests, please slow down.' }
});

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 500;
const DEFAULT_DISCOVERY_LIMIT = 20;
const MAX_DISCOVERY_LIMIT = 500;
const MESSAGE_TYPES = ['text', 'action', 'system', 'command', 'meetup-invite'];
const CHAT_GLOBAL_COOLDOWN_MS = 20 * 1000;

const COMMAND_DATA_LIMITS = {
  command: 64,
  processedContent: 2000,
  targetUserId: 128,
  targetUsername: 64,
  nickname: 32
};
const AUDIO_MEDIA_TYPES = ['audio'];
const AUDIO_MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4']);
const MAX_AUDIO_DURATION_MS = 120000;
const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_WAVEFORM_BINS = 256;
const AUDIO_UPLOAD_ROOT = path.join(__dirname, '..', 'private_uploads', 'chat-audio');
const AUDIO_EXT_BY_MIME = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4'
};
const AUDIO_STORAGE_KEY_PATTERN = /^[a-f0-9-]+\.(webm|ogg|mp4)$/;
const isValidAudioStorageKey = (value) => typeof value === 'string' && value.length > 0 && value.length <= 255 && AUDIO_STORAGE_KEY_PATTERN.test(value);

const isSafeString = (value, maxLength) => typeof value === 'string' && value.length > 0 && value.length <= maxLength;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const HEX_PATTERN = /^[A-Fa-f0-9]+$/;

const isSafeBase64Like = (value, maxLength) => isSafeString(value, maxLength) && BASE64URL_PATTERN.test(value);
const isSafeHex = (value, minLength, maxLength) => isSafeString(value, maxLength) && value.length >= minLength && HEX_PATTERN.test(value);

const parseMessageLimit = (rawLimit) => Math.min(Math.max(parseInt(rawLimit, 10) || DEFAULT_MESSAGE_LIMIT, 1), MAX_MESSAGE_LIMIT);
const parseDiscoveryLimit = (rawLimit) => Math.min(Math.max(parseInt(rawLimit, 10) || DEFAULT_DISCOVERY_LIMIT, 1), MAX_DISCOVERY_LIMIT);
const chatKeyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const buildRouteLimiter = (max, message) => rateLimit({
  windowMs: 60 * 1000,
  max,
  message,
  keyGenerator: chatKeyGenerator,
  validate: {
    xForwardedForHeader: false
  }
});
const DISCOVERY_ROOM_FILTER = {
  $or: [
    { type: 'state' },
    { type: 'city', stableKey: { $exists: true, $ne: null } },
    { type: 'topic' },
    { type: 'city', zipCode: { $exists: true, $nin: [null, ''] } }
  ]
};
const buildAllRoomsAggregationPipeline = (skip, limit) => ([
  { $match: DISCOVERY_ROOM_FILTER },
  {
    $addFields: {
      discoveryTypePriority: {
        $switch: {
          branches: [
            { case: { $eq: ['$type', 'state'] }, then: 0 },
            { case: { $eq: ['$type', 'city'] }, then: 1 },
            { case: { $eq: ['$type', 'topic'] }, then: 2 }
          ],
          default: 3
        }
      }
    }
  },
  { $sort: { discoveryTypePriority: 1, lastActivity: -1, createdAt: -1 } },
  { $skip: skip },
  { $limit: limit },
  {
    $project: {
      _id: 1,
      name: 1,
      type: 1,
      createdBy: 1,
      city: 1,
      state: 1,
      country: 1,
      county: 1,
      zipCode: 1,
      discoverable: 1,
      eventRef: 1,
      stableKey: 1,
      autoLifecycle: 1,
      members: 1,
      messageCount: 1,
      lastActivity: 1
    }
  }
]);
const formatDiscoveryRoomSummary = (room, userId = null) => ({
  ...room,
  memberCount: Array.isArray(room?.members) ? room.members.length : Number(room?.memberCount || 0),
  isMember: userId
    ? Array.isArray(room?.members) && room.members.some((memberId) => String(memberId) === String(userId))
    : undefined
});
const toPlainDoc = (doc) => (doc?.toObject ? doc.toObject() : doc);
const hasValidCoordinates = (location) => (
  Array.isArray(location?.coordinates)
  && location.coordinates.length === 2
  && Number.isFinite(Number(location.coordinates[0]))
  && Number.isFinite(Number(location.coordinates[1]))
);
const getNormalizedCoordinates = (location) => (
  hasValidCoordinates(location)
    ? location.coordinates.map((value) => Number(value))
    : null
);
const discoveryLimiter = buildRouteLimiter(90, 'Too many room discovery requests. Please slow down.');
const allRoomsLimiter = buildRouteLimiter(20, 'Too many full room list requests. Please try again soon.');
const roomReadLimiter = buildRouteLimiter(120, 'Too many room requests. Please slow down.');
const roomWriteLimiter = buildRouteLimiter(60, 'Too many chat messages. Please slow down.');

const encodeMessageCursor = (createdAt, id) => Buffer.from(`${new Date(createdAt).toISOString()}|${String(id)}`).toString('base64url');

const decodeMessageCursor = (cursor) => {
  if (!cursor || typeof cursor !== 'string' || cursor.length > 2048) {
    return { error: 'Invalid cursor' };
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [createdAtRaw, idRaw] = decoded.split('|');

    if (!createdAtRaw || !idRaw) {
      return { error: 'Invalid cursor' };
    }

    const createdAt = new Date(createdAtRaw);
    if (Number.isNaN(createdAt.getTime())) {
      return { error: 'Invalid cursor timestamp' };
    }

    return { createdAt, id: idRaw };
  } catch (error) {
    return { error: 'Malformed cursor' };
  }
};

const normalizeZipCode = (zipCode) => {
  if (typeof zipCode !== 'string') return null;
  const digits = zipCode.replace(/\D/g, '');
  if (digits.length < 5) return null;
  return digits.slice(0, 5);
};

const areZipCodesNearby = (zipA, zipB) => {
  if (!zipA || !zipB) return false;
  const a = parseInt(zipA, 10);
  const b = parseInt(zipB, 10);
  if (!Number.isNaN(a) && !Number.isNaN(b)) {
    return Math.abs(a - b) <= NEARBY_ZIP_THRESHOLD;
  }
  return zipA.slice(0, 3) === zipB.slice(0, 3);
};

const getNearbyActiveZipRooms = async (zipCode) => {
  if (!zipCode) return [];
  const rooms = await ChatConversation.find({
    type: 'zip-room',
    zipCode: { $ne: zipCode },
    messageCount: { $gt: 0 }
  })
    .select('_id title zipCode messageCount lastMessageAt')
    .sort({ lastMessageAt: -1 })
    .limit(MAX_NEARBY_ZIP_ROOMS)
    .lean();

  return rooms.filter((room) => areZipCodesNearby(zipCode, room.zipCode));
};

const isConversationParticipant = (conversation, userId) => (
  Array.isArray(conversation?.participants)
    && conversation.participants.some((participantId) => String(participantId) === String(userId))
);

const canAccessConversation = (conversation, userId) => {
  if (!conversation) return false;
  if (conversation.type === 'zip-room') return true;
  return isConversationParticipant(conversation, userId);
};

const getConversationParticipantIds = (conversation) => (
  Array.isArray(conversation?.participants)
    ? conversation.participants.map((participantId) => String(participantId))
    : []
);

const normalizeProfileThreadRoles = (roles, fallback) => {
  if (!Array.isArray(roles)) return [...fallback];
  const uniqueRoles = [];
  const seen = new Set();
  for (const role of roles) {
    if (typeof role !== 'string') continue;
    const normalizedRole = role.trim().toLowerCase();
    if (!PROFILE_THREAD_ROLE_VALUES.includes(normalizedRole) || seen.has(normalizedRole)) continue;
    seen.add(normalizedRole);
    uniqueRoles.push(normalizedRole);
  }
  return uniqueRoles.length > 0 ? uniqueRoles : [...fallback];
};

const normalizeProfileThreadAccess = (access) => ({
  readRoles: normalizeProfileThreadRoles(access?.readRoles, DEFAULT_PROFILE_THREAD_ACCESS.readRoles),
  writeRoles: normalizeProfileThreadRoles(access?.writeRoles, DEFAULT_PROFILE_THREAD_ACCESS.writeRoles)
});

const canUseRole = (roles, relationship) => {
  if (roles.includes('guests')) return true;
  if (roles.includes('circles') && relationship.isCircleMember) return true;
  if (roles.includes('friends') && relationship.isFriend) return true;
  return false;
};

const resolveProfileThreadPermissions = async (conversation, viewerId) => {
  const profileUserId = String(conversation?.profileUserId || '');
  if (!profileUserId) {
    return { canRead: false, canWrite: false, access: normalizeProfileThreadAccess(null), isOwner: false };
  }

  const normalizedViewerId = String(viewerId || '');
  const access = normalizeProfileThreadAccess(conversation?.profileThreadAccess);
  if (!normalizedViewerId) {
    return {
      canRead: access.readRoles.includes('guests'),
      canWrite: access.writeRoles.includes('guests'),
      access,
      isOwner: false
    };
  }

  if (normalizedViewerId === profileUserId) {
    return { canRead: true, canWrite: true, access: normalizeProfileThreadAccess(conversation?.profileThreadAccess), isOwner: true };
  }

  const [friendship, profileUser] = await Promise.all([
    Friendship.findOne({
      status: 'accepted',
      $or: [
        { requester: profileUserId, recipient: normalizedViewerId },
        { requester: normalizedViewerId, recipient: profileUserId }
      ]
    }).select('_id').lean(),
    User.findById(profileUserId).select('_id circles.members').lean()
  ]);

  const circleMemberIds = new Set();
  if (Array.isArray(profileUser?.circles)) {
    for (const circle of profileUser.circles) {
      if (!Array.isArray(circle?.members)) continue;
      for (const memberId of circle.members) {
        circleMemberIds.add(String(memberId));
      }
    }
  }
  const relationship = {
    isFriend: Boolean(friendship),
    isCircleMember: circleMemberIds.has(normalizedViewerId)
  };

  return {
    canRead: canUseRole(access.readRoles, relationship),
    canWrite: canUseRole(access.writeRoles, relationship),
    access,
    isOwner: false
  };
};

const formatConversationSummary = (conversation, usersById, currentUserId, presenceMap = new Map()) => {
  const base = {
    _id: conversation._id,
    type: conversation.type,
    title: conversation.title || '',
    zipCode: conversation.zipCode || null,
    profileUserId: conversation.profileUserId || null,
    participants: Array.isArray(conversation.participants)
      ? conversation.participants.map((participant) => String(participant))
      : [],
    lastMessageAt: conversation.lastMessageAt || null,
    messageCount: conversation.messageCount || 0
  };

  if (conversation.type === 'dm') {
    const peerId = base.participants.find((participantId) => participantId !== String(currentUserId)) || null;
    const peer = peerId ? usersById.get(peerId) : null;
    return {
      ...base,
      peer: peer ? {
        _id: peer._id,
        username: peer.username,
        realName: peer.realName,
        presence: buildPresencePayload(peer._id, presenceMap.get(String(peer._id)), peer.realtimePreferences)
      } : null
    };
  }

  if (conversation.type === 'profile-thread') {
    const profileId = String(conversation.profileUserId || '');
    const profileUser = profileId ? usersById.get(profileId) : null;
    return {
      ...base,
      profileThreadAccess: normalizeProfileThreadAccess(conversation.profileThreadAccess),
      profileUser: profileUser ? {
        _id: profileUser._id,
        username: profileUser.username,
        realName: profileUser.realName,
        presence: buildPresencePayload(profileUser._id, presenceMap.get(String(profileUser._id)), profileUser.realtimePreferences)
      } : null
    };
  }

  return base;
};

const resolveLeanDoc = async (query) => (
  typeof query?.lean === 'function'
    ? query.lean()
    : query
);

const isPrivilegedChatUser = (user) => Boolean(user?.isAdmin || user?.isModerator);

const getLatestChatTimestamp = async (query) => {
  const result = await resolveLeanDoc(query);
  if (!result?.createdAt) return null;
  const timestamp = new Date(result.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getGlobalChatCooldown = async (userId) => {
  const windowStart = new Date(Date.now() - CHAT_GLOBAL_COOLDOWN_MS);
  const [recentRoomMessageAt, recentConversationMessageAt] = await Promise.all([
    getLatestChatTimestamp(
      ChatMessage.findOne({
        userId,
        messageType: { $ne: 'system' },
        createdAt: { $gte: windowStart }
      })
        .select('createdAt')
        .sort({ createdAt: -1 })
    ),
    getLatestChatTimestamp(
      ConversationMessage.findOne({
        userId,
        chatScope: 'chat',
        messageType: { $ne: 'system' },
        createdAt: { $gte: windowStart }
      })
        .select('createdAt')
        .sort({ createdAt: -1 })
    )
  ]);

  const latestTimestamp = Math.max(recentRoomMessageAt || 0, recentConversationMessageAt || 0);
  if (!latestTimestamp) {
    return { allowed: true, retryAfter: 0 };
  }

  const retryAfterMs = (latestTimestamp + CHAT_GLOBAL_COOLDOWN_MS) - Date.now();
  if (retryAfterMs <= 0) {
    return { allowed: true, retryAfter: 0 };
  }

  return {
    allowed: false,
    retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000))
  };
};

const isValidMessageType = (messageType) => MESSAGE_TYPES.includes(messageType);

const normalizeMessageType = (messageType) => (isValidMessageType(messageType) ? messageType : 'text');

const sanitizeCommandData = (commandData) => {
  if (!commandData || typeof commandData !== 'object' || Array.isArray(commandData)) {
    return null;
  }

  const sanitized = {};

  if (typeof commandData.command === 'string') {
    const command = commandData.command.trim().slice(0, COMMAND_DATA_LIMITS.command);
    if (command) sanitized.command = command;
  }

  if (typeof commandData.processedContent === 'string') {
    const processedContent = commandData.processedContent.slice(0, COMMAND_DATA_LIMITS.processedContent);
    if (processedContent) sanitized.processedContent = processedContent;
  }

  if (typeof commandData.targetUserId === 'string') {
    const targetUserId = commandData.targetUserId.trim().slice(0, COMMAND_DATA_LIMITS.targetUserId);
    if (targetUserId) sanitized.targetUserId = targetUserId;
  }

  if (typeof commandData.targetUsername === 'string') {
    const targetUsername = commandData.targetUsername.trim().slice(0, COMMAND_DATA_LIMITS.targetUsername);
    if (targetUsername) sanitized.targetUsername = targetUsername;
  }

  if (typeof commandData.nickname === 'string') {
    const nickname = commandData.nickname.trim().slice(0, COMMAND_DATA_LIMITS.nickname);
    if (nickname) sanitized.nickname = nickname;
  }

  if (Object.prototype.hasOwnProperty.call(commandData, 'result')) {
    sanitized.result = commandData.result;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
};

const sanitizeWaveformBins = (waveformBins) => {
  if (!Array.isArray(waveformBins)) return null;
  if (waveformBins.length === 0 || waveformBins.length > MAX_AUDIO_WAVEFORM_BINS) return null;
  const normalized = waveformBins.map((bin) => {
    const value = Number(bin);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error('audio.waveformBins must contain numbers between 0 and 1');
    }
    return Number(value.toFixed(4));
  });
  return normalized;
};

const sanitizeAudioMetadata = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'audio metadata is required for audio messages' };
  }

  const storageKey = typeof payload.storageKey === 'string' ? payload.storageKey.trim() : '';
  if (!isValidAudioStorageKey(storageKey)) {
    return { error: 'audio.storageKey is invalid' };
  }

  const url = typeof payload.url === 'string' ? payload.url.trim() : '';
  if (!url || url.length > 1024 || url !== `/api/chat/media/audio/${storageKey}`) {
    return { error: 'audio.url is invalid' };
  }

  const durationMs = Number(payload.durationMs);
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > MAX_AUDIO_DURATION_MS) {
    return { error: `audio.durationMs must be between 1 and ${MAX_AUDIO_DURATION_MS}` };
  }

  const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType.trim().toLowerCase() : '';
  if (!AUDIO_MIME_TYPES.has(mimeType)) {
    return { error: `audio.mimeType must be one of: ${Array.from(AUDIO_MIME_TYPES).join(', ')}` };
  }

  const sizeBytes = Number(payload.sizeBytes);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_AUDIO_SIZE_BYTES) {
    return { error: `audio.sizeBytes must be between 1 and ${MAX_AUDIO_SIZE_BYTES}` };
  }

  let waveformBins;
  try {
    waveformBins = sanitizeWaveformBins(payload.waveformBins);
  } catch (error) {
    return { error: error.message };
  }
  if (!waveformBins) {
    return { error: `audio.waveformBins must contain 1-${MAX_AUDIO_WAVEFORM_BINS} normalized values` };
  }

  return {
    value: {
      storageKey,
      url,
      durationMs,
      waveformBins,
      mimeType,
      sizeBytes
    }
  };
};

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!AUDIO_MIME_TYPES.has(file.mimetype)) {
      cb(new Error(`Unsupported audio mime type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  }
});

const roomMessageRateLimiter = rateLimit({
  windowMs: 15 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many chat messages. Please wait before sending again.'
  }
});

const mediaUploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many media uploads. Please wait before uploading another voice note.'
  }
});

const mediaFetchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

const createRoomEventMessage = async ({ roomId, userId, content, messageType = 'system', commandData = null }) => {
  const eventMessage = new ChatMessage({
    roomId,
    userId,
    content,
    encryptedContent: null,
    isEncrypted: false,
    messageType: normalizeMessageType(messageType),
    commandData: sanitizeCommandData(commandData)
  });

  await eventMessage.save();
  await eventMessage.populate('userId', 'username realName');
  return eventMessage;
};

const isRoomMember = (room, userId) => {
  if (!room || !Array.isArray(room.members)) return false;
  return room.members.some((memberId) => String(memberId) === String(userId));
};

const notifyRoomMembers = async ({ room, senderId, senderLabel, message, messageType = 'message' }) => {
  if (!room || !Array.isArray(room.members)) return;

  const recipientIds = room.members
    .map((memberId) => String(memberId))
    .filter((memberId) => memberId && memberId !== String(senderId));

  for (const recipientId of recipientIds) {
    await createNotification({
      recipientId,
      senderId,
      type: messageType,
      title: 'New message',
      body: `${senderLabel} sent a message in ${room.name || room.city || 'a room'}`,
      data: {
        messageId: message?._id,
        roomId: room._id,
        url: '/chat'
      }
    });
  }
};

const validateE2EEEnvelope = (envelope) => {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return 'e2ee envelope object is required';
  }

  if (!Number.isInteger(envelope.version) || envelope.version < 1 || envelope.version > 10) {
    return 'e2ee.version must be an integer between 1 and 10';
  }

  if (!isSafeString(envelope.senderDeviceId, E2EE_LIMITS.deviceId)) {
    return 'e2ee.senderDeviceId is required and too long';
  }

  if (!isSafeString(envelope.clientMessageId, E2EE_LIMITS.clientMessageId)) {
    return 'e2ee.clientMessageId is required and too long';
  }

  if (!Number.isInteger(envelope.keyVersion) || envelope.keyVersion < 1 || envelope.keyVersion > 1000000) {
    return 'e2ee.keyVersion must be an integer between 1 and 1000000';
  }

  if (!isSafeString(envelope.nonce, E2EE_LIMITS.nonce)) {
    return 'e2ee.nonce is required and too long';
  }
  if (!isSafeBase64Like(envelope.nonce, E2EE_LIMITS.nonce)) {
    return 'e2ee.nonce must be base64url-like characters only';
  }

  if (typeof envelope.aad !== 'string' || envelope.aad.length > E2EE_LIMITS.aad) {
    return 'e2ee.aad must be a string within allowed size';
  }

  if (!isSafeString(envelope.ciphertext, E2EE_LIMITS.ciphertext)) {
    return 'e2ee.ciphertext is required and too long';
  }
  if (!isSafeBase64Like(envelope.ciphertext, E2EE_LIMITS.ciphertext)) {
    return 'e2ee.ciphertext must be base64url-like characters only';
  }

  if (!isSafeString(envelope.signature, E2EE_LIMITS.signature)) {
    return 'e2ee.signature is required and too long';
  }
  if (!isSafeBase64Like(envelope.signature, E2EE_LIMITS.signature)) {
    return 'e2ee.signature must be base64url-like characters only';
  }

  if (!isSafeString(envelope.ciphertextHash, E2EE_LIMITS.hash)) {
    return 'e2ee.ciphertextHash is required and too long';
  }
  if (!isSafeHex(envelope.ciphertextHash, 32, E2EE_LIMITS.hash)) {
    return 'e2ee.ciphertextHash must be a hex digest';
  }

  if (!envelope.algorithms || typeof envelope.algorithms !== 'object' || Array.isArray(envelope.algorithms)) {
    return 'e2ee.algorithms object is required';
  }

  if (!isSafeString(envelope.algorithms.cipher, E2EE_LIMITS.algorithm)) {
    return 'e2ee.algorithms.cipher is required and too long';
  }

  if (!isSafeString(envelope.algorithms.signature, E2EE_LIMITS.algorithm)) {
    return 'e2ee.algorithms.signature is required and too long';
  }

  if (!isSafeString(envelope.algorithms.hash, E2EE_LIMITS.hashAlgorithm)) {
    return 'e2ee.algorithms.hash is required and too long';
  }

  return null;
};

const validateRoomKeyPackagePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'package must be an object';
  }

  if (!isSafeString(payload.senderDeviceId, E2EE_LIMITS.deviceId)) {
    return 'senderDeviceId is required and too long';
  }

  if (!isSafeString(payload.recipientDeviceId, E2EE_LIMITS.deviceId)) {
    return 'recipientDeviceId is required and too long';
  }

  if (!payload.recipientUserId || typeof payload.recipientUserId !== 'string') {
    return 'recipientUserId is required';
  }

  if (payload.senderPublicKey != null && (typeof payload.senderPublicKey !== 'string' || payload.senderPublicKey.length > E2EE_LIMITS.publicKey)) {
    return 'senderPublicKey must be a string within allowed size';
  }

  if (!Number.isInteger(payload.keyVersion) || payload.keyVersion < 1 || payload.keyVersion > 1000000) {
    return 'keyVersion must be an integer between 1 and 1000000';
  }

  if (!isSafeString(payload.wrappedRoomKey, E2EE_LIMITS.ciphertext)) {
    return 'wrappedRoomKey is required and too long';
  }

  if (!isSafeString(payload.nonce, E2EE_LIMITS.nonce)) {
    return 'nonce is required and too long';
  }

  if (payload.aad != null && (typeof payload.aad !== 'string' || payload.aad.length > E2EE_LIMITS.aad)) {
    return 'aad must be a string within allowed size';
  }

  if (payload.signature != null && (typeof payload.signature !== 'string' || payload.signature.length > E2EE_LIMITS.signature)) {
    return 'signature exceeds allowed size';
  }

  if (payload.wrappedKeyHash != null && (typeof payload.wrappedKeyHash !== 'string' || payload.wrappedKeyHash.length > E2EE_LIMITS.hash)) {
    return 'wrappedKeyHash exceeds allowed size';
  }

  if (!payload.algorithms || typeof payload.algorithms !== 'object' || Array.isArray(payload.algorithms)) {
    return 'algorithms object is required';
  }

  if (!isSafeString(payload.algorithms.encryption, E2EE_LIMITS.algorithm)) {
    return 'algorithms.encryption is required and too long';
  }

  if (payload.algorithms.wrapping != null && (typeof payload.algorithms.wrapping !== 'string' || payload.algorithms.wrapping.length > E2EE_LIMITS.algorithm)) {
    return 'algorithms.wrapping exceeds allowed size';
  }

  if (payload.algorithms.signing != null && (typeof payload.algorithms.signing !== 'string' || payload.algorithms.signing.length > E2EE_LIMITS.algorithm)) {
    return 'algorithms.signing exceeds allowed size';
  }

  if (payload.algorithms.hash != null && (typeof payload.algorithms.hash !== 'string' || payload.algorithms.hash.length > E2EE_LIMITS.hashAlgorithm)) {
    return 'algorithms.hash exceeds allowed size';
  }

  return null;
};

// Discover event rooms with optional search/filters.
router.get('/rooms/discover', discoveryLimiter, authenticateToken, async (req, res) => {
  try {
    await reconcileEventRooms();

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = parseDiscoveryLimit(req.query.limit);
    const skip = (page - 1) * limit;
    const query = String(req.query.query || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim().toLowerCase();
    const tags = String(req.query.tags || '')
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    const roomFilter = { type: 'event', discoverable: true };

    const rooms = await ChatRoom.find(roomFilter)
      .select('_id name type eventRef members messageCount lastActivity')
      .sort({ messageCount: -1, lastActivity: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const eventIds = rooms.map((room) => room.eventRef).filter(Boolean);
    const eventFilter = { _id: { $in: eventIds } };
    if (status) {
      eventFilter.status = status;
    }
    if (tags.length > 0) {
      eventFilter.tags = { $in: tags };
    }
    if (query) {
      eventFilter.$or = [
        { title: { $regex: query, $options: 'i' } },
        { leagueOrSeries: { $regex: query, $options: 'i' } },
        { tags: { $in: [query] } }
      ];
    }

    const events = await EventSchedule.find(eventFilter)
      .select('_id eventType leagueOrSeries title season episode startAt endAt status tags')
      .lean();
    const eventsById = new Map(events.map((event) => [String(event._id), event]));

    const filteredRooms = rooms
      .map((room) => ({
        ...room,
        event: eventsById.get(String(room.eventRef)) || null
      }))
      .filter((room) => !!room.event);

    return res.json({
      success: true,
      page,
      limit,
      rooms: filteredRooms.map((room) => ({
        _id: room._id,
        name: room.name,
        type: room.type,
        memberCount: Array.isArray(room.members) ? room.members.length : 0,
        messageCount: room.messageCount || 0,
        lastActivity: room.lastActivity,
        event: room.event
      }))
    });
  } catch (error) {
    console.error('Error discovering rooms:', error);
    return res.status(500).json({ error: 'Failed to discover rooms', details: error.message });
  }
});

// Upcoming event rooms based on schedule start datetime.
router.get('/rooms/events/upcoming', discoveryLimiter, authenticateToken, async (req, res) => {
  try {
    await reconcileEventRooms();
    const now = new Date();
    const days = Math.max(Math.min(parseInt(req.query.days, 10) || 7, 30), 1);
    const endWindow = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));

    const schedules = await EventSchedule.find({
      startAt: { $gte: now, $lte: endWindow },
      status: { $in: ['scheduled', 'live'] }
    })
      .sort({ startAt: 1 })
      .limit(200)
      .lean();

    const eventIds = schedules.map((schedule) => schedule._id);
    const rooms = await ChatRoom.find({
      type: 'event',
      discoverable: true,
      eventRef: { $in: eventIds }
    })
      .select('_id name eventRef members messageCount')
      .lean();
    const roomByEvent = new Map(rooms.map((room) => [String(room.eventRef), room]));

    return res.json({
      success: true,
      days,
      events: schedules.map((schedule) => ({
        schedule: {
          _id: schedule._id,
          eventType: schedule.eventType,
          leagueOrSeries: schedule.leagueOrSeries,
          title: schedule.title,
          season: schedule.season,
          episode: schedule.episode,
          startAt: schedule.startAt,
          endAt: schedule.endAt,
          status: schedule.status,
          tags: schedule.tags || []
        },
        room: roomByEvent.get(String(schedule._id)) || null
      }))
    });
  } catch (error) {
    console.error('Error loading upcoming event rooms:', error);
    return res.status(500).json({ error: 'Failed to load upcoming event rooms', details: error.message });
  }
});

// All chat rooms endpoint must be explicitly requested by the user.
router.get('/rooms/all', allRoomsLimiter, authenticateToken, async (req, res) => {
  try {
    await ChatRoom.ensureDefaultDiscoveryRooms();

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = parseDiscoveryLimit(req.query.limit);
    const skip = (page - 1) * limit;
    const pipeline = buildAllRoomsAggregationPipeline(skip, limit);
    let total = await ChatRoom.countDocuments(DISCOVERY_ROOM_FILTER);

    if (total === 0) {
      await ChatRoom.ensureDefaultDiscoveryRooms({ force: true });
      total = await ChatRoom.countDocuments(DISCOVERY_ROOM_FILTER);
    }
    const rooms = total > 0 ? await ChatRoom.aggregate(pipeline) : [];

    return res.json({
      success: true,
      page,
      limit,
      total,
      hasMore: (skip + rooms.length) < total,
      rooms: rooms.map((room) => formatDiscoveryRoomSummary(room))
    });
  } catch (error) {
    console.error('Error loading all rooms:', error);
    return res.status(500).json({ error: 'Failed to load all rooms', details: error.message });
  }
});

router.get('/rooms/quick-access', unifiedChatLimiter, authenticateToken, async (req, res) => {
  try {
    await ChatRoom.ensureDefaultDiscoveryRooms();

    const user = await resolveLeanDoc(
      User.findById(req.user.userId)
        .select('_id city state country county zipCode location')
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const coordinates = getNormalizedCoordinates(user.location);

    if (coordinates) {
      await ChatRoom.syncUserLocationRooms({
        ...user,
        location: {
          ...user.location,
          coordinates
        }
      });
    }

    const normalizedZipCode = normalizeZipCode(user.zipCode);
    const country = user.country || 'US';
    const [stateResult, countyResult, zipConversation] = await Promise.all([
      user.state
        ? ChatRoom.findOrCreateByLocation({
          type: 'state',
          state: user.state,
          country,
          coordinates: coordinates || undefined
        })
        : Promise.resolve(null),
      user.state && user.county
        ? ChatRoom.findOrCreateByLocation({
          type: 'county',
          state: user.state,
          country,
          county: user.county,
          coordinates: coordinates || undefined
        })
        : Promise.resolve(null),
      normalizedZipCode
        ? resolveLeanDoc(ChatConversation.findOne({ type: 'zip-room', zipCode: normalizedZipCode }))
        : Promise.resolve(null)
    ]);

    let nearbyCities = [];
    if (coordinates) {
      const [longitude, latitude] = coordinates;
      nearbyCities = await ChatRoom.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [longitude, latitude] },
            distanceField: 'distanceMeters',
            spherical: true,
            maxDistance: 100 * METERS_PER_MILE,
            query: {
              type: 'city',
              zipCode: {
                $exists: true,
                $nin: [null, '', normalizedZipCode]
              },
              ...(user.state ? { state: user.state } : {})
            }
          }
        },
        { $sort: { distanceMeters: 1, messageCount: -1, lastActivity: -1 } },
        { $limit: 3 },
        {
          $project: {
            _id: 1,
            name: 1,
            type: 1,
            city: 1,
            state: 1,
            country: 1,
            county: 1,
            zipCode: 1,
            members: 1,
            messageCount: 1,
            lastActivity: 1,
            distanceMeters: 1
          }
        }
      ]);
    }

    return res.json({
      success: true,
      rooms: {
        state: stateResult?.room ? formatDiscoveryRoomSummary(toPlainDoc(stateResult.room), user._id) : null,
        county: countyResult?.room ? formatDiscoveryRoomSummary(toPlainDoc(countyResult.room), user._id) : null,
        zip: zipConversation ? formatConversationSummary(zipConversation, new Map(), user._id, new Map()) : null,
        cities: nearbyCities.map((room) => ({
          ...formatDiscoveryRoomSummary(room, user._id),
          distanceMiles: Number((Number(room.distanceMeters || 0) / METERS_PER_MILE).toFixed(1))
        }))
      }
    });
  } catch (error) {
    console.error('Error loading quick-access rooms:', error);
    return res.status(500).json({ error: 'Failed to load quick-access rooms', details: error.message });
  }
});

// Get room details and messages
router.get('/rooms/:roomId', roomReadLimiter, authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const cursor = req.query.cursor;
    const limit = parseMessageLimit(req.query.limit);
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    const [contentFilter, censorEnabled] = await Promise.all([
      getContentFilterConfig(),
      getViewerContentFilterPreference(req.user.userId)
    ]);
    
    let messages = [];
    let pagination = {
      mode: 'page',
      page,
      limit,
      hasMore: false,
      nextCursor: null
    };

    if (cursor) {
      const parsedCursor = decodeMessageCursor(cursor);
      if (parsedCursor.error) {
        return res.status(400).json({ error: parsedCursor.error });
      }

      const cursorResult = await ChatMessage.getRoomMessagesByCursor(roomId, {
        limit,
        beforeCreatedAt: parsedCursor.createdAt,
        beforeId: parsedCursor.id
      });

      messages = cursorResult.messages.map((message) => (
        decorateRoomMessageContent(message, contentFilter.maturityCensoredWords, censorEnabled)
      ));
      pagination = {
        mode: 'cursor',
        limit: cursorResult.limit,
        hasMore: cursorResult.hasMore,
        nextCursor: cursorResult.hasMore && cursorResult.cursorSource
          ? encodeMessageCursor(cursorResult.cursorSource.createdAt, cursorResult.cursorSource._id)
          : null
      };
    } else {
      messages = (await ChatMessage.getRoomMessages(roomId, page, limit)).map((message) => (
        decorateRoomMessageContent(message, contentFilter.maturityCensoredWords, censorEnabled)
      ));
      pagination.hasMore = messages.length === limit;
      pagination.nextCursor = messages.length > 0
        ? encodeMessageCursor(messages[0].createdAt, messages[0]._id)
        : null;
    }
    
    res.json({
      success: true,
      room: {
        _id: room._id,
        name: room.name,
        type: room.type,
        city: room.city,
        state: room.state,
        country: room.country,
        radius: room.radius,
        memberCount: room.members.length,
        messageCount: room.messageCount,
        lastActivity: room.lastActivity,
        settings: room.settings
      },
      messages,
      page,
      limit,
      pagination
    });
  } catch (error) {
    console.error('Error fetching room details:', error);
    res.status(500).json({ error: 'Failed to fetch room details', details: error.message });
  }
});

// Send message to chat room with rate limiting
router.post('/rooms/:roomId/messages', [
  roomMessageRateLimiter,
  authenticateToken,
  body('content').optional({ nullable: true }).trim().isLength({ max: 2000 }).withMessage('Message too long'),
  body('encryptedContent').optional().trim(),
  body('messageType').optional().isIn(MESSAGE_TYPES).withMessage('Invalid message type'),
  body('mediaType').optional({ nullable: true }).isIn(AUDIO_MEDIA_TYPES).withMessage('Invalid media type'),
  body('audio').optional().isObject().withMessage('audio must be an object'),
  body('commandData').optional().isObject().withMessage('commandData must be an object'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const { roomId } = req.params;
    const {
      content,
      encryptedContent,
      messageType,
      mediaType,
      audio,
      commandData,
      latitude,
      longitude
    } = req.body;
    const userId = req.user.userId;

    if (!content && !encryptedContent && mediaType !== 'audio') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    let normalizedAudio = null;
    if (mediaType === 'audio') {
      const parsedAudio = sanitizeAudioMetadata(audio);
      if (parsedAudio.error) {
        return res.status(400).json({ error: parsedAudio.error });
      }
      normalizedAudio = parsedAudio.value;
    } else if (audio) {
      return res.status(400).json({ error: 'audio metadata is only allowed when mediaType is audio' });
    }
    
    // Get room
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Get user to check location
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const memberIds = Array.isArray(room.members)
      ? room.members.map((member) => String(member))
      : [];
    const blockedRelation = await BlockList.findOne({
      $or: [
        { userId, blockedUserId: { $in: memberIds } },
        { userId: { $in: memberIds }, blockedUserId: userId }
      ]
    }).select('_id').lean();

    if (blockedRelation) {
      return res.status(403).json({ error: 'Cannot send messages due to block settings in this room' });
    }
    
    const isPrivilegedUser = isPrivilegedChatUser(user);
    if (!isPrivilegedUser) {
      const cooldown = await getGlobalChatCooldown(userId);
      if (!cooldown.allowed) {
        return res.status(429).json({
          error: 'Chat cooldown active',
          message: `You can send one chat message every 20 seconds. Try again in ${cooldown.retryAfter}s.`,
          retryAfter: cooldown.retryAfter
        });
      }
    }

    const contentFilter = await getContentFilterConfig();
    const bannedWord = findExactFilterWord(content, contentFilter.zeroToleranceWords);
    if (bannedWord) {
      return res.status(400).json({
        error: `You are attempting to use a word that is banned on this site "${bannedWord}".`
      });
    }
    
    // Create message
    const messageData = {
      roomId,
      userId,
      content,
      encryptedContent,
      isEncrypted: !!encryptedContent,
      messageType: normalizeMessageType(messageType),
      mediaType: mediaType === 'audio' ? 'audio' : null,
      audio: normalizedAudio,
      commandData: sanitizeCommandData(commandData),
      rateLimitKey: null
    };
    
    // Add location if provided
    if (latitude && longitude) {
      messageData.location = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      };
    } else if (user.location && user.location.coordinates[0] !== 0 && user.location.coordinates[1] !== 0) {
      // Use user's location if available
      messageData.location = user.location;
    }
    
    const savedMessage = new ChatMessage(messageData);
    await savedMessage.save();
    
    // Update room message count and last activity
    await room.incrementMessageCount();
    
    // Add user to room members if not already a member
    await room.addMember(userId);
    
    // Populate user info for response
    await savedMessage.populate('userId', 'username realName');

    const senderLabel = user.username || user.realName || 'Someone';
    await notifyRoomMembers({ room, senderId: userId, senderLabel, message: savedMessage });
    
    // Broadcast message via WebSocket (handled in server.js)
    const publicMessage = savedMessage.toPublicMessage();
    const realtimeMessage = decorateRoomMessageContent(publicMessage, contentFilter.maturityCensoredWords, false);
    const responseMessage = decorateRoomMessageContent(
      publicMessage,
      contentFilter.maturityCensoredWords,
      user.enableMaturityWordCensor !== false
    );

    emitChatMessage({
      userIds: room.members,
      message: realtimeMessage
    });
    
    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      messageData: responseMessage,
      rateLimit: {
        allowed: true,
        retryAfter: 0
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message', details: error.message });
  }
});

// Upload voice-note media (controlled endpoint)
router.post('/media/audio/upload-url', mediaUploadRateLimiter, authenticateToken, (req, res) => {
  audioUpload.single('audio')(req, res, async (uploadError) => {
    if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `Audio file exceeds ${MAX_AUDIO_SIZE_BYTES} bytes` });
    }
    if (uploadError) {
      return res.status(400).json({ error: uploadError.message || 'Invalid audio upload' });
    }

    try {
      const userId = req.user.userId;
      const roomId = String(req.body?.roomId || '').trim();
      const durationMs = parseInt(req.body?.durationMs, 10);
      const file = req.file;

      if (!roomId) {
        return res.status(400).json({ error: 'roomId is required' });
      }

      if (!file) {
        return res.status(400).json({ error: 'audio file is required' });
      }

      if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > MAX_AUDIO_DURATION_MS) {
        return res.status(400).json({ error: `durationMs must be between 1 and ${MAX_AUDIO_DURATION_MS}` });
      }

      const room = await ChatRoom.findById(roomId).select('_id members');
      if (!room) {
        return res.status(404).json({ error: 'Chat room not found' });
      }

      if (!isRoomMember(room, userId)) {
        return res.status(403).json({ error: 'You must be a room member to upload voice notes' });
      }

      let waveformBins = [];
      if (typeof req.body?.waveformBins === 'string' && req.body.waveformBins.trim()) {
        try {
          waveformBins = JSON.parse(req.body.waveformBins);
        } catch {
          return res.status(400).json({ error: 'waveformBins must be valid JSON array' });
        }
      }

      let normalizedBins;
      try {
        normalizedBins = sanitizeWaveformBins(waveformBins);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
      if (!normalizedBins) {
        return res.status(400).json({ error: `waveformBins must contain 1-${MAX_AUDIO_WAVEFORM_BINS} normalized values` });
      }

      const extension = AUDIO_EXT_BY_MIME[file.mimetype];
      if (!extension) {
        return res.status(400).json({ error: `Unsupported audio mime type: ${file.mimetype}` });
      }

      await fs.mkdir(AUDIO_UPLOAD_ROOT, { recursive: true });
      const storageKey = `${crypto.randomUUID()}.${extension}`;
      const destinationPath = path.join(AUDIO_UPLOAD_ROOT, storageKey);
      await fs.writeFile(destinationPath, file.buffer);

      return res.status(201).json({
        success: true,
        audio: {
          storageKey,
          url: `/api/chat/media/audio/${storageKey}`,
          durationMs,
          waveformBins: normalizedBins,
          mimeType: file.mimetype,
          sizeBytes: file.size
        },
        moderation: {
          transcriptionQueued: false
        }
      });
    } catch (error) {
      console.error('Error uploading chat audio:', error?.message || error);
      return res.status(500).json({ error: 'Failed to upload audio' });
    }
  });
});

// Authorized retrieval of stored chat media
const handleGetAudioMedia = async (req, res) => {
  try {
    const mediaId = String(req.params.mediaId || '').trim();
    if (!isValidAudioStorageKey(mediaId)) {
      return res.status(400).json({ error: 'Invalid media id' });
    }

    const message = await ChatMessage.findOne({
      mediaType: 'audio',
      'audio.storageKey': mediaId
    }).select('roomId audio').lean();

    if (!message?.audio?.storageKey) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const room = await ChatRoom.findById(message.roomId).select('_id members').lean();
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    if (!isRoomMember(room, req.user.userId)) {
      return res.status(403).json({ error: 'Not authorized to access this media' });
    }

    const filePath = path.join(AUDIO_UPLOAD_ROOT, mediaId);
    await fs.access(filePath);
    res.setHeader('Content-Type', message.audio.mimeType || 'application/octet-stream');
    return res.sendFile(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ error: 'Media not found' });
    }
    console.error('Error retrieving chat media:', error?.message || error);
    return res.status(500).json({ error: 'Failed to retrieve media' });
  }
};

router.get('/media/audio/:mediaId', mediaFetchRateLimiter, authenticateToken, handleGetAudioMedia);
router.get('/media/:mediaId', mediaFetchRateLimiter, authenticateToken, handleGetAudioMedia);

// Send E2EE message envelope only (no plaintext accepted)
router.post('/rooms/:roomId/messages/e2ee', [
  roomMessageRateLimiter,
  authenticateToken,
  roomWriteLimiter,
  body('content').not().exists().withMessage('Plaintext content is not allowed on E2EE endpoint'),
  body('encryptedContent').not().exists().withMessage('Legacy encryptedContent is not allowed on E2EE endpoint'),
  body('messageType').optional().isIn(MESSAGE_TYPES).withMessage('Invalid messageType'),
  body('commandData').optional().isObject().withMessage('commandData must be an object'),
  body('e2ee').custom((value) => {
    const envelopeError = validateE2EEEnvelope(value);
    if (envelopeError) {
      throw new Error(envelopeError);
    }
    return true;
  }),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { roomId } = req.params;
    const {
      e2ee,
      messageType,
      commandData,
      latitude,
      longitude
    } = req.body;
    const userId = req.user.userId;

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const memberIds = Array.isArray(room.members)
      ? room.members.map((member) => String(member))
      : [];
    const blockedRelation = await BlockList.findOne({
      $or: [
        { userId, blockedUserId: { $in: memberIds } },
        { userId: { $in: memberIds }, blockedUserId: userId }
      ]
    }).select('_id').lean();

    if (blockedRelation) {
      return res.status(403).json({ error: 'Cannot send messages due to block settings in this room' });
    }

    const ownedDevice = await DeviceKey.findOne({
      userId,
      deviceId: e2ee.senderDeviceId,
      isRevoked: false
    }).lean();

    if (!ownedDevice) {
      return res.status(403).json({ error: 'Sender device is not registered for this user or has been revoked' });
    }

    const duplicateMessage = await ChatMessage.findOne({
      'e2ee.enabled': true,
      'e2ee.senderDeviceId': e2ee.senderDeviceId,
      'e2ee.clientMessageId': e2ee.clientMessageId
    }).select('_id').lean();

    if (duplicateMessage) {
      return res.status(409).json({ error: 'Duplicate clientMessageId for sender device' });
    }

    const isPrivilegedUser = isPrivilegedChatUser(user);
    if (!isPrivilegedUser) {
      const cooldown = await getGlobalChatCooldown(userId);
      if (!cooldown.allowed) {
        return res.status(429).json({
          error: 'Chat cooldown active',
          message: `You can send one chat message every 20 seconds. Try again in ${cooldown.retryAfter}s.`,
          retryAfter: cooldown.retryAfter
        });
      }
    }

    const messageData = {
      roomId,
      userId,
      content: null,
      encryptedContent: null,
      isEncrypted: true,
      messageType: normalizeMessageType(messageType),
      commandData: sanitizeCommandData(commandData),
      rateLimitKey: null,
      e2ee: {
        enabled: true,
        migrationFlag: 'native-e2ee',
        version: e2ee.version,
        senderDeviceId: e2ee.senderDeviceId,
        clientMessageId: e2ee.clientMessageId,
        keyVersion: e2ee.keyVersion,
        nonce: e2ee.nonce,
        aad: e2ee.aad || '',
        ciphertext: e2ee.ciphertext,
        signature: e2ee.signature,
        ciphertextHash: e2ee.ciphertextHash,
        algorithms: {
          cipher: e2ee.algorithms.cipher,
          signature: e2ee.algorithms.signature,
          hash: e2ee.algorithms.hash
        }
      }
    };

    if (latitude && longitude) {
      messageData.location = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      };
    } else if (user.location && user.location.coordinates[0] !== 0 && user.location.coordinates[1] !== 0) {
      messageData.location = user.location;
    }

    const savedMessage = new ChatMessage(messageData);
    await savedMessage.save();

    await room.incrementMessageCount();
    await room.addMember(userId);
    await savedMessage.populate('userId', 'username realName');

    const senderLabel = user.username || user.realName || 'Someone';
    await notifyRoomMembers({ room, senderId: userId, senderLabel, message: savedMessage });

    const publicMessage = savedMessage.toPublicMessage();
    emitChatMessage({
      userIds: room.members,
      message: publicMessage
    });

    return res.status(201).json({
      success: true,
      message: 'E2EE message envelope accepted',
      messageData: publicMessage,
      rateLimit: {
        allowed: true,
        retryAfter: 0
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Duplicate clientMessageId for sender device' });
    }
    console.error('Error sending E2EE message envelope:', error?.message || error);
    return res.status(500).json({ error: 'Failed to send E2EE message envelope' });
  }
});

// Register or rotate an authenticated user's device keys
router.get('/devices', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const devices = await DeviceKey.find({ userId })
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      devices: devices.map((device) => ({
        id: device._id,
        deviceId: device.deviceId,
        keyVersion: device.keyVersion,
        algorithms: device.algorithms,
        isRevoked: !!device.isRevoked,
        revokedAt: device.revokedAt || null,
        updatedAt: device.updatedAt,
        createdAt: device.createdAt
      }))
    });
  } catch (error) {
    console.error('Error loading devices:', error?.message || error);
    return res.status(500).json({ error: 'Failed to load devices' });
  }
});

router.post('/devices/keys', [
  authenticateToken,
  body('deviceId').isString().trim().isLength({ min: 1, max: E2EE_LIMITS.deviceId }),
  body('keyVersion').isInt({ min: 1, max: 1000000 }),
  body('publicEncryptionKey').isString().isLength({ min: 1, max: E2EE_LIMITS.publicKey }),
  body('publicSigningKey').isString().isLength({ min: 1, max: E2EE_LIMITS.publicKey }),
  body('algorithms').isObject(),
  body('algorithms.encryption').isString().trim().isLength({ min: 1, max: E2EE_LIMITS.algorithm }),
  body('algorithms.signing').isString().trim().isLength({ min: 1, max: E2EE_LIMITS.algorithm })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const userId = req.user.userId;
    const { deviceId, keyVersion, publicEncryptionKey, publicSigningKey, algorithms } = req.body;

    const deviceKey = await DeviceKey.findOneAndUpdate(
      { userId, deviceId },
      {
        $set: {
          keyVersion,
          publicEncryptionKey,
          publicSigningKey,
          algorithms: {
            encryption: algorithms.encryption,
            signing: algorithms.signing
          },
          isRevoked: false,
          revokedAt: null,
          updatedAt: new Date()
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    await logSecurityEvent({
      userId,
      eventType: 'device_key_registered',
      req,
      metadata: { deviceId }
    });

    return res.status(201).json({
      success: true,
      message: 'Device key registered',
      device: {
        deviceId: deviceKey.deviceId,
        keyVersion: deviceKey.keyVersion,
        algorithms: deviceKey.algorithms,
        isRevoked: deviceKey.isRevoked,
        updatedAt: deviceKey.updatedAt
      }
    });

  } catch (error) {
    console.error('Error registering device key:', error?.message || error);
    return res.status(500).json({ error: 'Failed to register device key' });
  }
});

// Revoke a device key for the authenticated user
router.delete('/devices/keys/:deviceId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { deviceId } = req.params;

    if (!deviceId || deviceId.length > E2EE_LIMITS.deviceId) {
      return res.status(400).json({ error: 'Invalid deviceId' });
    }

    const deviceKey = await DeviceKey.findOneAndUpdate(
      { userId, deviceId },
      {
        $set: {
          isRevoked: true,
          revokedAt: new Date(),
          updatedAt: new Date()
        }
      },
      { new: true }
    ).lean();

    if (!deviceKey) {
      return res.status(404).json({ error: 'Device key not found' });
    }

    await logSecurityEvent({
      userId,
      eventType: 'device_key_revoked',
      req,
      severity: 'warning',
      metadata: { deviceId }
    });

    return res.json({
      success: true,
      message: 'Device key revoked',
      device: {
        deviceId: deviceKey.deviceId,
        isRevoked: deviceKey.isRevoked,
        revokedAt: deviceKey.revokedAt
      }
    });
  } catch (error) {
    console.error('Error revoking device key:', error?.message || error);
    return res.status(500).json({ error: 'Failed to revoke device key' });
  }
});

// Publish wrapped room key package(s) for recipient devices
router.post('/rooms/:roomId/keys/packages', [
  authenticateToken,
  body('packages').isArray({ min: 1, max: 200 }).withMessage('packages must be an array with at least one package')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { roomId } = req.params;
    const userId = req.user.userId;
    const { packages } = req.body;

    const room = await ChatRoom.findById(roomId).select('_id');
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const validatedPackages = [];
    for (const payload of packages) {
      const packageError = validateRoomKeyPackagePayload(payload);
      if (packageError) {
        return res.status(400).json({ error: packageError });
      }

      const senderDevice = await DeviceKey.findOne({
        userId,
        deviceId: payload.senderDeviceId,
        isRevoked: false
      }).select('_id').lean();

      if (!senderDevice) {
        return res.status(403).json({ error: `Sender device ${payload.senderDeviceId} is not active for authenticated user` });
      }

      validatedPackages.push({
        roomId,
        senderUserId: userId,
        senderDeviceId: payload.senderDeviceId,
        recipientUserId: payload.recipientUserId,
        recipientDeviceId: payload.recipientDeviceId,
        keyVersion: payload.keyVersion,
        wrappedRoomKey: payload.wrappedRoomKey,
        nonce: payload.nonce,
        aad: payload.aad || '',
        signature: payload.signature || '',
        wrappedKeyHash: payload.wrappedKeyHash || '',
        algorithms: {
          encryption: payload.algorithms.encryption,
          wrapping: payload.algorithms.wrapping || '',
          signing: payload.algorithms.signing || '',
          hash: payload.algorithms.hash || ''
        }
      });
    }

    const upsertResults = [];
    for (const packageDoc of validatedPackages) {
      const savedDoc = await RoomKeyPackage.findOneAndUpdate(
        {
          roomId: packageDoc.roomId,
          senderDeviceId: packageDoc.senderDeviceId,
          recipientDeviceId: packageDoc.recipientDeviceId,
          keyVersion: packageDoc.keyVersion
        },
        { $set: packageDoc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();

      upsertResults.push({
        id: savedDoc._id,
        recipientUserId: savedDoc.recipientUserId,
        recipientDeviceId: savedDoc.recipientDeviceId,
        keyVersion: savedDoc.keyVersion,
        createdAt: savedDoc.createdAt
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Room key packages stored',
      count: upsertResults.length,
      packages: upsertResults
    });
  } catch (error) {
    console.error('Error publishing room key packages:', error?.message || error);
    return res.status(500).json({ error: 'Failed to publish room key packages' });
  }
});

// Sync wrapped room key packages for one of the authenticated user's devices
router.get('/rooms/:roomId/keys/packages/sync', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.userId;
    const { deviceId, since } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

    if (!deviceId || typeof deviceId !== 'string' || deviceId.length > E2EE_LIMITS.deviceId) {
      return res.status(400).json({ error: 'Valid deviceId query parameter is required' });
    }

    const room = await ChatRoom.findById(roomId).select('_id');
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const ownedDevice = await DeviceKey.findOne({
      userId,
      deviceId,
      isRevoked: false
    }).select('_id').lean();

    if (!ownedDevice) {
      return res.status(403).json({ error: 'Device is not registered for authenticated user or has been revoked' });
    }

    const filter = {
      roomId,
      recipientUserId: userId,
      recipientDeviceId: deviceId
    };

    if (since) {
      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        return res.status(400).json({ error: 'Invalid since timestamp' });
      }
      filter.createdAt = { $gt: sinceDate };
    }

    const packages = await RoomKeyPackage.find(filter)
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    const packageIds = packages.map((pkg) => pkg._id);
    if (packageIds.length > 0) {
      await RoomKeyPackage.updateMany(
        { _id: { $in: packageIds }, deliveredAt: null },
        { $set: { deliveredAt: new Date() } }
      );
    }

    return res.json({
      success: true,
      roomId,
      deviceId,
      count: packages.length,
      packages: packages.map((pkg) => ({
        _id: pkg._id,
        roomId: pkg.roomId,
        senderUserId: pkg.senderUserId,
        senderDeviceId: pkg.senderDeviceId,
        recipientUserId: pkg.recipientUserId,
        recipientDeviceId: pkg.recipientDeviceId,
        keyVersion: pkg.keyVersion,
        wrappedRoomKey: pkg.wrappedRoomKey,
        nonce: pkg.nonce,
        aad: pkg.aad,
        signature: pkg.signature,
        wrappedKeyHash: pkg.wrappedKeyHash,
        algorithms: pkg.algorithms,
        createdAt: pkg.createdAt,
        deliveredAt: pkg.deliveredAt || null
      }))
    });
  } catch (error) {
    console.error('Error syncing room key packages:', error?.message || error);
    return res.status(500).json({ error: 'Failed to sync room key packages' });
  }
});

// Get message history for a room
router.get('/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const cursor = req.query.cursor;
    const limit = parseMessageLimit(req.query.limit);
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    const [contentFilter, censorEnabled] = await Promise.all([
      getContentFilterConfig(),
      getViewerContentFilterPreference(req.user.userId)
    ]);
    
    let messages = [];
    let pagination = {
      mode: 'page',
      page,
      limit,
      hasMore: false,
      nextCursor: null
    };

    if (cursor) {
      const parsedCursor = decodeMessageCursor(cursor);
      if (parsedCursor.error) {
        return res.status(400).json({ error: parsedCursor.error });
      }

      const cursorResult = await ChatMessage.getRoomMessagesByCursor(roomId, {
        limit,
        beforeCreatedAt: parsedCursor.createdAt,
        beforeId: parsedCursor.id
      });

      messages = cursorResult.messages.map((message) => (
        decorateRoomMessageContent(message, contentFilter.maturityCensoredWords, censorEnabled)
      ));
      pagination = {
        mode: 'cursor',
        limit: cursorResult.limit,
        hasMore: cursorResult.hasMore,
        nextCursor: cursorResult.hasMore && cursorResult.cursorSource
          ? encodeMessageCursor(cursorResult.cursorSource.createdAt, cursorResult.cursorSource._id)
          : null
      };
    } else {
      messages = (await ChatMessage.getRoomMessages(roomId, page, limit)).map((message) => (
        decorateRoomMessageContent(message, contentFilter.maturityCensoredWords, censorEnabled)
      ));
      pagination.hasMore = messages.length === limit;
      pagination.nextCursor = messages.length > 0
        ? encodeMessageCursor(messages[0].createdAt, messages[0]._id)
        : null;
    }
    
    res.json({
      success: true,
      messages,
      page,
      limit,
      pagination,
      room: {
        name: room.name,
        type: room.type,
        city: room.city
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
  }
});

// Migrate a legacy message to E2EE envelope format (idempotent)
router.post('/rooms/:roomId/messages/:messageId/migrate-e2ee', [
  authenticateToken,
  roomWriteLimiter,
  body('content').not().exists().withMessage('Plaintext content is not allowed on migration endpoint'),
  body('encryptedContent').not().exists().withMessage('Legacy encryptedContent is not allowed on migration endpoint'),
  body('e2ee').custom((value) => {
    const envelopeError = validateE2EEEnvelope(value);
    if (envelopeError) {
      throw new Error(envelopeError);
    }
    return true;
  })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { roomId, messageId } = req.params;
    const { e2ee } = req.body;
    const userId = req.user.userId;

    const room = await ChatRoom.findById(roomId).select('_id');
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const message = await ChatMessage.findOne({ _id: messageId, roomId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (String(message.userId) !== String(userId)) {
      return res.status(403).json({ error: 'Only the original sender can migrate this message' });
    }

    const ownedDevice = await DeviceKey.findOne({
      userId,
      deviceId: e2ee.senderDeviceId,
      isRevoked: false
    }).lean();

    if (!ownedDevice) {
      return res.status(403).json({ error: 'Sender device is not registered for this user or has been revoked' });
    }

    const duplicateMessage = await ChatMessage.findOne({
      _id: { $ne: message._id },
      'e2ee.enabled': true,
      'e2ee.senderDeviceId': e2ee.senderDeviceId,
      'e2ee.clientMessageId': e2ee.clientMessageId
    }).select('_id').lean();

    if (duplicateMessage) {
      return res.status(409).json({ error: 'Duplicate clientMessageId for sender device' });
    }

    if (message?.e2ee?.enabled) {
      const sameEnvelope = message.e2ee.senderDeviceId === e2ee.senderDeviceId
        && message.e2ee.version === e2ee.version
        && message.e2ee.clientMessageId === e2ee.clientMessageId
        && message.e2ee.keyVersion === e2ee.keyVersion
        && message.e2ee.nonce === e2ee.nonce
        && (message.e2ee.aad || '') === (e2ee.aad || '')
        && message.e2ee.ciphertext === e2ee.ciphertext
        && message.e2ee.signature === e2ee.signature
        && message.e2ee.ciphertextHash === e2ee.ciphertextHash
        && (message.e2ee.algorithms?.cipher || '') === (e2ee.algorithms?.cipher || '')
        && (message.e2ee.algorithms?.signature || '') === (e2ee.algorithms?.signature || '')
        && (message.e2ee.algorithms?.hash || '') === (e2ee.algorithms?.hash || '');

      if (sameEnvelope) {
        return res.status(200).json({
          success: true,
          idempotent: true,
          message: 'Message is already migrated to the same E2EE envelope',
          messageData: message.toPublicMessage()
        });
      }

      return res.status(409).json({ error: 'Message is already migrated with a different E2EE envelope' });
    }

    const hasLegacyPlaintext = typeof message.content === 'string' && message.content.length > 0;
    const hasLegacyEncryptedContent = typeof message.encryptedContent === 'string' && message.encryptedContent.length > 0;
    const migratedFromMessageFormat = hasLegacyPlaintext
      ? 'legacy-plaintext'
      : (hasLegacyEncryptedContent ? 'legacy-encrypted-content' : null);

    message.content = null;
    message.encryptedContent = null;
    message.isEncrypted = true;
    message.e2ee = {
      enabled: true,
      migrationFlag: 'migrated',
      version: e2ee.version,
      senderDeviceId: e2ee.senderDeviceId,
      clientMessageId: e2ee.clientMessageId,
      keyVersion: e2ee.keyVersion,
      nonce: e2ee.nonce,
      aad: e2ee.aad || '',
      ciphertext: e2ee.ciphertext,
      signature: e2ee.signature,
      ciphertextHash: e2ee.ciphertextHash,
      algorithms: {
        cipher: e2ee.algorithms.cipher,
        signature: e2ee.algorithms.signature,
        hash: e2ee.algorithms.hash
      },
      migratedAt: new Date(),
      plaintextTombstoned: true,
      migratedFromMessageFormat,
      migrationActorUserId: userId
    };

    await message.save();
    await message.populate('userId', 'username realName');

    return res.status(200).json({
      success: true,
      idempotent: false,
      message: 'Legacy message migrated to E2EE envelope',
      messageData: message.toPublicMessage()
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Duplicate clientMessageId for sender device' });
    }
    console.error('Error migrating message to E2EE envelope:', error?.message || error);
    return res.status(500).json({ error: 'Failed to migrate message to E2EE envelope' });
  }
});

// Create a new chat room (admin only)
router.post('/rooms', [
  authenticateToken,
  body('name').trim().notEmpty().withMessage('Room name is required'),
  body('type').isIn(['city', 'state', 'county']).withMessage('Invalid room type'),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').optional().trim(),
  body('country').optional().trim(),
  body('radius').optional().isInt({ min: 1, max: 500 }).withMessage('Radius must be between 1 and 500 miles')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const { name, type, latitude, longitude, city, state, country, radius = 50 } = req.body;
    const createdBy = req.user.userId;
    
    // Check if room already exists for this location
    const existingRoom = await ChatRoom.findOne({
      type,
      city,
      state,
      country,
      'location.coordinates': [parseFloat(longitude), parseFloat(latitude)]
    });
    
    if (existingRoom) {
      return res.status(409).json({ error: 'Chat room already exists for this location' });
    }
    
    const room = new ChatRoom({
      name,
      type,
      createdBy,
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      },
      radius,
      city,
      state,
      country
    });
    
    await room.save();
    
    res.status(201).json({
      success: true,
      message: 'Chat room created successfully',
      room
    });
  } catch (error) {
    console.error('Error creating chat room:', error);
    res.status(500).json({ error: 'Failed to create chat room', details: error.message });
  }
});

router.delete('/rooms/:roomId', roomWriteLimiter, authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const requesterId = String(req.user.userId || '');
    const requester = await User.findById(requesterId).select('_id isAdmin').lean();

    if (!requester) {
      return res.status(404).json({ error: 'User not found' });
    }

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const ownerId = String(room.createdBy || '');
    const canDelete = Boolean(requester.isAdmin) || (ownerId && ownerId === requesterId);
    if (!canDelete) {
      return res.status(403).json({ error: 'Only the room owner or an admin can delete this chat room' });
    }

    if (room.stableKey || room.eventRef || room.autoLifecycle) {
      return res.status(403).json({ error: 'This chat room cannot be deleted' });
    }

    await Promise.all([
      ChatMessage.deleteMany({ roomId: room._id }),
      RoomKeyPackage.deleteMany({ roomId: room._id }),
      room.deleteOne()
    ]);

    return res.json({
      success: true,
      message: 'Chat room deleted successfully',
      roomId: String(room._id)
    });
  } catch (error) {
    console.error('Error deleting room:', error);
    return res.status(500).json({ error: 'Failed to delete chat room', details: error.message });
  }
});

// Join a chat room
router.post('/rooms/:roomId/join', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.userId;
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const joiningUser = await User.findById(userId).select('username realName').lean();
    if (!joiningUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const wasMember = isRoomMember(room, userId);
    
    await room.addMember(userId);

    let systemMessage = null;
    if (!wasMember) {
      const displayName = joiningUser.username || joiningUser.realName || 'user';
      const event = await createRoomEventMessage({
        roomId,
        userId,
        content: `${displayName} joined ${room.name || 'the room'}`,
        messageType: 'system',
        commandData: {
          command: 'join',
          targetUserId: String(joiningUser._id),
          targetUsername: displayName
        }
      });
      await room.incrementMessageCount();
      systemMessage = event.toPublicMessage();
      emitChatMessage({
        userIds: room.members,
        message: systemMessage
      });
    }
    
    res.json({
      success: true,
      message: 'Joined chat room successfully',
      systemMessage,
      room: {
        _id: room._id,
        name: room.name,
        memberCount: room.members.length
      }
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join chat room', details: error.message });
  }
});

// Leave a chat room
router.post('/rooms/:roomId/leave', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.userId;
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const leavingUser = await User.findById(userId).select('username realName').lean();
    if (!leavingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const wasMember = isRoomMember(room, userId);
    
    await room.removeMember(userId);

    let systemMessage = null;
    if (wasMember) {
      const displayName = leavingUser.username || leavingUser.realName || 'user';
      const event = await createRoomEventMessage({
        roomId,
        userId,
        content: `${displayName} left ${room.name || 'the room'}`,
        messageType: 'system',
        commandData: {
          command: 'leave',
          targetUserId: String(leavingUser._id),
          targetUsername: displayName
        }
      });
      await room.incrementMessageCount();
      systemMessage = event.toPublicMessage();
      emitChatMessage({
        userIds: [userId, ...(Array.isArray(room.members) ? room.members : [])],
        message: systemMessage
      });
    }
    
    res.json({
      success: true,
      message: 'Left chat room successfully',
      systemMessage,
      room: {
        _id: room._id,
        name: room.name,
        memberCount: room.members.length
      }
    });
  } catch (error) {
    console.error('Error leaving room:', error);
    res.status(500).json({ error: 'Failed to leave chat room', details: error.message });
  }
});

// List room members for slash /list UX
router.get('/rooms/:roomId/users', roomReadLimiter, authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await ChatRoom.findById(roomId).select('_id name members').lean();

    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const memberIds = Array.isArray(room.members) ? room.members : [];
    const [users, presenceMap] = await Promise.all([
      memberIds.length > 0
        ? User.find({ _id: { $in: memberIds } }).select('_id username realName mutedUntil realtimePreferences').lean()
        : [],
      getPresenceMapForUsers(memberIds)
    ]);

    const sortedUsers = users
        .map((u) => ({
          _id: u._id,
          username: u.username || null,
          realName: u.realName || null,
          mutedUntil: u.mutedUntil || null,
          presence: buildPresencePayload(u._id, presenceMap.get(String(u._id)), u.realtimePreferences)
        }))
      .sort((a, b) => {
        const aName = (a.username || a.realName || '').toLowerCase();
        const bName = (b.username || b.realName || '').toLowerCase();
        if (aName < bName) return -1;
        if (aName > bName) return 1;
        return 0;
      });

    return res.json({
      success: true,
      room: {
        _id: room._id,
        name: room.name,
        memberCount: sortedUsers.length
      },
      users: sortedUsers
    });
  } catch (error) {
    console.error('Error listing room users:', error);
    return res.status(500).json({ error: 'Failed to list room users', details: error.message });
  }
});

// Sync user's location rooms - trigger room creation/joining based on current location
router.post('/rooms/sync-location', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const coordinates = getNormalizedCoordinates(user.location);
    if (!coordinates) {
      const userRooms = await ChatRoom.find({ members: userId })
        .select('_id name type city state country zipCode location radius memberCount lastActivity')
        .lean();

      return res.json({
        success: true,
        message: 'Location unavailable. Skipped location room sync.',
        createdRooms: [],
        allRooms: userRooms.map(room => ({
          _id: room._id,
          name: room.name,
          type: room.type,
          zipCode: room.zipCode,
          city: room.city,
          state: room.state,
          country: room.country,
          location: room.location,
          radius: room.radius,
          memberCount: room.memberCount || (room.members ? room.members.length : 0),
          lastActivity: room.lastActivity
        }))
      });
    }
    
    await ChatRoom.ensureDefaultStateRooms();

    // Sync location rooms
    const result = await ChatRoom.syncUserLocationRooms({
      ...toPlainDoc(user),
      location: {
        ...(toPlainDoc(user.location) || {}),
        coordinates
      }
    });
    
    // Get all rooms the user is now a member of (including existing ones)
    const userRooms = await ChatRoom.find({ members: userId })
      .select('_id name type city state country zipCode location radius memberCount lastActivity')
      .lean();
    
    return res.json({
      success: true,
      message: `Location rooms synced. ${result.created} new room(s) created.`,
      createdRooms: result.rooms.map(room => ({
        _id: room._id,
        name: room.name,
        type: room.type
      })),
      allRooms: userRooms.map(room => ({
        _id: room._id,
        name: room.name,
        type: room.type,
        zipCode: room.zipCode,
        city: room.city,
        state: room.state,
        country: room.country,
        location: room.location,
        radius: room.radius,
        memberCount: room.memberCount || (room.members ? room.members.length : 0),
        lastActivity: room.lastActivity
      }))
    });
  } catch (error) {
    console.error('Error syncing location rooms:', error);
    return res.status(500).json({ error: 'Failed to sync location rooms', details: error.message });
  }
});

// Get nearby location rooms
router.get('/rooms/nearby', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { latitude, longitude, radius = 50 } = req.query;
    
    let lat, lon;
    
    if (latitude && longitude) {
      lat = parseFloat(latitude);
      lon = parseFloat(longitude);
    } else {
      // Get user's current location
      const user = await User.findById(userId);
      if (!user || !user.location || !user.location.coordinates) {
        return res.status(400).json({ error: 'User location not set. Provide latitude/longitude or update your profile location.' });
      }
      [lon, lat] = user.location.coordinates;
    }
    
    const maxRadius = Math.min(Math.max(parseInt(radius, 10) || 50, 1), 200);
    
    // Find nearby rooms using geospatial query
    const nearbyRooms = await ChatRoom.findNearby(lon, lat, maxRadius);
    const allowedRooms = nearbyRooms.filter((room) => (
      room.type === 'state' || (room.type === 'city' && room.zipCode)
    ));
    
    return res.json({
      success: true,
      location: { latitude: lat, longitude: lon },
      radius: maxRadius,
      rooms: allowedRooms.map(room => ({
        _id: room._id,
        name: room.name,
        type: room.type,
        zipCode: room.zipCode,
        city: room.city,
        state: room.state,
        country: room.country,
        location: room.location,
        radius: room.radius,
        memberCount: room.memberCount || (room.members ? room.members.length : 0),
        lastActivity: room.lastActivity,
        isMember: room.members && room.members.some(m => String(m) === String(userId))
      }))
    });
  } catch (error) {
    console.error('Error finding nearby rooms:', error);
    return res.status(500).json({ error: 'Failed to find nearby rooms', details: error.message });
  }
});

router.get('/zip/nearby', unifiedChatLimiter, authenticateToken, async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId).select('zipCode').lean();
    const normalizedZipCode = normalizeZipCode(req.query.zipCode || requester?.zipCode);
    if (!normalizedZipCode) {
      return res.status(400).json({ error: 'A valid zip code is required' });
    }

    const nearbyRooms = await getNearbyActiveZipRooms(normalizedZipCode);
    return res.json({
      success: true,
      zipCode: normalizedZipCode,
      rooms: nearbyRooms.map((room) => ({
        _id: room._id,
        type: 'zip-room',
        title: room.title || `Zip ${room.zipCode}`,
        zipCode: room.zipCode,
        messageCount: room.messageCount || 0,
        lastMessageAt: room.lastMessageAt || null
      }))
    });
  } catch (error) {
    console.error('Error fetching nearby zip rooms:', error);
    return res.status(500).json({ error: 'Failed to fetch nearby zip rooms' });
  }
});

router.get('/conversations', unifiedChatLimiter, authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('_id username realName zipCode').lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const normalizedZipCode = normalizeZipCode(user.zipCode);
    let currentZipConversation = null;
    if (normalizedZipCode) {
      currentZipConversation = await ChatConversation.findOneAndUpdate(
        { type: 'zip-room', zipCode: normalizedZipCode },
        { $setOnInsert: { title: `Zip ${normalizedZipCode}`, zipCode: normalizedZipCode, participants: [] } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
    }

    const [nearbyZipConversations, dmConversations, profileConversations] = await Promise.all([
      getNearbyActiveZipRooms(normalizedZipCode),
      ChatConversation.find({ type: 'dm', participants: userId }).sort({ lastMessageAt: -1 }).lean(),
      ChatConversation.find({ type: 'profile-thread', participants: userId }).sort({ lastMessageAt: -1 }).lean()
    ]);

    const relatedUserIds = new Set();
    [...dmConversations, ...profileConversations].forEach((conversation) => {
      (conversation.participants || []).forEach((participantId) => relatedUserIds.add(String(participantId)));
      if (conversation.profileUserId) {
        relatedUserIds.add(String(conversation.profileUserId));
      }
    });

    const [relatedUsers, presenceMap] = await Promise.all([
      relatedUserIds.size > 0
        ? User.find({ _id: { $in: [...relatedUserIds] } }).select('_id username realName realtimePreferences').lean()
        : [],
      getPresenceMapForUsers([...relatedUserIds])
    ]);
    const usersById = new Map(relatedUsers.map((relatedUser) => [String(relatedUser._id), relatedUser]));

    return res.json({
      success: true,
      conversations: {
        zip: {
          current: currentZipConversation
            ? formatConversationSummary(currentZipConversation, usersById, userId, presenceMap)
            : null,
          nearby: nearbyZipConversations.map((conversation) => formatConversationSummary(conversation, usersById, userId, presenceMap))
        },
        dm: dmConversations.map((conversation) => formatConversationSummary(conversation, usersById, userId, presenceMap)),
        profile: profileConversations.map((conversation) => formatConversationSummary(conversation, usersById, userId, presenceMap))
      }
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

router.get('/conversations/:conversationId/messages', unifiedChatLimiter, optionalAuthenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?.userId || null;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const skip = (page - 1) * limit;

    const conversation = await resolveLeanDoc(ChatConversation.findById(conversationId));
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.type === 'profile-thread') {
      const permissions = await resolveProfileThreadPermissions(conversation, userId);
      if (!permissions.canRead) {
        return res.status(403).json({ error: 'Access denied for this conversation' });
      }
    } else if (!canAccessConversation(conversation, userId)) {
      return res.status(403).json({ error: 'Access denied for this conversation' });
    }

    const messages = await ConversationMessage.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', '_id username realName')
      .lean();

    const total = await ConversationMessage.countDocuments({ conversationId });

    const publicMessages = messages.reverse().map((message) => (
      ConversationMessage.toPublicMessageShape(message, { conversationType: conversation.type })
    ));

    return res.json({
      success: true,
      conversation: {
        _id: conversation._id,
        type: conversation.type,
        title: conversation.title,
        zipCode: conversation.zipCode || null,
        profileUserId: conversation.profileUserId || null,
        profileThreadAccess: conversation.type === 'profile-thread'
          ? normalizeProfileThreadAccess(conversation.profileThreadAccess)
          : undefined
      },
      messages: publicMessages,
      page,
      limit,
      hasMore: skip + messages.length < total
    });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    return res.status(500).json({ error: 'Failed to fetch conversation messages' });
  }
});

router.get('/conversations/:conversationId/users', unifiedChatLimiter, authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.userId;

    const conversation = await resolveLeanDoc(ChatConversation.findById(conversationId));
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.type === 'profile-thread') {
      const permissions = await resolveProfileThreadPermissions(conversation, userId);
      if (!permissions.canRead) {
        return res.status(403).json({ error: 'Access denied for this conversation' });
      }
    } else if (!canAccessConversation(conversation, userId)) {
      return res.status(403).json({ error: 'Access denied for this conversation' });
    }

    const participantIds = new Set(
      Array.isArray(conversation.participants)
        ? conversation.participants.map((participant) => String(participant))
        : []
    );

    if (conversation.type === 'zip-room') {
      const recentMessages = await ConversationMessage.find({ conversationId })
        .sort({ createdAt: -1 })
        .limit(200)
        .select('userId')
        .lean();
      recentMessages.forEach((message) => {
        if (message?.userId) {
          participantIds.add(String(message.userId));
        }
      });
    }

    if (participantIds.size === 0) {
      participantIds.add(String(userId));
    }

    const [users, presenceMap] = await Promise.all([
      User.find({ _id: { $in: [...participantIds] } })
        .select('_id username realName mutedUntil realtimePreferences')
        .lean(),
      getPresenceMapForUsers([...participantIds])
    ]);

    const sortedUsers = users
      .map((u) => ({
        _id: u._id,
        username: u.username || null,
        realName: u.realName || null,
        mutedUntil: u.mutedUntil || null,
        presence: buildPresencePayload(u._id, presenceMap.get(String(u._id)), u.realtimePreferences)
      }))
      .sort((a, b) => {
        const aName = (a.username || a.realName || '').toLowerCase();
        const bName = (b.username || b.realName || '').toLowerCase();
        if (aName < bName) return -1;
        if (aName > bName) return 1;
        return 0;
      });

    return res.json({
      success: true,
      conversation: {
        _id: conversation._id,
        type: conversation.type,
        title: conversation.title || ''
      },
      users: sortedUsers
    });
  } catch (error) {
    console.error('Error fetching conversation users:', error);
    return res.status(500).json({ error: 'Failed to fetch conversation users' });
  }
});

router.get('/conversations/:conversationId/devices', unifiedChatLimiter, authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.userId;

    const conversation = await resolveLeanDoc(ChatConversation.findById(conversationId));
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (!canAccessConversation(conversation, userId)) {
      return res.status(403).json({ error: 'Access denied for this conversation' });
    }

    const participantIds = getConversationParticipantIds(conversation);
    const activeDevices = participantIds.length > 0
      ? await DeviceKey.find({
        userId: { $in: participantIds },
        isRevoked: false
      })
        .select('userId deviceId keyVersion publicEncryptionKey publicSigningKey algorithms updatedAt')
        .sort({ updatedAt: -1 })
        .lean()
      : [];

    return res.json({
      success: true,
      conversationId,
      devices: activeDevices.map((device) => ({
        userId: device.userId,
        deviceId: device.deviceId,
        keyVersion: device.keyVersion,
        publicEncryptionKey: device.publicEncryptionKey,
        publicSigningKey: device.publicSigningKey,
        algorithms: device.algorithms,
        updatedAt: device.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error loading conversation devices:', error?.message || error);
    return res.status(500).json({ error: 'Failed to load conversation devices' });
  }
});

router.post(
  '/conversations/:conversationId/keys/packages',
  unifiedChatLimiter,
  authenticateToken,
  body('packages').isArray({ min: 1, max: 200 }).withMessage('packages must be an array with at least one package'),
  async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { conversationId } = req.params;
    const userId = req.user.userId;
    const { packages } = req.body;

    const conversation = await resolveLeanDoc(ChatConversation.findById(conversationId));
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (conversation.type !== 'dm') {
      return res.status(400).json({ error: 'Conversation key packages are only supported for DM conversations' });
    }
    if (!canAccessConversation(conversation, userId)) {
      return res.status(403).json({ error: 'Access denied for this conversation' });
    }
    const participantIds = getConversationParticipantIds(conversation);

    const validatedPackages = [];
    for (const payload of packages) {
      const packageError = validateRoomKeyPackagePayload(payload);
      if (packageError) {
        return res.status(400).json({ error: packageError });
      }

      if (!participantIds.includes(String(payload.recipientUserId))) {
        return res.status(403).json({ error: `recipientUserId ${payload.recipientUserId} is not a participant in this conversation` });
      }

      const [senderDevice, recipientDevice] = await Promise.all([
        DeviceKey.findOne({
          userId,
          deviceId: payload.senderDeviceId,
          isRevoked: false
        }).select('_id').lean(),
        DeviceKey.findOne({
          userId: payload.recipientUserId,
          deviceId: payload.recipientDeviceId,
          isRevoked: false
        }).select('_id').lean()
      ]);

      if (!senderDevice) {
        return res.status(403).json({ error: `Sender device ${payload.senderDeviceId} is not active for authenticated user` });
      }
      if (!recipientDevice) {
        return res.status(400).json({ error: `Recipient device ${payload.recipientDeviceId} is not active for recipient user` });
      }

      validatedPackages.push({
        conversationId,
        senderUserId: userId,
        senderDeviceId: payload.senderDeviceId,
        senderPublicKey: payload.senderPublicKey || '',
        recipientUserId: payload.recipientUserId,
        recipientDeviceId: payload.recipientDeviceId,
        keyVersion: payload.keyVersion,
        wrappedRoomKey: payload.wrappedRoomKey,
        nonce: payload.nonce,
        aad: payload.aad || '',
        signature: payload.signature || '',
        wrappedKeyHash: payload.wrappedKeyHash || '',
        algorithms: {
          encryption: payload.algorithms.encryption,
          wrapping: payload.algorithms.wrapping || '',
          signing: payload.algorithms.signing || '',
          hash: payload.algorithms.hash || ''
        }
      });
    }

    const upsertResults = [];
    for (const packageDoc of validatedPackages) {
      const savedDoc = await ConversationKeyPackage.findOneAndUpdate(
        {
          conversationId: packageDoc.conversationId,
          senderDeviceId: packageDoc.senderDeviceId,
          recipientDeviceId: packageDoc.recipientDeviceId,
          keyVersion: packageDoc.keyVersion
        },
        { $set: packageDoc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();

      upsertResults.push({
        id: savedDoc._id,
        recipientUserId: savedDoc.recipientUserId,
        recipientDeviceId: savedDoc.recipientDeviceId,
        keyVersion: savedDoc.keyVersion,
        createdAt: savedDoc.createdAt
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Conversation key packages stored',
      count: upsertResults.length,
      packages: upsertResults
    });
  } catch (error) {
    console.error('Error publishing conversation key packages:', error?.message || error);
    return res.status(500).json({ error: 'Failed to publish conversation key packages' });
  }
  }
);

router.get('/conversations/:conversationId/keys/packages/sync', unifiedChatLimiter, authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.userId;
    const { deviceId, since } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

    if (!deviceId || typeof deviceId !== 'string' || deviceId.length > E2EE_LIMITS.deviceId) {
      return res.status(400).json({ error: 'Valid deviceId query parameter is required' });
    }

    const conversation = await resolveLeanDoc(ChatConversation.findById(conversationId));
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (conversation.type !== 'dm') {
      return res.status(400).json({ error: 'Conversation key sync is only supported for DM conversations' });
    }
    if (!canAccessConversation(conversation, userId)) {
      return res.status(403).json({ error: 'Access denied for this conversation' });
    }

    const ownedDevice = await DeviceKey.findOne({
      userId,
      deviceId,
      isRevoked: false
    }).select('_id').lean();

    if (!ownedDevice) {
      return res.status(403).json({ error: 'Device is not registered for authenticated user or has been revoked' });
    }

    const filter = {
      conversationId,
      recipientUserId: userId,
      recipientDeviceId: deviceId
    };

    if (since) {
      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        return res.status(400).json({ error: 'Invalid since timestamp' });
      }
      filter.createdAt = { $gt: sinceDate };
    }

    const packages = await ConversationKeyPackage.find(filter)
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    const packageIds = packages.map((pkg) => pkg._id);
    if (packageIds.length > 0) {
      await ConversationKeyPackage.updateMany(
        { _id: { $in: packageIds }, deliveredAt: null },
        { $set: { deliveredAt: new Date() } }
      );
    }

    return res.json({
      success: true,
      conversationId,
      deviceId,
      count: packages.length,
      packages: packages.map((pkg) => ({
        _id: pkg._id,
        conversationId: pkg.conversationId,
        senderUserId: pkg.senderUserId,
        senderDeviceId: pkg.senderDeviceId,
        senderPublicKey: pkg.senderPublicKey || '',
        recipientUserId: pkg.recipientUserId,
        recipientDeviceId: pkg.recipientDeviceId,
        keyVersion: pkg.keyVersion,
        wrappedRoomKey: pkg.wrappedRoomKey,
        nonce: pkg.nonce,
        aad: pkg.aad,
        signature: pkg.signature,
        wrappedKeyHash: pkg.wrappedKeyHash,
        algorithms: pkg.algorithms,
        createdAt: pkg.createdAt,
        deliveredAt: pkg.deliveredAt || null
      }))
    });
  } catch (error) {
    console.error('Error syncing conversation key packages:', error?.message || error);
    return res.status(500).json({ error: 'Failed to sync conversation key packages' });
  }
});

router.post(
  '/conversations/:conversationId/messages',
  unifiedChatLimiter,
  authenticateToken,
  body('content').optional().isString().withMessage('Message content must be a string when provided'),
  body('encryptedContent').not().exists().withMessage('Legacy encryptedContent is not allowed'),
  body('e2ee').optional().custom((value) => {
    const envelopeError = validateE2EEEnvelope(value);
    if (envelopeError) {
      throw new Error(envelopeError);
    }
    return true;
  }),
  body('messageType').optional().isIn(MESSAGE_TYPES).withMessage('Invalid messageType'),
  body('commandData').optional().isObject().withMessage('commandData must be an object'),
  body('attachments').not().exists().withMessage('Attachments are not supported in chat messages'),
  async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { conversationId } = req.params;
    const userId = req.user.userId;
    const contentProvided = Object.prototype.hasOwnProperty.call(req.body, 'content');
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const hasContent = content.length > 0;
    const hasE2EEEnvelope = Boolean(req.body.e2ee);
    const messageType = normalizeMessageType(req.body.messageType);
    const commandData = sanitizeCommandData(req.body.commandData);
    if (contentProvided && (!hasContent || content.length > 2000)) {
      return res.status(400).json({ error: 'Message content must be between 1 and 2000 chars when provided' });
    }

    const conversation = await ChatConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.type === 'profile-thread') {
      const permissions = await resolveProfileThreadPermissions(conversation, userId);
      if (!permissions.canWrite) {
        return res.status(403).json({ error: 'Write access denied for this conversation' });
      }
    } else if (!canAccessConversation(conversation, userId)) {
      return res.status(403).json({ error: 'Access denied for this conversation' });
    }

    const participantIds = getConversationParticipantIds(conversation);
    if (conversation.type !== 'zip-room') {
      const blockedRelation = await BlockList.findOne({
        $or: [
          { userId, blockedUserId: { $in: participantIds } },
          { userId: { $in: participantIds }, blockedUserId: userId }
        ]
      }).select('_id').lean();
      if (blockedRelation) {
        return res.status(403).json({ error: 'Cannot send messages due to block settings' });
      }
    }

    if (conversation.type === 'dm') {
      if (hasContent) {
        return res.status(400).json({ error: 'Plaintext content is not allowed for DM E2EE messages' });
      }
      if (!hasE2EEEnvelope) {
        return res.status(400).json({ error: 'e2ee envelope is required for DM messages' });
      }

      const { e2ee } = req.body;
      const ownedDevice = await DeviceKey.findOne({
        userId,
        deviceId: e2ee.senderDeviceId,
        isRevoked: false
      }).select('_id').lean();

      if (!ownedDevice) {
        return res.status(403).json({ error: 'Sender device is not registered for this user or has been revoked' });
      }

      const duplicateMessage = await ConversationMessage.findOne({
        conversationId: conversation._id,
        'e2ee.enabled': true,
        'e2ee.senderDeviceId': e2ee.senderDeviceId,
        'e2ee.clientMessageId': e2ee.clientMessageId
      }).select('_id').lean();

      if (duplicateMessage) {
        return res.status(409).json({ error: 'Duplicate clientMessageId for sender device' });
      }
    } else if (!hasContent) {
      return res.status(400).json({ error: 'Message content is required for non-DM conversations' });
    }

    if (conversation.type !== 'dm') {
      const sendingUser = await User.findById(userId).select('isAdmin');
      if (!isPrivilegedChatUser(sendingUser)) {
        const cooldown = await getGlobalChatCooldown(userId);
        if (!cooldown.allowed) {
          return res.status(429).json({
            error: 'Chat cooldown active',
            message: `You can send one chat message every 20 seconds. Try again in ${cooldown.retryAfter}s.`,
            retryAfter: cooldown.retryAfter
          });
        }
      }
    }

    const createPayload = {
      conversationId: conversation._id,
      userId,
      chatScope: conversation.type === 'dm' ? 'dm' : 'chat',
      messageType,
      commandData
    };

    if (conversation.type === 'dm') {
      const { e2ee } = req.body;
      createPayload.content = null;
      createPayload.senderNameColor = null;
      createPayload.e2ee = {
        enabled: true,
        version: e2ee.version,
        senderDeviceId: e2ee.senderDeviceId,
        clientMessageId: e2ee.clientMessageId,
        keyVersion: e2ee.keyVersion,
        nonce: e2ee.nonce,
        aad: e2ee.aad || '',
        ciphertext: e2ee.ciphertext,
        signature: e2ee.signature,
        ciphertextHash: e2ee.ciphertextHash,
        algorithms: {
          cipher: e2ee.algorithms.cipher,
          signature: e2ee.algorithms.signature,
          hash: e2ee.algorithms.hash
        }
      };
    } else {
      createPayload.content = content;
      createPayload.senderNameColor = null;
      createPayload.e2ee = { enabled: false };
    }

    const message = await ConversationMessage.create(createPayload);

    conversation.lastMessageAt = new Date();
    conversation.messageCount = (conversation.messageCount || 0) + 1;
    await conversation.save();
    await message.populate('userId', '_id username realName');
    const publicMessage = message.toPublicMessage({ conversationType: conversation.type });
    const targetUserIds = getConversationParticipantIds(conversation);
    emitChatMessage({
      userIds: targetUserIds.length > 0 ? targetUserIds : [String(userId)],
      message: publicMessage
    });

    return res.status(201).json({
      success: true,
      message: publicMessage
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Duplicate clientMessageId for sender device' });
    }
    console.error('Error sending conversation message:', error);
    return res.status(500).json({ error: 'Failed to send conversation message' });
  }
  }
);

router.post(
  '/dm/start',
  unifiedChatLimiter,
  authenticateToken,
  body('targetUserId').isMongoId().withMessage('Valid targetUserId is required'),
  async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const userId = String(req.user.userId);
    const targetUserId = String(req.body.targetUserId);

    if (userId === targetUserId) {
      return res.status(400).json({ error: 'Cannot start a DM with yourself' });
    }

    const targetUser = await User.findById(targetUserId).select('_id username realName').lean();
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const blockedRelation = await BlockList.findOne({
      $or: [
        { userId, blockedUserId: targetUserId },
        { userId: targetUserId, blockedUserId: userId }
      ]
    }).select('_id').lean();
    if (blockedRelation) {
      return res.status(403).json({ error: 'Cannot start DM due to block settings' });
    }

    let conversation = await ChatConversation.findOne({
      type: 'dm',
      participants: { $all: [userId, targetUserId], $size: 2 }
    });

    if (!conversation) {
      conversation = await ChatConversation.create({
        type: 'dm',
        title: 'Direct message',
        participants: [userId, targetUserId],
        lastMessageAt: new Date()
      });
    }

    return res.status(201).json({
      success: true,
      conversation: {
        _id: conversation._id,
        type: conversation.type,
        participants: conversation.participants,
        lastMessageAt: conversation.lastMessageAt,
        messageCount: conversation.messageCount || 0
      }
    });
  } catch (error) {
    console.error('Error starting DM thread:', error);
    return res.status(500).json({ error: 'Failed to start DM thread' });
  }
  }
);

router.delete('/conversations/:conversationId', unifiedChatLimiter, authenticateToken, async (req, res) => {
  try {
    const userId = String(req.user.userId);
    const { conversationId } = req.params;

    const conversation = await ChatConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.type !== 'dm') {
      return res.status(400).json({ error: 'Only direct message conversations can be deleted' });
    }

    if (!isConversationParticipant(conversation, userId)) {
      return res.status(403).json({ error: 'Access denied for this conversation' });
    }

    const participantIds = getConversationParticipantIds(conversation);
    const otherUserId = participantIds.find((id) => id !== userId) || null;

    await ConversationMessage.deleteMany({ conversationId: conversation._id });
    await ConversationKeyPackage.deleteMany({ conversationId: conversation._id });
    await conversation.deleteOne();

    if (otherUserId) {
      const deletingUser = await User.findById(userId).select('username').lean();
      const deletingUsername = deletingUser?.username || 'A user';
      await createNotification({
        recipientId: otherUserId,
        senderId: userId,
        type: 'system',
        title: 'Conversation deleted',
        body: `@${deletingUsername} deleted a direct message conversation with you.`
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

router.get('/profile/:userId/thread', unifiedChatLimiter, optionalAuthenticateToken, async (req, res) => {
  try {
    const viewerId = req.user?.userId ? String(req.user.userId) : '';
    const profileUserId = String(req.params.userId);

    const profileUser = await User.findById(profileUserId).select('_id username realName circles.members').lean();
    if (!profileUser) {
      return res.status(404).json({ error: 'Profile user not found' });
    }

    const blockedRelation = viewerId
      ? await BlockList.findOne({
        $or: [
          { userId: viewerId, blockedUserId: profileUserId },
          { userId: profileUserId, blockedUserId: viewerId }
        ]
      }).select('_id').lean()
      : null;
    if (blockedRelation) {
      return res.status(404).json({ error: 'Profile thread is unavailable' });
    }

    let thread = await ChatConversation.findOne({ type: 'profile-thread', profileUserId });

    if (!thread) {
      thread = await ChatConversation.create({
        type: 'profile-thread',
        title: `Profile thread: @${profileUser.username}`,
        profileUserId,
        participants: [profileUserId],
        profileThreadAccess: normalizeProfileThreadAccess(DEFAULT_PROFILE_THREAD_ACCESS),
        lastMessageAt: new Date()
      });
    }

    const permissions = await resolveProfileThreadPermissions(thread, viewerId);
    if (!permissions.canRead) {
      return res.status(403).json({ error: 'Profile thread is unavailable' });
    }

    const participantIds = Array.isArray(thread.participants)
      ? thread.participants.map((participantId) => String(participantId))
      : [];
    const shouldAddViewerAsParticipant = Boolean(viewerId) && !participantIds.includes(viewerId);
    if (shouldAddViewerAsParticipant) {
      thread.participants = [...participantIds, viewerId];
      await thread.save();
    }

    return res.json({
      success: true,
      conversation: {
        _id: thread._id,
        type: thread.type,
        title: thread.title,
        profileUserId: thread.profileUserId,
        participants: thread.participants,
        profileThreadAccess: permissions.access,
        permissions: {
          isOwner: permissions.isOwner,
          canRead: permissions.canRead,
          canWrite: permissions.canWrite
        },
        lastMessageAt: thread.lastMessageAt,
        messageCount: thread.messageCount || 0
      }
    });
  } catch (error) {
    console.error('Error resolving profile thread:', error);
    return res.status(500).json({ error: 'Failed to resolve profile thread' });
  }
});

router.put(
  '/profile/:userId/thread/settings',
  unifiedChatLimiter,
  authenticateToken,
  body('readRoles').optional().isArray().withMessage('readRoles must be an array'),
  body('readRoles.*').optional().isIn(PROFILE_THREAD_ROLE_VALUES).withMessage('Invalid read role'),
  body('writeRoles').optional().isArray().withMessage('writeRoles must be an array'),
  body('writeRoles.*').optional().isIn(PROFILE_THREAD_ROLE_VALUES).withMessage('Invalid write role'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const ownerId = String(req.user.userId);
      const profileUserId = String(req.params.userId);
      if (ownerId !== profileUserId) {
        return res.status(403).json({ error: 'Only the profile owner can update chat access' });
      }

      const profileUser = await User.findById(profileUserId).select('_id username').lean();
      if (!profileUser) {
        return res.status(404).json({ error: 'Profile user not found' });
      }

      const nextAccess = normalizeProfileThreadAccess(req.body);
      let thread = await ChatConversation.findOne({ type: 'profile-thread', profileUserId });
      if (!thread) {
        thread = await ChatConversation.create({
          type: 'profile-thread',
          title: `Profile thread: @${profileUser.username}`,
          profileUserId,
          participants: [profileUserId],
          profileThreadAccess: nextAccess,
          lastMessageAt: new Date()
        });
      } else {
        thread.profileThreadAccess = nextAccess;
        if (!Array.isArray(thread.participants) || thread.participants.length === 0) {
          thread.participants = [profileUserId];
        }
        await thread.save();
      }

      return res.json({
        success: true,
        conversation: {
          _id: thread._id,
          profileUserId: thread.profileUserId,
          profileThreadAccess: normalizeProfileThreadAccess(thread.profileThreadAccess),
          permissions: {
            isOwner: true,
            canRead: true,
            canWrite: true
          }
        }
      });
    } catch (error) {
      console.error('Error updating profile thread settings:', error);
      return res.status(500).json({ error: 'Failed to update profile thread settings' });
    }
  }
);

module.exports = router;
