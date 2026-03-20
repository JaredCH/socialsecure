const mongoose = require('mongoose');
const { STATE_DISCOVERY_ROOMS, TOPIC_DISCOVERY_ROOMS } = require('../config/chatDiscoveryRooms');

const DEFAULT_DISCOVERY_ROOM_ENSURE_INTERVAL_MS = 5 * 60 * 1000;
let lastDefaultDiscoveryRoomEnsureAt = 0;
const DEFAULT_DISCOVERY_ROOM_LOCATION = Object.freeze({ type: 'Point', coordinates: [0, 0] });
const DEFAULT_STATE_DISCOVERY_BY_CODE = new Map(
  STATE_DISCOVERY_ROOMS.map((stateEntry) => [stateEntry.code, stateEntry])
);
const DEFAULT_STATE_DISCOVERY_BY_NAME = new Map(
  STATE_DISCOVERY_ROOMS.map((stateEntry) => [stateEntry.name.toLowerCase(), stateEntry])
);

const normalizeLocationToken = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeCountryCode = (value) => normalizeLocationToken(value).toUpperCase();
const slugifyCountyToken = (value) => String(value || '').trim().toLowerCase()
  .replace(/\s+/g, '-')
  .replace(/[^a-z0-9-]/g, '')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const resolveCanonicalStateCode = (state) => {
  const token = normalizeLocationToken(state);
  if (!token) return '';
  const byCode = DEFAULT_STATE_DISCOVERY_BY_CODE.get(token.toUpperCase());
  if (byCode) return byCode.code;
  const byName = DEFAULT_STATE_DISCOVERY_BY_NAME.get(token.toLowerCase());
  if (byName) return byName.code;
  return token.toUpperCase();
};

const buildCountyStableKey = (county, state, country) => {
  const countryCode = normalizeCountryCode(country || 'US');
  const stateCode = resolveCanonicalStateCode(state);
  const countySlug = slugifyCountyToken(county);
  if (!stateCode || !countySlug) return null;
  return `county:${countryCode}:${stateCode}:${countySlug}`;
};

const findDefaultStateDiscoveryEntry = (state, country) => {
  const normalizedState = normalizeLocationToken(state);
  const normalizedCountry = normalizeCountryCode(country || 'US');

  if (!normalizedState || normalizedCountry !== 'US') {
    return null;
  }

  return DEFAULT_STATE_DISCOVERY_BY_CODE.get(normalizedState.toUpperCase())
    || DEFAULT_STATE_DISCOVERY_BY_NAME.get(normalizedState.toLowerCase())
    || null;
};

const findDefaultCityDiscoveryName = (stateEntry, city) => {
  if (!stateEntry || !Array.isArray(stateEntry.cities)) return null;

  const normalizedCity = normalizeLocationToken(city);
  if (!normalizedCity) return null;

  return stateEntry.cities.find((cityName) => cityName.toLowerCase() === normalizedCity.toLowerCase()) || null;
};

const getCanonicalDiscoveryRoomData = ({ type, city, state, country }) => {
  const stateEntry = findDefaultStateDiscoveryEntry(state, country);
  if (!stateEntry) {
    return null;
  }

  if (type === 'state') {
    return {
      stableKey: `state:${stateEntry.code}`,
      name: stateEntry.name,
      state: stateEntry.code,
      country: 'US',
      county: undefined,
      location: { type: 'Point', coordinates: [...DEFAULT_DISCOVERY_ROOM_LOCATION.coordinates] },
      radius: 100,
      discoverable: true,
      autoLifecycle: false
    };
  }

  if (type === 'city' && city) {
    const matchedCity = findDefaultCityDiscoveryName(stateEntry, city);
    if (!matchedCity) {
      return null;
    }

    return {
      stableKey: `city:${stateEntry.code}:${matchedCity.toLowerCase()}`,
      name: `${matchedCity}, ${stateEntry.name}`,
      state: stateEntry.code,
      country: 'US',
      city: matchedCity,
      location: { type: 'Point', coordinates: [...DEFAULT_DISCOVERY_ROOM_LOCATION.coordinates] },
      radius: 50,
      discoverable: true,
      autoLifecycle: false
    };
  }

  return null;
};

const buildLocationRoomQuery = ({ type, city, state, country, county, zipCode }) => {
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

  return query;
};

const getRegisteredModel = (modelName) => {
  try {
    return mongoose.models[modelName] || mongoose.model(modelName);
  } catch (error) {
    return null;
  }
};

const getLatestDate = (...values) => values.reduce((latest, current) => {
  if (!current) return latest;
  const currentDate = new Date(current);
  if (!latest || currentDate > latest) {
    return currentDate;
  }
  return latest;
}, null);

const getDiscoveryGroupForType = (type) => {
  if (type === 'state') return 'states';
  if (type === 'topic') return 'topics';
  return null;
};

const isDuplicateKeyBulkWriteError = (error) => {
  if (!error) return false;
  if (error?.code === 11000) return true;
  if (Array.isArray(error?.writeErrors) && error.writeErrors.length > 0) {
    return error.writeErrors.every((entry) => entry?.code === 11000);
  }
  return false;
};

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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
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
    default: undefined
  },
  discoveryGroup: {
    type: String,
    enum: ['states', 'topics', null],
    default: null
  },
  parentRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom',
    default: null
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  defaultLanding: {
    type: Boolean,
    default: false
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
chatRoomSchema.index({ archivedAt: 1, discoveryGroup: 1, parentRoomId: 1, sortOrder: 1 });

const buildDefaultDiscoveryRoomOperations = (now) => {
  const operations = [];

  STATE_DISCOVERY_ROOMS.forEach((stateEntry, index) => {
    operations.push({
      updateOne: {
        filter: { stableKey: `state:${stateEntry.code}` },
        update: {
          $set: {
            type: 'state',
            state: stateEntry.code,
            country: 'US',
            discoveryGroup: 'states',
            parentRoomId: null
          },
          $setOnInsert: {
            name: stateEntry.name,
            location: { type: 'Point', coordinates: [...DEFAULT_DISCOVERY_ROOM_LOCATION.coordinates] },
            radius: 100,
            members: [],
            messageCount: 0,
            discoverable: true,
            autoLifecycle: false,
            sortOrder: index,
            defaultLanding: false,
            stableKey: `state:${stateEntry.code}`,
            lastActivity: now
          }
        },
        upsert: true
      }
    });
  });

  TOPIC_DISCOVERY_ROOMS.forEach((topicEntry, index) => {
    operations.push({
      updateOne: {
        filter: { stableKey: `topic:${topicEntry.key}` },
        update: {
          $set: {
            type: 'topic',
            country: 'US',
            discoveryGroup: 'topics',
            parentRoomId: null,
            defaultLanding: Boolean(topicEntry.defaultLanding)
          },
          $setOnInsert: {
            name: topicEntry.name,
            location: { type: 'Point', coordinates: [...DEFAULT_DISCOVERY_ROOM_LOCATION.coordinates] },
            radius: 100,
            members: [],
            messageCount: 0,
            discoverable: true,
            autoLifecycle: false,
            sortOrder: index,
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

const buildDuplicateDiscoveryRoomQuery = () => {
  const stateIdentifiers = STATE_DISCOVERY_ROOMS.flatMap((stateEntry) => [stateEntry.code, stateEntry.name]);

  return {
    $or: [
      {
        type: 'state',
        state: { $in: stateIdentifiers }
      },
      {
        type: 'city',
        state: { $in: stateIdentifiers },
        stableKey: { $exists: true, $ne: null }
      }
    ]
  };
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
    try {
      await this.bulkWrite(operations, { ordered: false });
    } catch (error) {
      if (!isDuplicateKeyBulkWriteError(error)) {
        throw error;
      }
    }
  }
  await this.reconcileDefaultDiscoveryRoomDuplicates();
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

  // Normalize state/country to canonical codes for county rooms
  const normalizedCountry = normalizeCountryCode(country || 'US') || 'US';
  const normalizedState = type === 'county' || type === 'state'
    ? resolveCanonicalStateCode(state) || state
    : state;

  const canonicalDiscoveryRoom = getCanonicalDiscoveryRoomData({ type, city, state: normalizedState, country: normalizedCountry });

  // Build county stable key for deterministic lookup
  const countyStableKey = type === 'county' ? buildCountyStableKey(county, normalizedState, normalizedCountry) : null;

  const query = {
    ...buildLocationRoomQuery({ type, city, state: normalizedState, country: normalizedCountry, county, zipCode }),
    archivedAt: null,
    discoverable: { $ne: false }
  };

  // Try to find by stable key first (canonical discovery rooms or county rooms)
  let room;
  if (canonicalDiscoveryRoom) {
    room = await this.findOne({ stableKey: canonicalDiscoveryRoom.stableKey, archivedAt: null, discoverable: { $ne: false } });
  } else if (countyStableKey) {
    room = await this.findOne({ stableKey: countyStableKey, archivedAt: null, discoverable: { $ne: false } });
  } else {
    room = await this.findOne(query);
  }

  if (!room && canonicalDiscoveryRoom) {
    const archivedCanonicalRoom = await this.findOne({
      stableKey: canonicalDiscoveryRoom.stableKey,
      archivedAt: { $ne: null }
    });
    if (archivedCanonicalRoom) {
      return { room: null, created: false };
    }
  }

  if (!room && countyStableKey) {
    const archivedCountyRoom = await this.findOne({
      stableKey: countyStableKey,
      archivedAt: { $ne: null }
    });
    if (archivedCountyRoom) {
      return { room: null, created: false };
    }
  }

  if (!room && canonicalDiscoveryRoom) {
    room = await this.findOne(query);
    if (room) {
      room.name = canonicalDiscoveryRoom.name;
      room.state = canonicalDiscoveryRoom.state;
      room.country = canonicalDiscoveryRoom.country;
      if (canonicalDiscoveryRoom.city) room.city = canonicalDiscoveryRoom.city;
      room.location = canonicalDiscoveryRoom.location;
      room.radius = canonicalDiscoveryRoom.radius;
      room.discoverable = canonicalDiscoveryRoom.discoverable;
      room.autoLifecycle = canonicalDiscoveryRoom.autoLifecycle;
      room.stableKey = canonicalDiscoveryRoom.stableKey;
      await room.save();
      return { room, created: false };
    }
  }

  // Upgrade legacy county rooms (matching by query but missing stableKey) to use stable key
  if (!room && countyStableKey) {
    room = await this.findOne(query);
    if (room) {
      room.stableKey = countyStableKey;
      room.state = normalizedState;
      room.country = normalizedCountry;
      await room.save();
      return { room, created: false };
    }
  }
  
  // If room exists, return it (preserve existing data - idempotent)
  if (room) {
    return { room, created: false };
  }
  
  // Create room name based on location type
  let name;
  if (type === 'city') {
    name = zipCode
      ? (city ? `${city} (ZIP ${zipCode})` : `ZIP ${zipCode}`)
      : (city ? `${city}, ${normalizedState || ''}` : 'Unknown City');
  } else if (canonicalDiscoveryRoom) {
    name = canonicalDiscoveryRoom.name;
  } else if (type === 'state') {
    name = normalizedState || 'Unknown State';
  } else if (type === 'county') {
    name = county ? `${county}, ${normalizedState || ''}` : 'Unknown County';
  } else {
    name = 'Unknown Location';
  }
  
  // Create new room with provided coordinates
  // Only set metadata on initial creation - preserves existing room data
  room = new this({
    name: name.trim(),
    type,
    city: type === 'city' ? (canonicalDiscoveryRoom?.city || city) : undefined,
    state: canonicalDiscoveryRoom?.state || normalizedState,
    country: canonicalDiscoveryRoom?.country || normalizedCountry,
    county: type === 'county' ? county : undefined,
    zipCode: (type === 'city' && !canonicalDiscoveryRoom) ? zipCode : undefined,
    location: {
      type: 'Point',
      coordinates: canonicalDiscoveryRoom?.location?.coordinates || coordinates || [0, 0]
    },
    radius: canonicalDiscoveryRoom?.radius || radius,
    discoverable: canonicalDiscoveryRoom?.discoverable,
    autoLifecycle: canonicalDiscoveryRoom?.autoLifecycle,
    discoveryGroup: getDiscoveryGroupForType(type),
    parentRoomId: null,
    defaultLanding: false,
    stableKey: canonicalDiscoveryRoom?.stableKey || countyStableKey || undefined,
    members: [],
    messageCount: 0,
    lastActivity: new Date()
  });
  
  await room.save();
  
  return { room, created: true };
};

chatRoomSchema.statics.reconcileDefaultDiscoveryRoomDuplicates = async function() {
  const candidateRooms = await this.find(buildDuplicateDiscoveryRoomQuery())
    .select('_id type city state country stableKey members messageCount lastActivity')
    .lean();
  if (!Array.isArray(candidateRooms) || candidateRooms.length === 0) {
    return;
  }

  const groupedRooms = candidateRooms.reduce((acc, room) => {
    const canonical = getCanonicalDiscoveryRoomData({
      type: room.type,
      city: room.city,
      state: room.state,
      country: room.country
    });

    if (!canonical) {
      return acc;
    }

    if (!acc.has(canonical.stableKey)) {
      acc.set(canonical.stableKey, {
        canonical,
        rooms: []
      });
    }

    acc.get(canonical.stableKey).rooms.push(room);
    return acc;
  }, new Map());

  for (const { canonical, rooms } of groupedRooms.values()) {
    if (rooms.length < 2) {
      continue;
    }

    const canonicalRoom = rooms.find((room) => room.stableKey === canonical.stableKey);
    if (!canonicalRoom) {
      continue;
    }

    const duplicates = rooms.filter((room) => String(room._id) !== String(canonicalRoom._id));
    if (duplicates.length === 0) {
      continue;
    }

    const duplicateIds = duplicates.map((room) => room._id);
    const mergedMembers = [];
    const memberIds = new Set();
    [canonicalRoom, ...duplicates].forEach((room) => {
      const roomMembers = Array.isArray(room.members) ? room.members : [];
      roomMembers.forEach((memberId) => {
        const key = String(memberId);
        if (!memberIds.has(key)) {
          memberIds.add(key);
          mergedMembers.push(memberId);
        }
      });
    });

    const mergedLastActivity = getLatestDate(...[canonicalRoom, ...duplicates].map((room) => room.lastActivity)) || canonicalRoom.lastActivity;
    const mergedMessageCount = [canonicalRoom, ...duplicates].reduce((sum, room) => {
      const count = Number(room.messageCount);
      return sum + (Number.isFinite(count) ? count : 0);
    }, 0);

    const ChatMessage = getRegisteredModel('ChatMessage');
    const RoomKeyPackage = getRegisteredModel('RoomKeyPackage');
    const Notification = getRegisteredModel('Notification');

    if (ChatMessage) {
      await ChatMessage.updateMany(
        { roomId: { $in: duplicateIds } },
        { $set: { roomId: canonicalRoom._id } }
      );
    }

    if (RoomKeyPackage) {
      await RoomKeyPackage.updateMany(
        { roomId: { $in: duplicateIds } },
        { $set: { roomId: canonicalRoom._id } }
      );
    }

    if (Notification) {
      await Notification.updateMany(
        { 'data.roomId': { $in: duplicateIds } },
        { $set: { 'data.roomId': canonicalRoom._id } }
      );
    }

    await this.updateOne(
      { _id: canonicalRoom._id },
      {
        $set: {
          name: canonical.name,
          city: canonical.city,
          state: canonical.state,
          country: canonical.country,
          location: canonical.location,
          radius: canonical.radius,
          discoverable: canonical.discoverable,
          autoLifecycle: canonical.autoLifecycle,
          members: mergedMembers,
          messageCount: mergedMessageCount,
          lastActivity: mergedLastActivity
        }
      }
    );

    await this.deleteMany({ _id: { $in: duplicateIds } });
  }
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
  const ensureMembership = async (room) => {
    if (!room) return;
    const members = Array.isArray(room.members) ? room.members : [];
    const isMember = members.some((memberId) => String(memberId) === String(user._id));
    if (isMember) return;
    room.members = members;
    room.members.push(user._id);
    await room.save();
  };
  
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
    
    await ensureMembership(room);
    
    if (created) createdRooms.push(room);
  }

  if (county && state) {
    const { room, created } = await this.findOrCreateByLocation({
      type: 'county',
      county,
      state,
      country,
      coordinates: [longitude, latitude],
      radius: 75
    });

    await ensureMembership(room);

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
    
    await ensureMembership(room);
    
    if (created) createdRooms.push(room);
  }
  
  return {
    rooms: createdRooms,
    created: createdRooms.length
  };
};

// Static method to expand city chat rooms based on a user's zip code during registration.
// Rules:
// - If the zip resolves to a single city, create that city room if it doesn't already exist.
// - If the zip resolves to multiple nearby cities, create up to 3 per registration.
// - If the zip was seen before and has additional cities, add up to 3 more.
chatRoomSchema.statics.expandCityRoomsForZip = async function({ zipCode, city, state, country, coordinates } = {}) {
  if (!zipCode || !state) return { created: [] };

  const MAX_CITIES_PER_BATCH = 3;
  const ZipLocationIndexModel = getRegisteredModel('ZipLocationIndex');
  const normalizedState = normalizeLocationToken(state).toUpperCase();

  // Find city rooms already tied to this exact zip code
  const existingZipRoom = await this.findOne({ type: 'city', zipCode });
  const created = [];

  // Resolve the primary city room (seeded or zip-based)
  if (city) {
    const stateEntry = findDefaultStateDiscoveryEntry(state, country || 'US');
    const isSeededCity = stateEntry && findDefaultCityDiscoveryName(stateEntry, city);

    if (isSeededCity) {
      // City is in the seeded top-10 – room already exists via seed; nothing to create.
    } else if (!existingZipRoom) {
      // Create a zip-based city room for the primary city
      const { room, created: wasCreated } = await this.findOrCreateByLocation({
        type: 'city',
        city,
        state: normalizedState,
        country: country || 'US',
        zipCode,
        coordinates: coordinates || [0, 0],
        radius: 25
      });
      if (wasCreated) created.push(room);
    }
  }

  // Look for additional nearby cities from the ZipLocationIndex
  if (coordinates && Array.isArray(coordinates) && coordinates.length === 2 && ZipLocationIndexModel) {
    const [lon, lat] = coordinates.map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      // Collect city names we already have rooms for in this state
      const existingCityRooms = await this.find({
        type: 'city',
        state: normalizedState
      }).select('city zipCode stableKey').lean();

      const seenCityKeys = new Set();
      for (const room of existingCityRooms) {
        if (room.city) seenCityKeys.add(room.city.toLowerCase());
        if (room.zipCode) seenCityKeys.add(`zip:${room.zipCode}`);
      }
      for (const newRoom of created) {
        if (newRoom.city) seenCityKeys.add(newRoom.city.toLowerCase());
        if (newRoom.zipCode) seenCityKeys.add(`zip:${newRoom.zipCode}`);
      }
      if (city) seenCityKeys.add(city.toLowerCase());
      seenCityKeys.add(`zip:${zipCode}`);

      // ~0.3 degrees ≈ 20 miles at mid-latitudes
      const nearbyEntries = await ZipLocationIndexModel.find({
        $or: [
          { stateCode: { $regex: new RegExp(`^${normalizedState}$`, 'i') } },
          { state: { $regex: new RegExp(`^${normalizedState}$`, 'i') } }
        ],
        latitude: { $gte: lat - 0.3, $lte: lat + 0.3 },
        longitude: { $gte: lon - 0.3, $lte: lon + 0.3 }
      }).lean();

      for (const entry of nearbyEntries) {
        if (created.length >= MAX_CITIES_PER_BATCH) break;

        const entryCity = (entry.city || '').trim();
        const entryZip = (entry.zipCode || '').trim();
        if (!entryCity || !entryZip) continue;
        if (seenCityKeys.has(entryCity.toLowerCase()) || seenCityKeys.has(`zip:${entryZip}`)) continue;

        seenCityKeys.add(entryCity.toLowerCase());
        seenCityKeys.add(`zip:${entryZip}`);

        // Skip if the city is a seeded top-10 city (room already exists)
        const stateEntry = findDefaultStateDiscoveryEntry(normalizedState, 'US');
        if (stateEntry && findDefaultCityDiscoveryName(stateEntry, entryCity)) continue;

        const { room, created: wasCreated } = await this.findOrCreateByLocation({
          type: 'city',
          city: entryCity,
          state: entry.stateCode || normalizedState,
          country: 'US',
          zipCode: entryZip,
          coordinates: [Number(entry.longitude), Number(entry.latitude)],
          radius: 25
        });
        if (wasCreated) created.push(room);
      }
    }
  }

  return { created };
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
