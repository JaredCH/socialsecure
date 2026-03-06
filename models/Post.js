const mongoose = require('mongoose');
const { normalizeRelationshipAudience } = require('../utils/relationshipAudience');

const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (degrees) => (Number(degrees) * Math.PI) / 180;

const calculateMiles = (origin, destination) => {
  if (!origin || !destination) return null;
  const [lon1, lat1] = origin;
  const [lon2, lat2] = destination;
  if (![lon1, lat1, lon2, lat2].every((value) => Number.isFinite(Number(value)))) {
    return null;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
};

const INTERACTION_TYPES = ['poll', 'quiz', 'countdown'];
const INTERACTION_STATUS = ['active', 'closed', 'expired'];

const interactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: INTERACTION_TYPES
  },
  status: {
    type: String,
    enum: INTERACTION_STATUS,
    default: 'active'
  },
  expiresAt: {
    type: Date,
    default: null
  },
  poll: {
    question: {
      type: String,
      trim: true,
      maxlength: 280
    },
    options: [{
      type: String,
      trim: true,
      maxlength: 120
    }],
    allowMultiple: {
      type: Boolean,
      default: false
    }
  },
  quiz: {
    question: {
      type: String,
      trim: true,
      maxlength: 280
    },
    options: [{
      type: String,
      trim: true,
      maxlength: 120
    }],
    correctOptionIndex: {
      type: Number,
      min: 0,
      default: null
    },
    explanation: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    }
  },
  countdown: {
    label: {
      type: String,
      trim: true,
      maxlength: 180
    },
    targetAt: {
      type: Date,
      default: null
    },
    timezone: {
      type: String,
      trim: true,
      maxlength: 80
    },
    linkUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: ''
    }
  }
}, { _id: false, strict: true });

const interactionResponsesSchema = new mongoose.Schema({
  pollVotes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    optionIndexes: [{
      type: Number,
      required: true,
      min: 0
    }],
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  quizAnswers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    optionIndex: {
      type: Number,
      required: true,
      min: 0
    },
    isCorrect: {
      type: Boolean,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  countdownFollowers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { _id: false, strict: true });

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
    enum: ['public', 'friends', 'circles', 'specific_users', 'private'],
    default: 'public'
  },
  relationshipAudience: {
    type: String,
    enum: ['social', 'secure'],
    default: 'social',
    index: true
  },
  visibleToCircles: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  visibleToUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  excludeUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  locationRadius: {
    type: Number,
    default: null,
    min: 1,
    max: 1000
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true
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
  interaction: {
    type: interactionSchema,
    default: null
  },
  interactionResponses: {
    type: interactionResponsesSchema,
    default: () => ({
      pollVotes: [],
      quizAnswers: [],
      countdownFollowers: []
    }),
    select: false
  },
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
postSchema.index({ authorId: 1, visibility: 1, createdAt: -1 });
postSchema.index({ expiresAt: 1 });
postSchema.index({ content: 'text' });
postSchema.index({ createdAt: -1, visibility: 1, authorId: 1 });

// Method to check if user can view post
postSchema.methods.canView = function(viewerId, context = {}) {
  const relationshipAudience = normalizeRelationshipAudience(this.relationshipAudience);
  if (!viewerId) return this.visibility === 'public' && relationshipAudience !== 'secure';

  const viewer = String(viewerId);
  const author = String(this.authorId);
  const target = String(this.targetFeedId);

  if (this.expiresAt && this.expiresAt.getTime() < Date.now()) {
    return false;
  }

  if (author === viewer || target === viewer) {
    return true;
  }

  if (relationshipAudience === 'secure' && !context.isSecureFriend) {
    return false;
  }

  const excludedIds = Array.isArray(this.excludeUsers)
    ? this.excludeUsers.map((entry) => String(entry))
    : [];
  if (excludedIds.includes(viewer)) {
    return false;
  }

  const enforceLocationRadius = () => {
    if (!this.locationRadius || !Array.isArray(this.location?.coordinates)) {
      return true;
    }
    if (!Array.isArray(context.viewerCoordinates)) {
      return false;
    }
    const miles = calculateMiles(this.location.coordinates, context.viewerCoordinates);
    return Number.isFinite(miles) ? miles <= this.locationRadius : false;
  };

  if (this.visibility === 'public') {
    return enforceLocationRadius();
  }

  if (this.visibility === 'friends') {
    return !!context.isFriend;
  }

  if (this.visibility === 'circles' || this.visibility === 'specific_users') {
    const allowedUsers = Array.isArray(this.visibleToUsers)
      ? this.visibleToUsers.map((entry) => String(entry))
      : [];
    return allowedUsers.includes(viewer);
  }

  if (this.visibility === 'private') {
    return author === viewer || target === viewer;
  }

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
