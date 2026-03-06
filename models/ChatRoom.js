const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['city', 'state', 'county'],
    required: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  radius: {
    type: Number,
    default: 50, // miles
    min: 1,
    max: 500
  },
  city: String,
  state: String,
  country: String,
  county: String,
  zipCode: String,
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  messageCount: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  settings: {
    allowAnonymous: {
      type: Boolean,
      default: false
    },
    moderationLevel: {
      type: String,
      enum: ['none', 'low', 'medium', 'high'],
      default: 'medium'
    },
    maxMessageLength: {
      type: Number,
      default: 1000
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Geospatial index for location-based queries
chatRoomSchema.index({ location: '2dsphere' });
chatRoomSchema.index({ type: 1, city: 1, state: 1, country: 1 });
chatRoomSchema.index({ type: 1, zipCode: 1 });

// Static method to find rooms near a location
chatRoomSchema.statics.findNearby = function(longitude, latitude, maxDistanceMiles = 50) {
  // Convert miles to radians (approx 1 mile = 1/3959 radians)
  const maxDistanceRadians = maxDistanceMiles / 3959;
   
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistanceRadians
      }
    }
  }).limit(20);
};

// Static method to find or create a room by location (idempotent)
chatRoomSchema.statics.findOrCreateByLocation = async function(locationData) {
  const { type, city, state, country, county, zipCode, coordinates, radius = 50 } = locationData;
  
  // Build query for existing room
  const query = { type };
  if (type === 'city') {
    if (zipCode) {
      query.zipCode = zipCode;
    } else {
      query.city = city;
      query.state = state;
      query.country = country;
    }
  } else if (type === 'state') {
    query.state = state;
    query.country = country;
  } else if (type === 'county') {
    query.state = state;
    query.country = country;
    query.county = county;
  }
  
  // Try to find existing room first
  let room = await this.findOne(query);
  
  // If room exists, return it (preserve existing data - idempotent)
  if (room) {
    return { room, created: false };
  }
  
  // Create room name based on location type
  let name;
  if (type === 'city') {
    name = zipCode
      ? (city ? `${city} (ZIP ${zipCode})` : `ZIP ${zipCode}`)
      : (city ? `${city}, ${state || ''}` : 'Unknown City');
  } else if (type === 'state') {
    name = state || 'Unknown State';
  } else if (type === 'county') {
    name = county ? `${county}, ${state || ''}` : 'Unknown County';
  } else {
    name = 'Unknown Location';
  }
  
  // Create new room with provided coordinates
  // Only set metadata on initial creation - preserves existing room data
  room = new this({
    name: name.trim(),
    type,
    city: type === 'city' ? city : undefined,
    state,
    country,
    county: type === 'county' ? county : undefined,
    zipCode: type === 'city' ? zipCode : undefined,
    location: {
      type: 'Point',
      coordinates: coordinates || [0, 0]
    },
    radius,
    members: [],
    messageCount: 0,
    lastActivity: new Date()
  });
  
  await room.save();
  
  return { room, created: true };
};

// Static method to sync user's location rooms
chatRoomSchema.statics.syncUserLocationRooms = async function(user) {
  if (!user || !user.location || !user.location.coordinates) {
    return { rooms: [], created: 0 };
  }
  
  const [longitude, latitude] = user.location.coordinates;
  const { city, state, country, county, zipCode } = user;
  
  if (!zipCode && !city && !state && !country) {
    return { rooms: [], created: 0 };
  }
  
  const createdRooms = [];
  
  // Create/find city-level room
  if (zipCode || city) {
    const { room, created } = await this.findOrCreateByLocation({
      type: 'city',
      city,
      state,
      country,
      county,
      zipCode,
      coordinates: [longitude, latitude],
      radius: 25
    });
    
    // Add user as member if not already
    if (!room.members.includes(user._id)) {
      room.members.push(user._id);
      await room.save();
    }
    
    if (created) createdRooms.push(room);
  }
  
  // Create/find state-level room
  if (state) {
    const { room, created } = await this.findOrCreateByLocation({
      type: 'state',
      state,
      country,
      coordinates: [longitude, latitude],
      radius: 100
    });
    
    // Add user as member if not already
    if (!room.members.includes(user._id)) {
      room.members.push(user._id);
      await room.save();
    }
    
    if (created) createdRooms.push(room);
  }
  
  return {
    rooms: createdRooms,
    created: createdRooms.length
  };
};

// Method to add member to room
chatRoomSchema.methods.addMember = function(userId) {
  if (!this.members.includes(userId)) {
    this.members.push(userId);
  }
  return this.save();
};

// Method to remove member from room
chatRoomSchema.methods.removeMember = function(userId) {
  const index = this.members.indexOf(userId);
  if (index > -1) {
    this.members.splice(index, 1);
  }
  return this.save();
};

// Method to check if user is within radius
chatRoomSchema.methods.isUserWithinRadius = function(userLongitude, userLatitude) {
  // Simple distance calculation using Haversine formula
  const toRad = (deg) => deg * Math.PI / 180;
  const R = 3959; // Earth's radius in miles
  
  const lat1 = toRad(this.location.coordinates[1]);
  const lon1 = toRad(this.location.coordinates[0]);
  const lat2 = toRad(userLatitude);
  const lon2 = toRad(userLongitude);
  
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return distance <= this.radius;
};

// Method to increment message count
chatRoomSchema.methods.incrementMessageCount = function() {
  this.messageCount += 1;
  this.lastActivity = new Date();
  return this.save();
};

module.exports = mongoose.model('ChatRoom', chatRoomSchema);
