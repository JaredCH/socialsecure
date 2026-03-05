const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  tokenHash: {
    type: String,
    required: true,
    index: true
  },
  deviceInfo: {
    type: {
      type: String,
      default: 'web'
    },
    browser: {
      type: String,
      default: 'unknown'
    },
    os: {
      type: String,
      default: 'unknown'
    }
  },
  ipAddress: {
    type: String,
    default: 'unknown'
  },
  location: {
    city: { type: String, default: null },
    country: { type: String, default: null }
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  },
  isRevoked: {
    type: Boolean,
    default: false,
    index: true
  },
  revokedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

sessionSchema.index({ userId: 1, isRevoked: 1, lastActivity: -1 });
sessionSchema.index({ userId: 1, tokenHash: 1 }, { unique: true });

module.exports = mongoose.model('Session', sessionSchema);
