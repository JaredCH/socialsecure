const mongoose = require('mongoose');
const { STATE_DISCOVERY_ROOMS, TOPIC_DISCOVERY_ROOMS } = require('../config/chatDiscoveryRooms');

const DEFAULT_DISCOVERY_ROOM_ENSURE_INTERVAL_MS = 5 * 60 * 1000;
let lastDefaultDiscoveryRoomEnsureAt = 0;

const chatRoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['city', 'state', 'county', 'event', 'topic'],
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
  eventRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EventSchedule',
    default: null
  },
  autoLifecycle: {
    type: Boolean,
    default: false
  },
  discoverable: {
    type: Boolean,
    default: true
  },
  visibilityWindow: {
    startAt: {
      type: Date,
      default: null
    },
    endAt: {
      type: Date,
      default: null
    }
  },
  stableKey: {
    type: String,
    default: null
  },
  archivedAt: {
    type: Date,
    default: null
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
chatRoomSchema.index({ discoverable: 1, type: 1, updatedAt: -1 });
chatRoomSchema.index({ eventRef: 1, type: 1 });
chatRoomSchema.index({ autoLifecycle: 1, 'visibilityWindow.endAt': 1 });
chatRoomSchema.index({ stableKey: 1 }, { unique: true, sparse: true });

const buildDefaultDiscoveryRoomOperations = (now) => {
  const operations = [];

  STATE_DISCOVERY_ROOMS.forEach((stateEntry) => {
    operations.push({
      updateOne: {
        filter: { stableKey: `state:${stateEntry.code}` },
        update: {
          $setOnInsert: {
            name: stateEntry.name,
            type: 'state',
            state: stateEntry.code,
            country: 'US',
            location: { type: 'Point', coordinates: [0, 0] },
            radius: 100,
            members: [],
            messageCount: 0,
            discoverable: true,
            autoLifecycle: false,
            stableKey: `state:${stateEntry.code}`,
            lastActivity: now
          }
        },
        upsert: true
      }
    });

    stateEntry.counties.forEach((countyName) => {
      operations.push({
        updateOne: {
          filter: { stableKey: `county:${stateEntry.code}:${countyName.toLowerCase()}` },
          update: {
            $setOnInsert: {
              name: `${countyName}, ${stateEntry.name}`,
              type: 'county',
              state: stateEntry.code,
              country: 'US',
              county: countyName,
              location: { type: 'Point', coordinates: [0, 0] },
              radius: 75,
              members: [],
              messageCount: 0,
              discoverable: true,
              autoLifecycle: false,
              stableKey: `county:${stateEntry.code}:${countyName.toLowerCase()}`,
              lastActivity: now
            }
          },
          upsert: true
        }
      });
    });
  });

  TOPIC_DISCOVERY_ROOMS.forEach((topicEntry) => {
    operations.push({
      updateOne: {
        filter: { stableKey: `topic:${topicEntry.key}` },
        update: {
          $setOnInsert: {
            name: topicEntry.name,
            type: 'topic',
            country: 'US',
            location: { type: 'Point', coordinates: [0, 0] },
            radius: 100,
            members: [],
            messageCount: 0,
            discoverable: true,
            autoLifecycle: false,
            stableKey: `topic:${topicEntry.key}`,
            lastActivity: now
          }
        },
        upsert: true
      }
    });
  });

  return operations;
};

chatRoomSchema.statics.ensureDefaultDiscoveryRooms = async function(options = {}) {
  const { force = false } = options;
  const nowTs = Date.now();
  if (!force && (nowTs - lastDefaultDiscoveryRoomEnsureAt) < DEFAULT_DISCOVERY_ROOM_ENSURE_INTERVAL_MS) {
    return;
  }

  const now = new Date(nowTs);
  const operations = buildDefaultDiscoveryRoomOperations(now);

  if (operations.length > 0) {
    await this.bulkWrite(operations, { ordered: false });
  }
  lastDefaultDiscoveryRoomEnsureAt = nowTs;
};

chatRoomSchema.statics.ensureDefaultStateRooms = async function(options = {}) {
  return this.ensureDefaultDiscoveryRooms(options);
};

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
  
  if (!zipCode && !state) {
    return { rooms: [], created: 0 };
  }
  
  const createdRooms = [];
  
  // Create/find zip-level room
  if (zipCode) {
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
