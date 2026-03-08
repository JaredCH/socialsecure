const mongoose = require('mongoose');

const conversationKeyPackageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatConversation',
    required: true,
    index: true
  },
  senderUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  senderDeviceId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128,
    index: true
  },
  recipientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  recipientDeviceId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128,
    index: true
  },
  keyVersion: {
    type: Number,
    required: true,
    min: 1,
    max: 1000000,
    index: true
  },
  wrappedRoomKey: {
    type: String,
    required: true,
    maxlength: 131072
  },
  nonce: {
    type: String,
    required: true,
    maxlength: 4096
  },
  aad: {
    type: String,
    maxlength: 8192,
    default: ''
  },
  signature: {
    type: String,
    maxlength: 16384,
    default: ''
  },
  wrappedKeyHash: {
    type: String,
    maxlength: 128,
    default: ''
  },
  algorithms: {
    encryption: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64
    },
    wrapping: {
      type: String,
      trim: true,
      maxlength: 64,
      default: ''
    },
    signing: {
      type: String,
      trim: true,
      maxlength: 64,
      default: ''
    },
    hash: {
      type: String,
      trim: true,
      maxlength: 32,
      default: ''
    }
  },
  deliveredAt: {
    type: Date,
    default: null,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

conversationKeyPackageSchema.index(
  { conversationId: 1, senderDeviceId: 1, recipientDeviceId: 1, keyVersion: 1 },
  { unique: true }
);
conversationKeyPackageSchema.index({ recipientUserId: 1, recipientDeviceId: 1, createdAt: -1 });

module.exports = mongoose.model('ConversationKeyPackage', conversationKeyPackageSchema);
