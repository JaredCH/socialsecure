const mongoose = require('mongoose');

const securityEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  eventType: {
    type: String,
    enum: [
      'login',
      'logout',
      'password_change',
      'device_key_registered',
      'device_key_revoked',
      'recovery_kit_created',
      'session_revoked',
      'suspicious_activity'
    ],
    required: true,
    index: true
  },
  metadata: {
    ip: { type: String, default: 'unknown' },
    userAgent: { type: String, default: '' },
    deviceId: { type: String, default: null },
    location: {
      city: { type: String, default: null },
      country: { type: String, default: null }
    }
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

securityEventSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SecurityEvent', securityEventSchema);
