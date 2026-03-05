const mongoose = require('mongoose');

const muteListSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  mutedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: true, updatedAt: true }
});

muteListSchema.index({ userId: 1, mutedUserId: 1 }, { unique: true });

module.exports = mongoose.model('MuteList', muteListSchema);
