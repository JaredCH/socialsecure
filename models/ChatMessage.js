const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom',
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
    trim: true,
    maxlength: 2000
  },
  encryptedContent: {
    type: String,
    default: null
  },
  isEncrypted: {
    type: Boolean,
    default: false
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    }
  },
  rateLimitKey: {
    type: String,
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

// Index for efficient room message retrieval
chatMessageSchema.index({ roomId: 1, createdAt: -1 });
chatMessageSchema.index({ userId: 1, createdAt: -1 });

// Static method to get messages for a room with pagination
chatMessageSchema.statics.getRoomMessages = async function(roomId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  const messages = await this.find({ roomId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'username realName')
    .lean();
  
  return messages.reverse(); // Return in chronological order
};

// Static method to check rate limit for user in non-resident city
chatMessageSchema.statics.checkRateLimit = async function(userId, roomId, userCity, roomCity) {
  // If user is in the same city as room, no rate limit
  if (userCity === roomCity) {
    return { allowed: true, remaining: Infinity };
  }
  
  // For non-resident cities: 1 message per 15 seconds
  const fifteenSecondsAgo = new Date(Date.now() - 15000);
  const key = `${userId}:${roomId}:external`;
  
  const recentMessage = await this.findOne({
    rateLimitKey: key,
    createdAt: { $gte: fifteenSecondsAgo }
  });
  
  if (recentMessage) {
    return { allowed: false, remaining: 0 };
  }
  
  return { allowed: true, remaining: 1 };
};

// Method to get public representation (hides encrypted content)
chatMessageSchema.methods.toPublicMessage = function() {
  return {
    _id: this._id,
    roomId: this.roomId,
    userId: this.userId,
    content: this.isEncrypted ? '[Encrypted message]' : this.content,
    isEncrypted: this.isEncrypted,
    location: this.location,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('ChatMessage', chatMessageSchema);