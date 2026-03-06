const mongoose = require('mongoose');

// Simple geohash encoding function
function encodeGeohash(lat, lng, precision) {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let latInterval = [-90, 90];
  let lngInterval = [-180, 180];
  let hash = '';
  let bit = 0;
  let ch = 0;
  
  for (let i = 0; i < precision; i++) {
    for (let j = 0; j < 5; j++) {
      // Longitude bit
      if (bit % 2 === 0) {
        const mid = (lngInterval[0] + lngInterval[1]) / 2;
        if (lng >= mid) {
          ch |= (1 << (4 - j));
          lngInterval[0] = mid;
        } else {
          lngInterval[1] = mid;
        }
      } else {
        // Latitude bit
        const mid = (latInterval[0] + latInterval[1]) / 2;
        if (lat >= mid) {
          ch |= (1 << (4 - j));
          latInterval[0] = mid;
        } else {
          latInterval[1] = mid;
        }
      }
      bit++;
    }
    hash += base32[ch];
    ch = 0;
  }
  
  return hash;
}

const spotlightSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Spotlight location
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  // Location name/business
  locationName: {
    type: String,
    required: true
  },
  // Optional description
  description: {
    type: String,
    default: ''
  },
  // Category for filtering
  category: {
    type: String,
    enum: ['food', 'drink', 'entertainment', 'shopping', 'service', 'outdoor', 'other'],
    default: 'other'
  },
  // Spotlight state
  state: {
    type: String,
    enum: ['friends_only', 'trending', 'public_glow'],
    default: 'friends_only'
  },
  // Reaction counts
  reactions: {
    heart: { type: Number, default: 0 },
    fire: { type: Number, default: 0 },
    cool: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  // Unique reactors (user IDs)
  reactorIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Escalation thresholds
  trendingThreshold: {
    type: Number,
    default: 10
  },
  publicGlowThreshold: {
    type: Number,
    default: 25
  },
  // Timestamps for engagement velocity
  createdAt: {
    type: Date,
    default: Date.now
  },
  // When it became trending
  trendingAt: {
    type: Date,
    default: null
  },
  // When it became public glow
  publicGlowAt: {
    type: Date,
    default: null
  },
  // When it expires
  expiresAt: {
    type: Date,
    default: null
  },
  // Is active
  isActive: {
    type: Boolean,
    default: true
  },
  // Geohash for efficient heatmap aggregation queries
  geohash: {
    type: String,
    index: true
  }
}, {
  timestamps: true
});

// Indexes
spotlightSchema.index({ location: '2dsphere' });
spotlightSchema.index({ state: 1, isActive: 1 });
spotlightSchema.index({ user: 1, createdAt: -1 });
spotlightSchema.index({ category: 1, state: 1 });

// Pre-save hook to set expiration and generate geohash
spotlightSchema.pre('save', function(next) {
  if (!this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  }
  if (this.location && this.location.coordinates) {
    const [lng, lat] = this.location.coordinates;
    this.geohash = encodeGeohash(lat, lng, 6);
  }
  next();
});

// Static method to create spotlight
spotlightSchema.statics.createSpotlight = async function(userId, data) {
  const { latitude, longitude, locationName, description, category } = data;
  
  // Check for recent spotlight (cooldown: 1 hour)
  const recentSpotlight = await this.findOne({
    user: userId,
    createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) },
    isActive: true
  });
  
  if (recentSpotlight) {
    throw new Error('Please wait before creating another spotlight');
  }
  
  const spotlight = await this.create({
    user: userId,
    location: {
      type: 'Point',
      coordinates: [longitude, latitude]
    },
    locationName,
    description,
    category
  });
  
  return spotlight;
};

// Static method to add reaction
spotlightSchema.statics.addReaction = async function(spotlightId, userId, reactionType) {
  const validReactions = ['heart', 'fire', 'cool'];
  if (!validReactions.includes(reactionType)) {
    throw new Error('Invalid reaction type');
  }
  
  const spotlight = await this.findById(spotlightId);
  if (!spotlight) {
    throw new Error('Spotlight not found');
  }
  
  // Check if user already reacted
  const alreadyReacted = spotlight.reactorIds.some(
    id => id.toString() === userId.toString()
  );
  
  if (alreadyReacted) {
    // Update existing reaction
    spotlight.reactions[reactionType] = (spotlight.reactions[reactionType] || 0) + 1;
  } else {
    // Add new reactor
    spotlight.reactorIds.push(userId);
    spotlight.reactions[reactionType] = (spotlight.reactions[reactionType] || 0) + 1;
  }
  
  spotlight.reactions.total = spotlight.reactions.heart + spotlight.reactions.fire + spotlight.reactions.cool;
  
  // Check for state escalation
  await checkAndEscalate(spotlight);
  
  return spotlight.save();
};

// Check and escalate spotlight state
async function checkAndEscalate(spotlight) {
  const { total, heart, fire } = spotlight.reactions;
  
  // Escalate to trending
  if (spotlight.state === 'friends_only' && total >= spotlight.trendingThreshold) {
    spotlight.state = 'trending';
    spotlight.trendingAt = new Date();
  }
  
  // Escalate to public glow
  if (spotlight.state === 'trending' && total >= spotlight.publicGlowThreshold) {
    spotlight.state = 'public_glow';
    spotlight.publicGlowAt = new Date();
  }
}

// Static method to get spotlights by location
spotlightSchema.statics.getByLocation = async function(lat, lng, radius = 5000, options = {}) {
  const { state, category, limit = 20 } = options;
  
  const query = {
    isActive: true,
    expiresAt: { $gt: new Date() },
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        $maxDistance: radius
      }
    }
  };
  
  if (state) query.state = Array.isArray(state) ? { $in: state } : state;
  if (category) query.category = category;
  
  return this.find(query)
    .populate('user', 'username realName avatarUrl')
    .sort({ 'reactions.total': -1, createdAt: -1 })
    .limit(limit);
};

// Static method to get friend's spotlights
spotlightSchema.statics.getFriendsSpotlights = async function(userId) {
  const Friendship = require('./Friendship');
  
  const friendships = await Friendship.find({
    $or: [
      { requester: userId, status: 'accepted' },
      { recipient: userId, status: 'accepted' }
    ]
  });
  
  const friendIds = friendships.map(f => 
    f.requester.toString() === userId.toString() ? f.recipient : f.requester
  );
  
  return this.find({
    user: { $in: friendIds },
    isActive: true,
    expiresAt: { $gt: new Date() },
    state: { $in: ['friends_only', 'trending', 'public_glow'] }
  })
    .populate('user', 'username realName avatarUrl')
    .sort({ createdAt: -1 })
    .limit(50);
};

// Static method to clean up expired spotlights
spotlightSchema.statics.cleanupExpired = async function() {
  return this.updateMany(
    { expiresAt: { $lt: new Date() }, isActive: true },
    { $set: { isActive: false } }
  );
};

// Instance method to deactivate
spotlightSchema.methods.deactivate = async function() {
  this.isActive = false;
  return this.save();
};

const Spotlight = mongoose.model('Spotlight', spotlightSchema);

module.exports = Spotlight;
