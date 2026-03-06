const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const DeviceKey = require('../models/DeviceKey');
const SecurityEvent = require('../models/SecurityEvent');
const BlockList = require('../models/BlockList');
const RoomKeyPackage = require('../models/RoomKeyPackage');
const User = require('../models/User');
const { createNotification } = require('../services/notifications');

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

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 500;
const MESSAGE_TYPES = ['text', 'action', 'system', 'command'];

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

const isSafeString = (value, maxLength) => typeof value === 'string' && value.length > 0 && value.length <= maxLength;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const HEX_PATTERN = /^[A-Fa-f0-9]+$/;

const isSafeBase64Like = (value, maxLength) => isSafeString(value, maxLength) && BASE64URL_PATTERN.test(value);
const isSafeHex = (value, minLength, maxLength) => isSafeString(value, maxLength) && value.length >= minLength && HEX_PATTERN.test(value);

const parseMessageLimit = (rawLimit) => Math.min(Math.max(parseInt(rawLimit, 10) || DEFAULT_MESSAGE_LIMIT, 1), MAX_MESSAGE_LIMIT);

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
  if (!storageKey || storageKey.length > 255 || !AUDIO_STORAGE_KEY_PATTERN.test(storageKey)) {
    return { error: 'audio.storageKey is invalid' };
  }

  const url = typeof payload.url === 'string' ? payload.url.trim() : '';
  if (!url || url.length > 1024 || !url.startsWith('/api/chat/media/')) {
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

// Get nearby chat rooms based on user location
router.get('/rooms/nearby', authenticateToken, async (req, res) => {
  try {
    const { longitude, latitude, maxDistance = 50 } = req.query;
    
    if (!longitude || !latitude) {
      return res.status(400).json({ error: 'Longitude and latitude are required' });
    }
    
    const lon = parseFloat(longitude);
    const lat = parseFloat(latitude);
    const distance = parseInt(maxDistance);
    
    if (isNaN(lon) || isNaN(lat) || isNaN(distance)) {
      return res.status(400).json({ error: 'Invalid coordinates or distance' });
    }
    
    const rooms = await ChatRoom.findNearby(lon, lat, distance);
    
    res.json({
      success: true,
      rooms: rooms.map(room => ({
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
        distance: room.distance // Would be calculated in the findNearby method
      }))
    });
  } catch (error) {
    console.error('Error fetching nearby rooms:', error);
    res.status(500).json({ error: 'Failed to fetch nearby rooms', details: error.message });
  }
});

// Get room details and messages
router.get('/rooms/:roomId', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const cursor = req.query.cursor;
    const limit = parseMessageLimit(req.query.limit);
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
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

      messages = cursorResult.messages;
      pagination = {
        mode: 'cursor',
        limit: cursorResult.limit,
        hasMore: cursorResult.hasMore,
        nextCursor: cursorResult.hasMore && cursorResult.cursorSource
          ? encodeMessageCursor(cursorResult.cursorSource.createdAt, cursorResult.cursorSource._id)
          : null
      };
    } else {
      messages = await ChatMessage.getRoomMessages(roomId, page, limit);
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
    
    // Check rate limit for non-resident cities
    const userCity = user.city || '';
    const roomCity = room.city || '';
    const rateLimitCheck = await ChatMessage.checkRateLimit(userId, roomId, userCity, roomCity);
    
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded', 
        message: 'Only 1 message per 15 seconds allowed for non-resident cities' 
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
      rateLimitKey: userCity === roomCity ? null : `${userId}:${roomId}:external`
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
    
    const message = new ChatMessage(messageData);
    await message.save();
    
    // Update room message count and last activity
    await room.incrementMessageCount();
    
    // Add user to room members if not already a member
    await room.addMember(userId);
    
    // Populate user info for response
    await message.populate('userId', 'username realName');

    const senderLabel = user.username || user.realName || 'Someone';
    await notifyRoomMembers({ room, senderId: userId, senderLabel, message });
    
    // Broadcast message via WebSocket (handled in server.js)
    // The WebSocket server will handle real-time broadcasting
    
    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      message: message.toPublicMessage(),
      rateLimit: {
        allowed: true,
        remaining: rateLimitCheck.remaining
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message', details: error.message });
  }
});

// Upload voice-note media (controlled endpoint)
router.post('/media/audio/upload-url', authenticateToken, (req, res) => {
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
          url: `/api/chat/media/${storageKey}`,
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
router.get('/media/:mediaId', authenticateToken, async (req, res) => {
  try {
    const mediaId = String(req.params.mediaId || '').trim();
    if (!AUDIO_STORAGE_KEY_PATTERN.test(mediaId)) {
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
});

// Send E2EE message envelope only (no plaintext accepted)
router.post('/rooms/:roomId/messages/e2ee', [
  authenticateToken,
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

    const userCity = user.city || '';
    const roomCity = room.city || '';
    const rateLimitCheck = await ChatMessage.checkRateLimit(userId, roomId, userCity, roomCity);

    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Only 1 message per 15 seconds allowed for non-resident cities'
      });
    }

    const messageData = {
      roomId,
      userId,
      content: null,
      encryptedContent: null,
      isEncrypted: true,
      messageType: normalizeMessageType(messageType),
      commandData: sanitizeCommandData(commandData),
      rateLimitKey: userCity === roomCity ? null : `${userId}:${roomId}:external`,
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

    const message = new ChatMessage(messageData);
    await message.save();

    await room.incrementMessageCount();
    await room.addMember(userId);
    await message.populate('userId', 'username realName');

    const senderLabel = user.username || user.realName || 'Someone';
    await notifyRoomMembers({ room, senderId: userId, senderLabel, message });

    return res.status(201).json({
      success: true,
      message: 'E2EE message envelope accepted',
      messageData: message.toPublicMessage(),
      rateLimit: {
        allowed: true,
        remaining: rateLimitCheck.remaining
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
        deliveredAt: pkg.deliveredAt || new Date()
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

      messages = cursorResult.messages;
      pagination = {
        mode: 'cursor',
        limit: cursorResult.limit,
        hasMore: cursorResult.hasMore,
        nextCursor: cursorResult.hasMore && cursorResult.cursorSource
          ? encodeMessageCursor(cursorResult.cursorSource.createdAt, cursorResult.cursorSource._id)
          : null
      };
    } else {
      messages = await ChatMessage.getRoomMessages(roomId, page, limit);
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
router.get('/rooms/:roomId/users', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await ChatRoom.findById(roomId).select('_id name members').lean();

    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const memberIds = Array.isArray(room.members) ? room.members : [];
    const users = memberIds.length > 0
      ? await User.find({ _id: { $in: memberIds } }).select('_id username realName').lean()
      : [];

    const sortedUsers = users
      .map((u) => ({
        _id: u._id,
        username: u.username || null,
        realName: u.realName || null
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
    
    if (!user.location || !user.location.coordinates) {
      return res.status(400).json({ error: 'User location not set. Please update your location first.' });
    }
    
    // Sync location rooms
    const result = await ChatRoom.syncUserLocationRooms(user);
    
    // Get all rooms the user is now a member of (including existing ones)
    const userRooms = await ChatRoom.find({ members: userId })
      .select('_id name type city state country location radius memberCount lastActivity')
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
    
    return res.json({
      success: true,
      location: { latitude: lat, longitude: lon },
      radius: maxRadius,
      rooms: nearbyRooms.map(room => ({
        _id: room._id,
        name: room.name,
        type: room.type,
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

module.exports = router;
