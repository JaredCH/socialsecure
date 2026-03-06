const mongoose = require('mongoose');

const chatConversationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['zip-room', 'dm', 'profile-thread'],
    required: true,
    index: true
  },
  title: {
    type: String,
    trim: true,
    maxlength: 160,
    default: ''
  },
  zipCode: {
    type: String,
    trim: true,
    default: null
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  profileUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  messageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

chatConversationSchema.index(
  { type: 1, zipCode: 1 },
  { unique: true, partialFilterExpression: { type: 'zip-room', zipCode: { $exists: true, $type: 'string' } } }
);
chatConversationSchema.index({ type: 1, participants: 1, lastMessageAt: -1 });
chatConversationSchema.index(
  { type: 1, profileUserId: 1, participants: 1 },
  { partialFilterExpression: { type: 'profile-thread', profileUserId: { $exists: true } } }
);

module.exports = mongoose.model('ChatConversation', chatConversationSchema);
