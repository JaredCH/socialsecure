const crypto = require('crypto');

const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const User = require('../models/User');
const ReferralInvitation = require('../models/ReferralInvitation');

const router = express.Router();

const REFERRAL_REWARD_AMOUNT = Number(process.env.REFERRAL_REWARD_AMOUNT || 100);

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

const referralInviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many referral invites. Please try again later.' }
});

const referralQualificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many referral qualification requests. Please try again later.' }
});

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
  referralInviteLimiter,
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim(),
  body('message').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, phone, message } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const deviceFingerprint = req.headers['x-device-fingerprint'] || null;

    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone is required' });
    }

    // Validate referral (anti-abuse)
    const validation = await ReferralInvitation.validateReferral(
      req.user.userId,
      email,
      phone,
      ip,
      deviceFingerprint
    );

    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }

    // Check for existing user (self-referral)
    if (email) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'This user is already registered' });
      }
    }

    // Check for existing pending invitation
    const existing = await ReferralInvitation.findOne({
      inviterId: req.user.userId,
      status: { $in: ['sent', 'opened', 'registered'] },
      $or: [
        ...(email ? [{ inviteeEmail: email.toLowerCase() }] : []),
        ...(phone ? [{ inviteePhone: phone }] : [])
      ]
    });

    if (existing) {
      return res.status(409).json({ error: 'Invitation already sent to this user' });
    }

    const invitation = new ReferralInvitation({
      inviterId: req.user.userId,
      inviteeEmail: email,
      inviteePhone: phone,
      universalIdHash: ReferralInvitation.generateUniversalIdHash(email, phone),
      token: ReferralInvitation.generateToken(),
      message: message || '',
      inviterIp: ip,
      inviterDeviceFingerprint: deviceFingerprint,
      // Initialize status history
      statusHistory: [{
        status: 'sent',
        changedAt: new Date(),
        reason: 'Invitation created'
      }]
    });

    await invitation.save();

    return res.status(201).json({
      success: true,
      invitation: {
        id: invitation._id,
        token: invitation.token,
        referralCode: invitation.referralCode,
        expiresAt: invitation.expiresAt,
        inviteUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/register?token=${invitation.token}`,
        referralLink: `${process.env.CLIENT_URL || 'http://localhost:3000'}/register?ref=${invitation.referralCode}`
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
    const status = req.query.status; // Optional status filter
    const skip = (page - 1) * limit;

    const query = { inviterId: req.user.userId };
    if (status) {
      query.status = status;
    }

    const [invitations, total] = await Promise.all([
      ReferralInvitation.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ReferralInvitation.countDocuments(query)
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

// Get referral statistics for the current user
router.get('/referral-stats', authenticateToken, async (req, res) => {
  try {
    const stats = await ReferralInvitation.getReferralStats(req.user.userId);
    
    // Calculate conversion rates
    const conversionRate = stats.totalInvitations > 0 
      ? ((stats.registered / stats.totalInvitations) * 100).toFixed(1)
      : 0;
    
    const rewardRate = stats.registered > 0 
      ? ((stats.rewarded / stats.registered) * 100).toFixed(1)
      : 0;

    return res.json({
      success: true,
      stats: {
        ...stats,
        conversionRate: parseFloat(conversionRate),
        rewardRate: parseFloat(rewardRate)
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch referral stats',
      details: error.message
    });
  }
});

// Resend invitation
router.post('/invitations/:id/resend', authenticateToken, async (req, res) => {
  try {
    const invitation = await ReferralInvitation.findOne({
      _id: req.params.id,
      inviterId: req.user.userId
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.status === 'rewarded') {
      return res.status(400).json({ error: 'Cannot resend rewarded invitation' });
    }

    if (invitation.status === 'revoked') {
      return res.status(400).json({ error: 'Cannot resend revoked invitation' });
    }

    // Generate new token and reset expiration
    invitation.token = ReferralInvitation.generateToken();
    invitation.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    invitation.status = 'sent';
    invitation.statusHistory.push({
      status: 'sent',
      changedAt: new Date(),
      reason: 'Invitation resent'
    });

    await invitation.save();

    return res.json({
      success: true,
      invitation: {
        id: invitation._id,
        token: invitation.token,
        referralCode: invitation.referralCode,
        expiresAt: invitation.expiresAt,
        inviteUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/register?token=${invitation.token}`,
        referralLink: `${process.env.CLIENT_URL || 'http://localhost:3000'}/register?ref=${invitation.referralCode}`
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to resend invitation',
      details: error.message
    });
  }
});

// Cancel/Revoke invitation
router.post('/invitations/:id/revoke', authenticateToken, async (req, res) => {
  try {
    const invitation = await ReferralInvitation.findOne({
      _id: req.params.id,
      inviterId: req.user.userId
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.status === 'rewarded') {
      return res.status(400).json({ error: 'Cannot revoke rewarded invitation' });
    }

    await invitation.markAsRevoked(req.body.reason || 'Revoked by inviter');

    return res.json({
      success: true,
      message: 'Invitation revoked'
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to revoke invitation',
      details: error.message
    });
  }
});

router.post('/invitations/:id/qualify', referralQualificationLimiter, authenticateToken, async (req, res) => {
  try {
    const invitation = await ReferralInvitation.findOne({
      _id: req.params.id,
      inviterId: req.user.userId
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (!invitation.inviteeUserId) {
      return res.status(400).json({ error: 'Invitee has not registered yet' });
    }

    if (!invitation._id) {
      return res.status(500).json({ error: 'Invitation is missing a stable identifier' });
    }

    if (invitation.status === 'revoked' || invitation.status === 'expired') {
      return res.status(400).json({ error: `Cannot qualify ${invitation.status} invitation` });
    }

    if (!['registered', 'qualified', 'rewarded'].includes(invitation.status)) {
      return res.status(400).json({ error: 'Invitation is not eligible for qualification' });
    }

    const deterministicRewardId = invitation.rewardTransactionId || `reward_${invitation._id}`;

    if (invitation.rewardStatus === 'processed' || invitation.status === 'rewarded') {
      return res.json({
        success: true,
        alreadyRewarded: true,
        invitation: {
          id: invitation._id,
          status: invitation.status,
          rewardStatus: invitation.rewardStatus,
          rewardAmount: invitation.rewardAmount,
          rewardCurrency: invitation.rewardCurrency,
          rewardTransactionId: invitation.rewardTransactionId
        }
      });
    }

    if (invitation.status === 'registered') {
      const qualifies = await invitation.canQualify();
      if (!qualifies) {
        return res.status(400).json({
          error: 'Invitee does not meet qualification criteria yet'
        });
      }
      await invitation.markAsQualified();
    }

    await invitation.markAsRewarded(REFERRAL_REWARD_AMOUNT, deterministicRewardId);

    return res.json({
      success: true,
      alreadyRewarded: false,
      invitation: {
        id: invitation._id,
        status: invitation.status,
        qualifiedAt: invitation.qualifiedAt,
        rewardedAt: invitation.rewardedAt,
        rewardStatus: invitation.rewardStatus,
        rewardAmount: invitation.rewardAmount,
        rewardCurrency: invitation.rewardCurrency,
        rewardTransactionId: invitation.rewardTransactionId
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to process referral qualification',
      details: error.message
    });
  }
});

// Track invitation click (for analytics)
router.get('/track/:token', async (req, res) => {
  try {
    const invitation = await ReferralInvitation.findOne({
      token: req.params.token
    });

    if (invitation && !invitation.isExpired()) {
      await invitation.markAsOpened();
    }

    // Redirect to registration page
    const redirectUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/register?token=${req.params.token}`;
    res.redirect(redirectUrl);
  } catch (error) {
    // Still redirect even if tracking fails
    const redirectUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/register?token=${req.params.token}`;
    res.redirect(redirectUrl);
  }
});

// Register via referral code (alternative to token)
router.post('/register-by-code', [
  body('realName').trim().notEmpty(),
  body('username').trim().isLength({ min: 3, max: 30 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('referralCode').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { realName, username, email, password, referralCode } = req.body;

    // Find invitation by referral code
    const invite = await ReferralInvitation.findOne({
      referralCode: referralCode.toUpperCase(),
      status: { $in: ['sent', 'opened'] }
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    if (invite.isExpired()) {
      return res.status(400).json({ error: 'Referral code expired' });
    }

    const existing = await User.findOne({
      $or: [
        { email: email },
        { username: username.toLowerCase() }
      ]
    });

    if (existing) {
      return res.status(409).json({ error: 'Username or email already in use' });
    }

    const user = new User({
      universalId: invite.universalIdHash,
      realName,
      username: username.toLowerCase(),
      email,
      passwordHash: password,
      registrationStatus: 'active',
      referredBy: invite.inviterId,
      referralCode: crypto.randomBytes(4).toString('hex').toUpperCase()
    });

    await user.save();
    
    // Update invitation status to registered
    await invite.markAsRegistered(user._id);

    const authToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      success: true,
      message: 'Account created via referral',
      user: user.toPublicProfile(),
      token: authToken
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to register',
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
      status: { $in: ['sent', 'opened'] }
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
      username: req.body.username.toLowerCase(),
      email: req.body.email,
      passwordHash: req.body.password,
      registrationStatus: 'active',
      referredBy: invite.inviterId,
      referralCode: crypto.randomBytes(4).toString('hex').toUpperCase()
    });

    await user.save();
    
    // Update invitation status to registered
    await invite.markAsRegistered(user._id);

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
