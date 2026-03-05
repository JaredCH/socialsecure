const mongoose = require('mongoose');

const blockListSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  blockedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reason: {
    type: String,
    maxlength: 200,
    default: ''
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: true, updatedAt: true }
});

blockListSchema.index({ userId: 1, blockedUserId: 1 }, { unique: true });

module.exports = mongoose.model('BlockList', blockListSchema);
