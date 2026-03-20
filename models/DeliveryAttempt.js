const mongoose = require('mongoose');

const deliveryAttemptSchema = new mongoose.Schema({
  notificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notification',
    required: true,
    index: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  channel: {
    type: String,
    enum: ['inApp', 'email', 'push', 'browser'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'delivered', 'failed', 'skipped'],
    default: 'pending'
  },
  attempt: {
    type: Number,
    default: 1,
    min: 1
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  nextRetryAt: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  failedAt: {
    type: Date,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

const DELIVERY_ATTEMPT_RETENTION_SECONDS = 60 * 60 * 24 * 30; // 30 days

deliveryAttemptSchema.index({ notificationId: 1, channel: 1 });
deliveryAttemptSchema.index({ status: 1, nextRetryAt: 1 });
deliveryAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: DELIVERY_ATTEMPT_RETENTION_SECONDS });

module.exports = mongoose.model('DeliveryAttempt', deliveryAttemptSchema);
