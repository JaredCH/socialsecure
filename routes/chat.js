const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    const messages = await ChatMessage.getRoomMessages(roomId, page, limit);
    
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
      limit
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

// Get message history for a room
router.get('/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    const messages = await ChatMessage.getRoomMessages(roomId, page, limit);
    
    res.json({
      success: true,
      messages: messages.map(msg => msg.toPublicMessage()),
      page,
      limit,
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