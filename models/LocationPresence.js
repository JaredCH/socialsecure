const mongoose = require('mongoose');

const locationPresenceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Coarse location (rounded to ~city block level for privacy)
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],  // [longitude, latitude]
      required: true
    }
  },
  // Geohash for efficient queries (precision 6 = ~1.2km x 0.6km)
  geohash: {
    type: String,
    index: true
  },
  // Precision level (1=country, 2=state, 3=city, 4=neighborhood, 5=block)
  precisionLevel: {
    type: Number,
    default: 5,
    enum: [1, 2, 3, 4, 5]
  },
  // Human-readable location name
  locationName: {
    type: String,
    default: null
  },
  city: {
    type: String,
    default: null
  },
  state: {
    type: String,
    default: null
  },
  country: {
    type: String,
    default: null
  },
  // Privacy controls
  shareWithFriends: {
    type: Boolean,
    default: true
  },
  // Always included in heatmap (non-toggleable per requirements)
  includedInHeatmap: {
    type: Boolean,
    default: true
  },
  // Activity score for heatmap intensity
  activityScore: {
    type: Number,
    default: 1
  },
  // Last activity timestamp
  lastActivityAt: {
    type: Date,
    default: Date.now
  },
  // Is currently active (online)
  isActive: {
    type: Boolean,
    default: true
  },
  // Device info (for mobile detection)
  deviceType: {
    type: String,
    enum: ['mobile', 'desktop', 'unknown'],
    default: 'unknown'
  }
}, {
  timestamps: true
});

// Index for geospatial queries
locationPresenceSchema.index({ location: '2dsphere' });
locationPresenceSchema.index({ user: 1 });
locationPresenceSchema.index({ geohash: 1, isActive: 1 });

// TTL index - auto-delete stale locations after 24 hours
locationPresenceSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });

// Pre-save hook to generate geohash
locationPresenceSchema.pre('save', function(next) {
  if (this.location && this.location.coordinates) {
    const [lng, lat] = this.location.coordinates;
    this.geohash = encodeGeohash(lat, lng, 6);
  }
  next();
});

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

// Static method to update or create presence
locationPresenceSchema.statics.updatePresence = async function(userId, locationData, options = {}) {
  const { 
    latitude, 
    longitude, 
    precisionLevel = 5, 
    locationName,
    city,
    state,
    country,
    shareWithFriends = true,
    deviceType = 'unknown'
  } = options;
  
  // Round coordinates based on precision level
  const roundedCoords = roundCoordinates(longitude, latitude, precisionLevel);
  
  const presence = await this.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        location: {
          type: 'Point',
          coordinates: roundedCoords
        },
        precisionLevel,
        locationName,
        city,
        state,
        country,
        shareWithFriends,
        deviceType,
        lastActivityAt: new Date(),
        isActive: true
      }
    },
    { upsert: true, new: true }
  );
  
  return presence;
};

// Static method to get friends' locations
locationPresenceSchema.statics.getFriendsLocations = async function(userId) {
  const Friendship = require('./Friendship');
  
  // Get accepted friend IDs
  const friendships = await Friendship.find({
    $or: [
      { requester: userId, status: 'accepted' },
      { recipient: userId, status: 'accepted' }
    ]
  });
  
  const friendIds = friendships.map(f => 
    f.requester.toString() === userId.toString() ? f.recipient : f.requester
  );
  
  // Get friends' locations who have sharing enabled
  const locations = await this.find({
    user: { $in: friendIds },
    shareWithFriends: true,
    isActive: true
  }).populate('user', 'username realName avatarUrl');
  
  return locations;
};

// Static method to get heatmap data
locationPresenceSchema.statics.getHeatmapData = async function(bounds, precision = 6) {
  const pipeline = [
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [bounds.centerLng, bounds.centerLat]
        },
        distanceField: 'distance',
        maxDistance: bounds.radius || 100000, // meters
        spherical: true
      }
    },
    {
      $group: {
        _id: { $substr: ['$geohash', 0, precision] },
        count: { $sum: '$activityScore' },
        avgLat: { $avg: { $arrayElemAt: ['$location.coordinates', 1] } },
        avgLng: { $avg: { $arrayElemAt: ['$location.coordinates', 0] } }
      }
    },
    {
      $project: {
        _id: 0,
        geohash: '$_id',
        count: 1,
        lat: '$avgLat',
        lng: '$avgLng'
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Helper: Round coordinates based on precision
function roundCoordinates(lng, lat, precision) {
  // Precision levels:
  // 1 = ~156km (country)
  // 2 = ~39km (state)
  // 3 = ~4.9km (city)
  // 4 = ~0.61km (neighborhood)
  // 5 = ~0.076km (block)
  
  const precisionFactors = [100, 25, 0.5, 0.05, 0.005];
  const factor = precisionFactors[precision - 1] || 0.005;
  
  const roundedLng = Math.round(lng / factor) * factor;
  const roundedLat = Math.round(lat / factor) * factor;
  
  return [roundedLng, roundedLat];
}

// Instance method to deactivate
locationPresenceSchema.methods.deactivate = async function() {
  this.isActive = false;
  return this.save();
};

const LocationPresence = mongoose.model('LocationPresence', locationPresenceSchema);

module.exports = LocationPresence;
