const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
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

// Search users (returns public profiles)
router.get('/search', [
  body('q').optional().trim()
], async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const searchRegex = new RegExp(q, 'i');
    
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { realName: searchRegex }
      ],
      registrationStatus: 'active'
    })
    .select('username realName city state country hasPGP')
    .limit(20)
    .lean();
    
    res.json({
      success: true,
      users: users.map(user => ({
        _id: user._id,
        username: user.username,
        realName: user.realName,
        city: user.city,
        state: user.state,
        country: user.country,
        hasPGP: !!user.pgpPublicKey
      }))
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users', details: error.message });
  }
});

// Get user by username
router.get('/username/:username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findOne({ username: username.toLowerCase() })
      .select('-passwordHash -encryptionPasswordHash -pgpPublicKey');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const publicUser = user.toPublicProfile();
    delete publicUser.hasEncryptionPassword;
    
    res.json({
      success: true,
      user: publicUser
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user', details: error.message });
  }
});

// Get user by ID
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('-passwordHash -encryptionPasswordHash -pgpPublicKey');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const publicUser = user.toPublicProfile();
    delete publicUser.hasEncryptionPassword;
    
    res.json({
      success: true,
      user: publicUser
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user', details: error.message });
  }
});

module.exports = router;
