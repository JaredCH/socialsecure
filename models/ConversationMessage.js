const mongoose = require('mongoose');

const conversationMessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatConversation',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  }
}, {
  timestamps: true
});

conversationMessageSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = mongoose.model('ConversationMessage', conversationMessageSchema);
