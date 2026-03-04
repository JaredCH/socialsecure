const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const DeviceKey = require('../models/DeviceKey');
const RoomKeyPackage = require('../models/RoomKeyPackage');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
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
const MAX_MESSAGE_LIMIT = 200;

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
  body('content').optional().trim().isLength({ max: 2000 }).withMessage('Message too long'),
  body('encryptedContent').optional().trim(),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const { roomId } = req.params;
    const { content, encryptedContent, latitude, longitude } = req.body;
    const userId = req.user.userId;
    
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

// Send E2EE message envelope only (no plaintext accepted)
router.post('/rooms/:roomId/messages/e2ee', [
  authenticateToken,
  body('content').not().exists().withMessage('Plaintext content is not allowed on E2EE endpoint'),
  body('encryptedContent').not().exists().withMessage('Legacy encryptedContent is not allowed on E2EE endpoint'),
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
    const { e2ee, latitude, longitude } = req.body;
    const userId = req.user.userId;

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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
    
    await room.addMember(userId);
    
    res.json({
      success: true,
      message: 'Joined chat room successfully',
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
    
    await room.removeMember(userId);
    
    res.json({
      success: true,
      message: 'Left chat room successfully',
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

module.exports = router;
