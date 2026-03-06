const mongoose = require('mongoose');
const crypto = require('crypto');

// Expanded referral statuses per Issue #12 requirements
const REFERRAL_STATUSES = [
  'sent',        // Initial invitation sent
  'opened',      // Invitation link opened by invitee
  'registered',  // Invitee registered an account
  'qualified',   // Invitee met qualification criteria (e.g., account age/activity)
  'rewarded',    // Referrer received reward
  'expired',     // Invitation expired
  'revoked'      // Invitation was revoked by inviter
];

// Qualification criteria thresholds
const QUALIFICATION_CRITERIA = {
  minAccountAgeDays: 7,        // Account must be at least 7 days old
  minPostsCount: 3,            // Account must have at least 3 posts
  minConnectionsCount: 2       // Account must have at least 2 connections
};

const referralInvitationSchema = new mongoose.Schema({
  inviterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  inviteeEmail: {
    type: String,
    lowercase: true,
    trim: true,
    required: function() {
      return !this.inviteePhone;
    }
  },
  inviteePhone: {
    type: String,
    trim: true,
    required: function() {
      return !this.inviteeEmail;
    }
  },
  universalIdHash: {
    type: String,
    required: true,
    index: true
  },
  // Expanded status tracking
  status: {
    type: String,
    enum: REFERRAL_STATUSES,
    default: 'sent',
    index: true
  },
  // Previous status for audit trail
  previousStatus: {
    type: String,
    enum: REFERRAL_STATUSES,
    default: null
  },
  token: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  // Unique referral code for easy sharing
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  // Timestamps for lifecycle milestones
  sentAt: {
    type: Date,
    default: Date.now
  },
  openedAt: {
    type: Date,
    default: null
  },
  registeredAt: {
    type: Date,
    default: null
  },
  qualifiedAt: {
    type: Date,
    default: null
  },
  rewardedAt: {
    type: Date,
    default: null
  },
  expiredAt: {
    type: Date,
    default: null
  },
  revokedAt: {
    type: Date,
    default: null
  },
  // Original expiration date
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  },
  // Reward tracking
  rewardAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  rewardCurrency: {
    type: String,
    default: 'credits'
  },
  rewardStatus: {
    type: String,
    enum: ['pending', 'processed', 'failed', 'cancelled'],
    default: 'pending'
  },
  rewardTransactionId: {
    type: String,
    default: null
  },
  // Invitee user reference (when they register)
  inviteeUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Custom message from inviter
  message: {
    type: String,
    maxlength: 500,
    default: ''
  },
  // IP address for abuse prevention
  inviterIp: {
    type: String,
    default: null
  },
  // Device fingerprint for abuse prevention
  inviterDeviceFingerprint: {
    type: String,
    default: null
  },
  // Invite click tracking
  clickCount: {
    type: Number,
    default: 0
  },
  // Notes for admin/review
  adminNotes: {
    type: String,
    default: ''
  },
  // Audit trail
  statusHistory: [{
    status: {
      type: String,
      enum: REFERRAL_STATUSES
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    reason: {
      type: String,
      default: ''
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for common queries
referralInvitationSchema.index({ inviterId: 1, status: 1 });
referralInvitationSchema.index({ inviterId: 1, createdAt: -1 });
referralInvitationSchema.index({ inviteeEmail: 1, inviterId: 1 });
referralInvitationSchema.index({ inviteePhone: 1, inviterId: 1 });

// Static constants
referralInvitationSchema.statics.REFERRAL_STATUSES = REFERRAL_STATUSES;
referralInvitationSchema.statics.QUALIFICATION_CRITERIA = QUALIFICATION_CRITERIA;

// Generate universal ID hash from email/phone
referralInvitationSchema.statics.generateUniversalIdHash = function(email, phone) {
  const input = email || phone;
  if (!input) return null;
  return crypto.createHash('sha256').update(input).digest('hex');
};

// Generate unique token
referralInvitationSchema.statics.generateToken = function() {
  return crypto.randomBytes(32).toString('hex');
};

// Generate unique referral code (shorter, user-friendly)
referralInvitationSchema.statics.generateReferralCode = function() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Check if invitation is expired
referralInvitationSchema.methods.isExpired = function() {
  return this.expiresAt < new Date() || this.status === 'expired';
};

// Check if invitation can be qualified
referralInvitationSchema.methods.canQualify = async function() {
  if (!this.inviteeUserId) return false;
  
  const User = mongoose.model('User');
  const invitee = await User.findById(this.inviteeUserId);
  
  if (!invitee) return false;
  
  const accountAgeDays = Math.floor((Date.now() - new Date(invitee.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  
  // Check minimum account age
  if (accountAgeDays < QUALIFICATION_CRITERIA.minAccountAgeDays) {
    return false;
  }
  
  // Note: Posts and connections would need to be counted from respective models
  // For now, we'll just check account age as the primary qualification
  
  return true;
};

// Update status with history tracking
referralInvitationSchema.methods.updateStatus = async function(newStatus, reason = '') {
  const previousStatus = this.status;
  this.previousStatus = previousStatus;
  this.status = newStatus;
  
  // Update timestamp based on status
  const now = new Date();
  switch (newStatus) {
    case 'opened':
      this.openedAt = now;
      break;
    case 'registered':
      this.registeredAt = now;
      break;
    case 'qualified':
      this.qualifiedAt = now;
      break;
    case 'rewarded':
      this.rewardedAt = now;
      break;
    case 'expired':
      this.expiredAt = now;
      break;
    case 'revoked':
      this.revokedAt = now;
      break;
  }
  
  // Add to status history
  this.statusHistory.push({
    status: newStatus,
    changedAt: now,
    reason: reason || `Status changed from ${previousStatus} to ${newStatus}`
  });
  
  return this.save();
};

// Mark as opened
referralInvitationSchema.methods.markAsOpened = async function() {
  if (this.status === 'sent') {
    await this.updateStatus('opened', 'Invitation link opened');
  }
  this.clickCount += 1;
  return this.save();
};

// Mark as registered
referralInvitationSchema.methods.markAsRegistered = async function(userId) {
  this.inviteeUserId = userId;
  if (this.status === 'opened' || this.status === 'sent') {
    await this.updateStatus('registered', 'Invitee registered an account');
  }
  return this.save();
};

// Mark as qualified
referralInvitationSchema.methods.markAsQualified = async function() {
  if (this.status === 'registered') {
    await this.updateStatus('qualified', 'Invitee met qualification criteria');
  }
  return this.save();
};

// Mark as rewarded
referralInvitationSchema.methods.markAsRewarded = async function(amount, transactionId = null) {
  this.rewardAmount = amount;
  this.rewardStatus = 'processed';
  this.rewardTransactionId = transactionId;
  if (this.status === 'qualified') {
    await this.updateStatus('rewarded', `Reward of ${amount} credits granted`);
  }
  return this.save();
};

// Mark as expired
referralInvitationSchema.methods.markAsExpired = async function() {
  if (this.status !== 'expired' && this.status !== 'revoked' && this.status !== 'rewarded') {
    await this.updateStatus('expired', 'Invitation expired');
  }
  return this.save();
};

// Mark as revoked
referralInvitationSchema.methods.markAsRevoked = async function(reason = '') {
  if (this.status !== 'rewarded') {
    await this.updateStatus('revoked', reason || 'Invitation revoked by inviter');
  }
  return this.save();
};

// Pre-save validation
referralInvitationSchema.pre('save', async function(next) {
  if (!this.inviteeEmail && !this.inviteePhone) {
    return next(new Error('Either email or phone must be provided'));
  }
  
  // Generate universal ID hash if not present
  if (!this.universalIdHash) {
    this.universalIdHash = this.constructor.generateUniversalIdHash(this.inviteeEmail, this.inviteePhone);
  }
  
  // Generate token if not present
  if (!this.token) {
    this.token = this.constructor.generateToken();
  }
  
  // Generate referral code if not present
  if (!this.referralCode) {
    // Ensure unique referral code
    let code;
    let attempts = 0;
    do {
      code = this.constructor.generateReferralCode();
      const existing = await this.constructor.findOne({ referralCode: code });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);
    this.referralCode = code;
  }
  
  // Auto-expire if past expiration date
  if (this.expiresAt < new Date() && this.status === 'sent') {
    this.status = 'expired';
    this.expiredAt = new Date();
  }
  
  next();
});

// Static method to get referral stats for a user
referralInvitationSchema.statics.getReferralStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { inviterId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalInvitations: { $sum: 1 },
        sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
        opened: { $sum: { $cond: [{ $eq: ['$status', 'opened'] }, 1, 0] } },
        registered: { $sum: { $cond: [{ $eq: ['$status', 'registered'] }, 1, 0] } },
        qualified: { $sum: { $cond: [{ $eq: ['$status', 'qualified'] }, 1, 0] } },
        rewarded: { $sum: { $cond: [{ $eq: ['$status', 'rewarded'] }, 1, 0] } },
        expired: { $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] } },
        revoked: { $sum: { $cond: [{ $eq: ['$status', 'revoked'] }, 1, 0] } },
        totalRewards: { $sum: '$rewardAmount' },
        totalClicks: { $sum: '$clickCount' }
      }
    }
  ]);
  
  return stats[0] || {
    totalInvitations: 0,
    sent: 0,
    opened: 0,
    registered: 0,
    qualified: 0,
    rewarded: 0,
    expired: 0,
    revoked: 0,
    totalRewards: 0,
    totalClicks: 0
  };
};

// Static method to validate referral (anti-abuse)
referralInvitationSchema.statics.validateReferral = async function(inviterId, email, phone, ip, deviceFingerprint) {
  const errors = new Set();
  const addError = (message) => {
    errors.add(message);
  };
  const normalizedEmail = email ? email.toLowerCase().trim() : null;
  const normalizedPhone = phone ? phone.trim() : null;
  const normalizedInviterId = inviterId ? inviterId.toString() : '';
  
  // Check for self-referral
  const User = mongoose.model('User');
  const inviter = await User.findById(inviterId).select('email phone');

  if (normalizedEmail) {
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser && existingUser._id.toString() === normalizedInviterId) {
      addError('You cannot refer yourself');
    }
  }

  if (normalizedPhone && inviter && inviter.phone && inviter.phone.trim() === normalizedPhone) {
    addError('You cannot refer yourself');
  }

  // Check if invitee already has a registered account
  if (normalizedEmail || normalizedPhone) {
    const existingRegisteredUser = await User.findOne({
      $or: [
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])
      ]
    }).select('_id');

    if (existingRegisteredUser) {
      addError('This user is already registered');
    }
  }
  
  // Check for duplicate pending invitation
  const existingInvite = await this.findOne({
    inviterId: inviterId,
    status: { $in: ['sent', 'opened', 'registered'] },
    $or: [
      ...(normalizedEmail ? [{ inviteeEmail: normalizedEmail }] : []),
      ...(normalizedPhone ? [{ inviteePhone: normalizedPhone }] : [])
    ]
  });
  
  if (existingInvite) {
    addError('A pending invitation already exists for this user');
  }
  
  // Check rate limiting (max 10 invitations per day)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayCount = await this.countDocuments({
    inviterId: inviterId,
    createdAt: { $gte: todayStart }
  });
  
  if (todayCount >= 10) {
    addError('You have reached the daily invitation limit (10)');
  }

  // Additional burst-rate abuse checks
  if (ip) {
    const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000));
    const ipHourlyCount = await this.countDocuments({
      inviterIp: ip,
      createdAt: { $gte: oneHourAgo }
    });

    if (ipHourlyCount >= 5) {
      addError('Too many referral invites from this IP address. Try again later.');
    }
  }

  if (deviceFingerprint) {
    const oneDayAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
    const deviceDailyCount = await this.countDocuments({
      inviterDeviceFingerprint: deviceFingerprint,
      createdAt: { $gte: oneDayAgo }
    });

    if (deviceDailyCount >= 15) {
      addError('Referral invites temporarily blocked for this device');
    }
  }
  
  return {
    valid: errors.size === 0,
    errors: Array.from(errors)
  };
};

module.exports = mongoose.model('ReferralInvitation', referralInvitationSchema);
