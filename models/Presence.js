const mongoose = require('mongoose');

const presenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['online', 'offline'],
    default: 'offline'
  },
  lastSeen: {
    type: Date,
    default: null
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  socketIds: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

presenceSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('Presence', presenceSchema);
