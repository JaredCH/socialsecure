const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  targetFeedId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    trim: true,
    maxlength: 5000
  },
  encryptedContent: {
    type: String,
    default: null
  },
  isEncrypted: {
    type: Boolean,
    default: false
  },
  visibility: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'public'
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
  mediaUrls: [{
    type: String,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Media URL must be a valid HTTP/HTTPS URL'
    }
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create geospatial index for location-based posts
postSchema.index({ location: '2dsphere' });

// Compound indexes for common queries
postSchema.index({ targetFeedId: 1, createdAt: -1 });
postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ visibility: 1, createdAt: -1 });

// Method to check if user can view post
postSchema.methods.canView = function(userId, isFriend = false) {
  if (this.visibility === 'public') return true;
  if (this.visibility === 'friends' && isFriend) return true;
  if (this.visibility === 'private' && this.targetFeedId.toString() === userId.toString()) return true;
  return false;
};

// Method to add like
postSchema.methods.addLike = function(userId) {
  if (!this.likes.includes(userId)) {
    this.likes.push(userId);
  }
  return this.save();
};

// Method to remove like
postSchema.methods.removeLike = function(userId) {
  const index = this.likes.indexOf(userId);
  if (index > -1) {
    this.likes.splice(index, 1);
  }
  return this.save();
};

// Method to add comment
postSchema.methods.addComment = function(userId, content) {
  this.comments.push({
    userId,
    content,
    createdAt: new Date()
  });
  return this.save();
};

// Method to remove comment
postSchema.methods.removeComment = function(commentId) {
  const index = this.comments.findIndex(c => c._id.toString() === commentId);
  if (index > -1) {
    this.comments.splice(index, 1);
  }
  return this.save();
};

// Static method to get feed for a user
postSchema.statics.getFeed = async function(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  // For now, return posts where user is the targetFeedId or authorId
  // In a real implementation, you'd include friends' posts
  const posts = await this.find({
    $or: [
      { targetFeedId: userId },
      { authorId: userId }
    ],
    visibility: { $in: ['public', 'friends'] }
  })
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit)
  .populate('authorId', 'username realName')
  .populate('targetFeedId', 'username realName')
  .lean();
  
  return posts;
};

// Static method to get posts for a specific user's feed
postSchema.statics.getUserFeed = async function(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const posts = await this.find({ targetFeedId: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('authorId', 'username realName')
    .lean();
  
  return posts;
};

module.exports = mongoose.model('Post', postSchema);