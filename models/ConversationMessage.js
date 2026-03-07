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
  },
  senderNameColor: {
    type: String,
    trim: true,
    maxlength: 16,
    default: null,
    validate: {
      validator: (value) => value == null || /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value),
      message: 'senderNameColor must be a valid hex color'
    }
  }
}, {
  timestamps: true
});

conversationMessageSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = mongoose.model('ConversationMessage', conversationMessageSchema);
