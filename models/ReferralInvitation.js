const mongoose = require('mongoose');
const crypto = require('crypto');

const referralInvitationSchema = new mongoose.Schema({
  inviterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
  status: {
    type: String,
    enum: ['sent', 'accepted', 'expired'],
    default: 'sent'
  },
  token: {
    type: String,
    unique: true,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  }
});

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

// Check if invitation is expired
referralInvitationSchema.methods.isExpired = function() {
  return this.expiresAt < new Date() || this.status === 'expired';
};

// Mark as accepted
referralInvitationSchema.methods.markAsAccepted = function() {
  this.status = 'accepted';
  return this.save();
};

// Mark as expired
referralInvitationSchema.methods.markAsExpired = function() {
  this.status = 'expired';
  return this.save();
};

// Pre-save validation
referralInvitationSchema.pre('save', function(next) {
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
  
  next();
});

module.exports = mongoose.model('ReferralInvitation', referralInvitationSchema);