const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const ReferralInvitation = require('../models/ReferralInvitation');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

router.get('/search', async (req, res) => {
  try {
    const { email, phone } = req.query;

    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone is required' });
    }

    const universalId = User.generateUniversalId(email, phone);
    const user = await User.findOne({ universalId });

    if (user) {
      return res.json({
        success: true,
        exists: true,
        user: user.toPublicProfile()
      });
    }

    return res.json({
      success: true,
      exists: false,
      universalId,
      message: 'User has not registered yet. Use refer-a-friend.'
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to search universal account',
      details: error.message
    });
  }
});

router.post('/invite', [
  authenticateToken,
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim(),
  body('message').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone is required' });
    }

    const existing = await ReferralInvitation.findOne({
      inviterId: req.user.userId,
      status: 'sent',
      $or: [
        ...(email ? [{ inviteeEmail: email }] : []),
        ...(phone ? [{ inviteePhone: phone }] : [])
      ]
    });

    if (existing) {
      return res.status(409).json({ error: 'Invitation already sent' });
    }

    const invitation = new ReferralInvitation({
      inviterId: req.user.userId,
      inviteeEmail: email,
      inviteePhone: phone,
      universalIdHash: ReferralInvitation.generateUniversalIdHash(email, phone),
      token: ReferralInvitation.generateToken()
    });

    await invitation.save();

    return res.status(201).json({
      success: true,
      invitation: {
        id: invitation._id,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
        inviteUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/register?token=${invitation.token}`
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to send invitation',
      details: error.message
    });
  }
});

router.get('/invitations', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const [invitations, total] = await Promise.all([
      ReferralInvitation.find({ inviterId: req.user.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ReferralInvitation.countDocuments({ inviterId: req.user.userId })
    ]);

    return res.json({
      success: true,
      invitations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch invitations',
      details: error.message
    });
  }
});

router.post('/accept/:token', [
  body('realName').trim().notEmpty(),
  body('username').trim().isLength({ min: 3, max: 30 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const invite = await ReferralInvitation.findOne({
      token: req.params.token,
      status: 'sent'
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invalid invitation token' });
    }

    if (invite.isExpired()) {
      return res.status(400).json({ error: 'Invitation expired' });
    }

    const existing = await User.findOne({
      $or: [
        { email: req.body.email },
        { username: req.body.username.toLowerCase() }
      ]
    });

    if (existing) {
      return res.status(409).json({ error: 'Username or email already in use' });
    }

    const user = new User({
      universalId: invite.universalIdHash,
      realName: req.body.realName,
      username: req.body.username,
      email: req.body.email,
      passwordHash: req.body.password,
      registrationStatus: 'active',
      referredBy: invite.inviterId,
      referralCode: crypto.randomBytes(4).toString('hex')
    });

    await user.save();
    await invite.markAsAccepted();

    const authToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      success: true,
      message: 'Invitation accepted and account created',
      user: user.toPublicProfile(),
      token: authToken
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to accept invitation',
      details: error.message
    });
  }
});

module.exports = router;
