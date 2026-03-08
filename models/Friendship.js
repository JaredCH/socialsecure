const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'blocked', 'removed'],
    default: 'pending',
    index: true
  },
  requesterRelationshipAudience: {
    type: String,
    enum: ['social', 'secure'],
    default: 'social'
  },
  recipientRelationshipAudience: {
    type: String,
    enum: ['social', 'secure'],
    default: 'social'
  },
  // Who blocked whom (if status is 'blocked')
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Reason for blocking (optional)
  blockReason: {
    type: String,
    maxlength: 500,
    default: null
  },
  // Timestamps for different status changes
  acceptedAt: {
    type: Date,
    default: null
  },
  declinedAt: {
    type: Date,
    default: null
  },
  blockedAt: {
    type: Date,
    default: null
  },
  removedAt: {
    type: Date,
    default: null
  },
  // Request message (optional)
  message: {
    type: String,
    maxlength: 500,
    default: null
  },
  // Per-user category selections (private to each participant)
  requesterCategory: {
    type: String,
    enum: ['social', 'secure'],
    default: 'social'
  },
  recipientCategory: {
    type: String,
    enum: ['social', 'secure'],
    default: 'social'
  },
  partnerStatus: {
    type: String,
    enum: ['none', 'pending', 'accepted'],
    default: 'none'
  },
  partnerRequestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  partnerRequestedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Compound index to ensure unique friendship pairs
// Only one friendship record per user pair (regardless of direction)
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });

// Index for efficient queries
friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ status: 1 });

// Static method to find friendship between two users (either direction)
friendshipSchema.statics.findFriendship = async function(userId1, userId2) {
  return await this.findOne({
    $or: [
      { requester: userId1, recipient: userId2 },
      { requester: userId2, recipient: userId1 }
    ]
  });
};

// Static method to get friends of a user
friendshipSchema.statics.getFriends = async function(userId) {
  const friendships = await this.find({
    $or: [
      { requester: userId, status: 'accepted' },
      { recipient: userId, status: 'accepted' }
    ]
  }).populate('requester recipient', 'username realName avatarUrl city state country');

  return friendships.map(f => {
    const friend = f.requester._id.toString() === userId.toString() ? f.recipient : f.requester;
    return {
      _id: friend._id,
      username: friend.username,
      realName: friend.realName,
      avatarUrl: friend.avatarUrl,
      city: friend.city,
      state: friend.state,
      country: friend.country,
      friendshipId: f._id,
      friendsSince: f.acceptedAt,
      category: (f.requester._id.toString() === userId.toString() ? f.requesterCategory : f.recipientCategory) || 'social',
      partnerStatus: ['none', 'pending', 'accepted'].includes(f.partnerStatus) ? f.partnerStatus : 'none',
      partnerRequestedByViewer: String(f.partnerRequestedBy || '') === String(userId || ''),
      partnerRequestedAt: f.partnerRequestedAt || null
    };
  });
};

// Static method to get incoming friend requests
friendshipSchema.statics.getIncomingRequests = async function(userId) {
  return await this.find({
    recipient: userId,
    status: 'pending'
  }).populate('requester', 'username realName avatarUrl city state country').sort({ createdAt: -1 });
};

// Static method to get outgoing friend requests
friendshipSchema.statics.getOutgoingRequests = async function(userId) {
  return await this.find({
    requester: userId,
    status: 'pending'
  }).populate('recipient', 'username realName avatarUrl city state country').sort({ createdAt: -1 });
};

// Method to check if user is blocked
friendshipSchema.methods.isBlockedBy = function(userId) {
  if (this.status === 'blocked') {
    return this.blockedBy && this.blockedBy.toString() === userId.toString();
  }
  return false;
};

module.exports = mongoose.model('Friendship', friendshipSchema);
