const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  type: {
    type: String,
    enum: [
      'like', 'comment', 'mention', 'follow', 'message', 'system',
      'security_alert', 'market_transaction',
      'friend_post', 'top5_added', 'top5_removed',
      'partner_request', 'partner_response'
    ],
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true
  },
  body: {
    type: String,
    maxlength: 500,
    trim: true,
    default: ''
  },
  data: {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null
    },
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      default: null
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatRoom',
      default: null
    },
    url: {
      type: String,
      default: ''
    },
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MarketListing',
      default: null
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MarketTransaction',
      default: null
    }
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'acknowledged', 'dismissed'],
    default: 'active',
    index: true
  },
  acknowledgedAt: {
    type: Date,
    default: null
  },
  dismissedAt: {
    type: Date,
    default: null
  },
  groupKey: {
    type: String,
    default: null,
    index: true
  },
  channels: {
    inApp: {
      type: Boolean,
      default: true
    },
    email: {
      type: Boolean,
      default: false
    },
    push: {
      type: Boolean,
      default: false
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, status: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('Notification', notificationSchema);
