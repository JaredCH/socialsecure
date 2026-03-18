const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const NodeGeocoder = require('node-geocoder');
const rateLimit = require('express-rate-limit');

// Import models
const LocationPresence = require('../models/LocationPresence');
const Spotlight = require('../models/Spotlight');
const HeatmapAggregation = require('../models/HeatmapAggregation');
const FavoriteLocation = require('../models/FavoriteLocation');
const User = require('../models/User');
const {
  requireAuth: authenticateToken,
  optionalAuth,
  authErrorHandler
} = require('../middleware/parseAuthToken');

const parseCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePositiveInteger = (value, fallbackValue) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
};

const FRIENDS_LIVE_WINDOW_MS = 60 * 1000;
const FEET_TO_METERS = 0.3048;
const HEATMAP_LOCATION_JITTER_RADIUS_METERS = 200 * FEET_TO_METERS;
const HEATMAP_TIME_JITTER_MAX_MS = 30 * 60 * 1000;
const HEATMAP_QUERY_MAX_RADIUS_METERS = 2000 * FEET_TO_METERS;
const EARTH_RADIUS_METERS = 6378137;
const favoriteLocationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many favorite location requests. Please try again shortly.' }
});
const geocoder = NodeGeocoder({
  provider: 'openstreetmap',
  httpAdapter: 'https',
  formatter: null
});

const jitterCoordinates = (lat, lng, maxDistanceMeters = HEATMAP_LOCATION_JITTER_RADIUS_METERS) => {
  // sqrt(random) keeps the resulting points uniformly distributed across the full circle area.
  const distance = Math.sqrt(Math.random()) * maxDistanceMeters;
  const bearing = Math.random() * 2 * Math.PI;
  const deltaLat = (distance * Math.cos(bearing)) / EARTH_RADIUS_METERS;
  const deltaLng = (distance * Math.sin(bearing)) / (EARTH_RADIUS_METERS * Math.cos((lat * Math.PI) / 180));

  return {
    lat: lat + (deltaLat * 180) / Math.PI,
    lng: lng + (deltaLng * 180) / Math.PI
  };
};

const getPlainTextAddress = (result = {}) => {
  const streetAddress = [result.streetNumber, result.streetName || result.street]
    .filter(Boolean)
    .join(' ')
    .trim();
  const parts = [
    result.city || result.town || result.village || null,
    result.state || result.region || null,
    result.country || null
  ].filter(Boolean);

  return result.formattedAddress || Array.from(new Set([streetAddress || null, ...parts].filter(Boolean))).join(', ') || null;
};

const getCoordinateFallbackLabel = (latitude, longitude) =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

const serializeFavoriteLocation = (favorite) => {
  const [lng = null, lat = null] = favorite.location?.coordinates || [];

  return {
    _id: favorite._id,
    address: favorite.address,
    lat,
    lng,
    city: favorite.city,
    state: favorite.state,
    country: favorite.country,
    sourceType: favorite.sourceType,
    createdAt: favorite.createdAt,
    updatedAt: favorite.updatedAt
  };
};

// ============================================
// LOCATION PRESENCE ENDPOINTS
// ============================================

/**
 * POST /api/maps/presence
 * Update user's location presence
 */
router.post('/presence', authenticateToken, async (req, res) => {
  try {
    const { 
      latitude, 
      longitude, 
      precisionLevel = 5,
      locationName,
      city,
      state,
      country,
      deviceType
    } = req.body;

    const parsedLatitude = parseCoordinate(latitude);
    const parsedLongitude = parseCoordinate(longitude);
    
    if (parsedLatitude === null || parsedLongitude === null) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }
    
    // Validate coordinates
    if (parsedLatitude < -90 || parsedLatitude > 90 || parsedLongitude < -180 || parsedLongitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }
    
    const presence = await LocationPresence.updatePresence(
      req.user.userId,
      { latitude: parsedLatitude, longitude: parsedLongitude },
      {
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        precisionLevel,
        locationName,
        city,
        state,
        country,
        deviceType
      }
    );
    
    res.json({ presence });
  } catch (error) {
    console.error('Error updating presence:', error);
    res.status(500).json({ error: 'Failed to update presence' });
  }
});

/**
 * GET /api/maps/presence
 * Get current user's presence
 */
router.get('/presence', authenticateToken, async (req, res) => {
  try {
    const presence = await LocationPresence.findOne({ user: req.user.userId });
    
    if (!presence) {
      return res.json({ presence: null });
    }
    
    res.json({ presence });
  } catch (error) {
    console.error('Error getting presence:', error);
    res.status(500).json({ error: 'Failed to get presence' });
  }
});

/**
 * PUT /api/maps/presence/privacy
 * Update privacy settings
 */
router.put('/presence/privacy', authenticateToken, async (req, res) => {
  try {
    const { shareWithFriends } = req.body;
    const updatePayload = { shareWithFriends };
    if (shareWithFriends === false) {
      updatePayload.lastActivityAt = new Date();
    }
    
    const presence = await LocationPresence.findOneAndUpdate(
      { user: req.user.userId },
      { $set: updatePayload },
      { new: true }
    );
    
    res.json({ 
      message: 'Privacy settings updated',
      shareWithFriends: presence?.shareWithFriends
    });
  } catch (error) {
    console.error('Error updating privacy:', error);
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

/**
 * DELETE /api/maps/presence
 * Deactivate current presence
 */
router.delete('/presence', authenticateToken, async (req, res) => {
  try {
    await LocationPresence.findOneAndUpdate(
      { user: req.user.userId },
      { $set: { isActive: false } }
    );
    
    res.json({ message: 'Presence deactivated' });
  } catch (error) {
    console.error('Error deactivating presence:', error);
    res.status(500).json({ error: 'Failed to deactivate presence' });
  }
});

// ============================================
// FRIEND LOCATION ENDPOINTS
// ============================================

/**
 * GET /api/maps/friends
 * Get friends' locations (only those who enabled sharing)
 */
router.get('/friends', authenticateToken, async (req, res) => {
  try {
    const locations = await LocationPresence.getFriendsLocations(req.user.userId);
    const now = Date.now();

    const sanitized = locations.map((loc) => {
      const lastActivityTime = loc.lastActivityAt ? new Date(loc.lastActivityAt).getTime() : 0;
      const hasRecentActivity = Boolean(lastActivityTime) && (now - lastActivityTime <= FRIENDS_LIVE_WINDOW_MS);
      const hasShareableLocation = Boolean(loc.location?.coordinates?.length >= 2) && Boolean(loc.shareWithFriends);
      const [rawLng = null, rawLat = null] = loc.location?.coordinates || [];

      return {
        user: {
          _id: loc.user._id,
          username: loc.user.username,
          realName: loc.user.realName,
          avatarUrl: loc.user.avatarUrl
        },
        lat: hasShareableLocation ? rawLat : null,
        lng: hasShareableLocation ? rawLng : null,
        locationName: hasShareableLocation ? loc.locationName : null,
        city: loc.city,
        state: loc.state,
        country: loc.country,
        precisionLevel: loc.precisionLevel,
        lastActivityAt: loc.lastActivityAt,
        liveAgeSeconds: lastActivityTime
          ? Math.max(0, Math.floor((now - lastActivityTime) / 1000))
          : null,
        isLive: Boolean(loc.isActive && hasRecentActivity),
        isActive: Boolean(loc.isActive),
        shareWithFriends: Boolean(loc.shareWithFriends),
        hasLocation: hasShareableLocation
      };
    });

    res.json({ friends: sanitized });
  } catch (error) {
    console.error('Error getting friends locations:', error);
    res.status(500).json({ error: 'Failed to get friends locations' });
  }
});

router.get('/favorites', authenticateToken, async (req, res) => {
  try {
    const favorites = await FavoriteLocation.find({ user: req.user.userId }).sort({ createdAt: -1 });
    res.json({ favorites: favorites.map(serializeFavoriteLocation) });
  } catch (error) {
    console.error('Error getting favorite locations:', error);
    res.status(500).json({ error: 'Failed to get favorite locations' });
  }
});

router.post('/favorites', favoriteLocationLimiter, authenticateToken, async (req, res) => {
  try {
    const rawAddress = typeof req.body.address === 'string' ? req.body.address.trim() : '';
    const parsedLatitude = parseCoordinate(req.body.latitude);
    const parsedLongitude = parseCoordinate(req.body.longitude);
    const hasCoordinates = parsedLatitude !== null && parsedLongitude !== null;

    if (!rawAddress && !hasCoordinates) {
      return res.status(400).json({ error: 'Address or latitude/longitude are required' });
    }

    let latitude = parsedLatitude;
    let longitude = parsedLongitude;
    let address = rawAddress;
    let city = null;
    let state = null;
    let country = null;
    const sourceType = rawAddress ? 'address' : 'current_location';

    if (rawAddress) {
      const results = await geocoder.geocode(rawAddress);
      if (!Array.isArray(results) || results.length === 0) {
        return res.status(404).json({ error: 'Address not found' });
      }

      const result = results[0];
      latitude = parseCoordinate(result.latitude);
      longitude = parseCoordinate(result.longitude);

      if (latitude === null || longitude === null) {
        return res.status(404).json({ error: 'Address did not resolve to coordinates' });
      }

      address = getPlainTextAddress(result) || rawAddress;
      city = result.city || result.town || result.village || null;
      state = result.state || result.region || null;
      country = result.country || null;
    } else {
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'Invalid coordinates' });
      }

      try {
        const results = await geocoder.reverse({ lat: latitude, lon: longitude });
        const result = Array.isArray(results) ? results[0] : null;
        if (result) {
          address = getPlainTextAddress(result) || getCoordinateFallbackLabel(latitude, longitude);
          city = result.city || result.town || result.village || null;
          state = result.state || result.region || null;
          country = result.country || null;
        } else {
          address = getCoordinateFallbackLabel(latitude, longitude);
        }
      } catch (geocodeError) {
        address = getCoordinateFallbackLabel(latitude, longitude);
      }
    }

    const favorite = await FavoriteLocation.create({
      user: req.user.userId,
      address,
      sourceType,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude]
      },
      city,
      state,
      country
    });

    res.status(201).json({ favorite: serializeFavoriteLocation(favorite) });
  } catch (error) {
    console.error('Error saving favorite location:', error);
    res.status(500).json({ error: 'Failed to save favorite location' });
  }
});

router.delete('/favorites/:id', authenticateToken, async (req, res) => {
  try {
    const favorite = await FavoriteLocation.findOneAndDelete({
      _id: req.params.id,
      user: req.user.userId
    });

    if (!favorite) {
      return res.status(404).json({ error: 'Favorite location not found' });
    }

    res.json({ message: 'Favorite location removed' });
  } catch (error) {
    console.error('Error removing favorite location:', error);
    res.status(500).json({ error: 'Failed to remove favorite location' });
  }
});

// ============================================
// SPOTLIGHT ENDPOINTS
// ============================================

/**
 * POST /api/maps/spotlight
 * Create a new spotlight
 */
router.post('/spotlight', authenticateToken, async (req, res) => {
  try {
    const { 
      latitude, 
      longitude, 
      locationName, 
      description, 
      category 
    } = req.body;

    const parsedLatitude = parseCoordinate(latitude);
    const parsedLongitude = parseCoordinate(longitude);
    
    if (parsedLatitude === null || parsedLongitude === null || !locationName) {
      return res.status(400).json({ error: 'Latitude, longitude, and locationName are required' });
    }
    
    // Check if mobile device (required for spotlight)
    const presence = await LocationPresence.findOne({ user: req.user.userId });
    if (presence && presence.deviceType !== 'mobile') {
      // Allow but warn - in production might require mobile
    }
    
    const spotlight = await Spotlight.createSpotlight(req.user.userId, {
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      locationName,
      description,
      category
    });
    
    await spotlight.populate('user', 'username realName avatarUrl');
    
    res.status(201).json({ spotlight });
  } catch (error) {
    if (error.message === 'Please wait before creating another spotlight') {
      return res.status(429).json({ error: error.message });
    }
    console.error('Error creating spotlight:', error);
    res.status(500).json({ error: 'Failed to create spotlight' });
  }
});

/**
 * POST /api/maps/spotlight/:id/react
 * React to a spotlight
 */
router.post('/spotlight/:id/react', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reactionType } = req.body;
    
    if (!reactionType) {
      return res.status(400).json({ error: 'Reaction type is required' });
    }
    
    const spotlight = await Spotlight.addReaction(id, req.user.userId, reactionType);
    await spotlight.populate('user', 'username realName avatarUrl');
    
    res.json({ spotlight });
  } catch (error) {
    if (error.message === 'Spotlight not found') {
      return res.status(404).json({ error: error.message });
    }
    console.error('Error adding reaction:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

/**
 * GET /api/maps/spotlight/nearby
 * Get spotlights near a location
 */
router.get('/spotlight/nearby', optionalAuth, async (req, res) => {
  try {
    const { lat, lng, radius = 5000, state, category } = req.query;

    const parsedLat = parseCoordinate(lat);
    const parsedLng = parseCoordinate(lng);
    const parsedRadius = parsePositiveInteger(radius, 5000);
    
    if (parsedLat === null || parsedLng === null) {
      return res.status(400).json({ error: 'Lat and lng are required' });
    }

    const publicStates = ['trending', 'public_glow'];
    const requestedStates = Array.isArray(state)
      ? state
      : typeof state === 'string' ? state.split(',').map((part) => part.trim()).filter(Boolean) : [];
    const requestedPublicStates = requestedStates.filter((candidate) => publicStates.includes(candidate));
    let resolvedStates = publicStates;
    if (requestedStates.length > 0 && requestedPublicStates.length > 0) {
      resolvedStates = requestedPublicStates;
    }
    
    const spotlights = await Spotlight.getByLocation(
      parsedLat,
      parsedLng,
      parsedRadius,
      { state: resolvedStates, category, limit: 50 }
    );
    
    res.json({ spotlights });
  } catch (error) {
    console.error('Error getting nearby spotlights:', error);
    res.status(500).json({ error: 'Failed to get spotlights' });
  }
});

/**
 * GET /api/maps/spotlight/friends
 * Get friends' spotlights
 */
router.get('/spotlight/friends', authenticateToken, async (req, res) => {
  try {
    const spotlights = await Spotlight.getFriendsSpotlights(req.user.userId);
    
    res.json({ spotlights });
  } catch (error) {
    console.error('Error getting friends spotlights:', error);
    res.status(500).json({ error: 'Failed to get friends spotlights' });
  }
});

/**
 * DELETE /api/maps/spotlight/:id
 * Deactivate a spotlight
 */
router.delete('/spotlight/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const spotlight = await Spotlight.findOne({ _id: id, user: req.user.userId });
    
    if (!spotlight) {
      return res.status(404).json({ error: 'Spotlight not found or not authorized' });
    }
    
    await spotlight.deactivate();
    
    res.json({ message: 'Spotlight deactivated' });
  } catch (error) {
    console.error('Error deactivating spotlight:', error);
    res.status(500).json({ error: 'Failed to deactivate spotlight' });
  }
});

// ============================================
// HEATMAP ENDPOINTS
// ============================================

/**
 * GET /api/maps/heatmap
 * Get anonymized user-presence circles within 2000 ft of the requested center.
 * Each returned point represents a single user's jittered location.
 */
router.get('/heatmap', optionalAuth, async (req, res) => {
  try {
    const { lat, lng } = req.query;

    const parsedLat = parseCoordinate(lat);
    const parsedLng = parseCoordinate(lng);

    if (parsedLat === null || parsedLng === null) {
      return res.status(400).json({ error: 'Center coordinates required (lat, lng)' });
    }

    // Query individual active presences within the hard-capped 2000 ft radius.
    const presences = await LocationPresence.find({
      isActive: true,
      includedInHeatmap: true,
      location: {
        $geoWithin: {
          $centerSphere: [
            [parsedLng, parsedLat],
            HEATMAP_QUERY_MAX_RADIUS_METERS / EARTH_RADIUS_METERS
          ]
        }
      }
    }).select('location').lean();

    // Return one anonymized point per user – no IDs, no counts, jittered coords.
    const heatmap = presences.map(presence => {
      const [pLng, pLat] = presence.location.coordinates;
      const jittered = jitterCoordinates(pLat, pLng);
      return { lat: jittered.lat, lng: jittered.lng, intensity: 1 };
    });

    res.json({ heatmap });
  } catch (error) {
    console.error('Error getting heatmap:', error);
    res.status(500).json({ error: 'Failed to get heatmap data' });
  }
});

// ============================================
// COMMUNITY/LOCAL MAP ENDPOINTS
// ============================================

/**
 * GET /api/maps/local
 * Get local map data (user's region)
 */
router.get('/local', optionalAuth, async (req, res) => {
  try {
    const { lat, lng, radius = 50000 } = req.query; // 50km default

    const parsedLat = parseCoordinate(lat);
    const parsedLng = parseCoordinate(lng);
    const parsedRadius = parsePositiveInteger(radius, 50000);
    
    if (parsedLat === null || parsedLng === null) {
      return res.status(400).json({ error: 'Lat and lng are required' });
    }
    
    // Get active spotlights in area
    const spotlights = await Spotlight.getByLocation(
      parsedLat,
      parsedLng,
      parsedRadius,
      { state: 'public_glow', limit: 20 }
    );
    
    // Get heatmap for area
    const bounds = {
      north: parsedLat + 1,
      south: parsedLat - 1,
      east: parsedLng + 1,
      west: parsedLng - 1
    };
    
    let heatmapTiles = await HeatmapAggregation.getTiles(bounds, 5);
    if (heatmapTiles.length === 0) {
      await HeatmapAggregation.recomputeRegion(bounds, 5);
      heatmapTiles = await HeatmapAggregation.getTiles(bounds, 5);
    }
    
    const heatmap = heatmapTiles.map(tile => ({
      lat: tile.center.lat,
      lng: tile.center.lng,
      intensity: Math.min(tile.data.userCount / 10, 1),
      userCount: tile.data.userCount
    }));
    
    res.json({
      spotlights: spotlights.map(s => {
        const [sLng = null, sLat = null] = s.location?.coordinates || [];
        return {
          _id: s._id,
          lat: sLat,
          lng: sLng,
          locationName: s.locationName,
          category: s.category,
          state: s.state,
          reactions: s.reactions,
          user: req.user && s.user ? { 
            username: s.user.username, 
            avatarUrl: s.user.avatarUrl 
          } : null
        };
      }),
      heatmap
    });
  } catch (error) {
    console.error('Error getting local map:', error);
    res.status(500).json({ error: 'Failed to get local map data' });
  }
});

/**
 * GET /api/maps/community
 * Get community map data (broader view)
 */
router.get('/community', optionalAuth, async (req, res) => {
  try {
    const { lat, lng, radius = 200000 } = req.query; // 200km default

    const parsedLat = parseCoordinate(lat);
    const parsedLng = parseCoordinate(lng);
    const parsedRadius = parsePositiveInteger(radius, 200000);
    
    if (parsedLat === null || parsedLng === null) {
      return res.status(400).json({ error: 'Lat and lng are required' });
    }
    
    // Get trending and public spotlights
    const spotlights = await Spotlight.getByLocation(
      parsedLat,
      parsedLng,
      parsedRadius,
      { state: ['trending', 'public_glow'], limit: 50 }
    );
    
    // Get heatmap for larger area
    const bounds = {
      north: parsedLat + 5,
      south: parsedLat - 5,
      east: parsedLng + 5,
      west: parsedLng - 5
    };
    
    let heatmapTiles = await HeatmapAggregation.getTiles(bounds, 4);
    if (heatmapTiles.length === 0) {
      await HeatmapAggregation.recomputeRegion(bounds, 4);
      heatmapTiles = await HeatmapAggregation.getTiles(bounds, 4);
    }
    
    const heatmap = heatmapTiles.map(tile => ({
      lat: tile.center.lat,
      lng: tile.center.lng,
      intensity: Math.min(tile.data.userCount / 20, 1),
      userCount: tile.data.userCount
    }));
    
    res.json({
      spotlights: spotlights.map(s => {
        const [sLng = null, sLat = null] = s.location?.coordinates || [];
        return {
          _id: s._id,
          lat: sLat,
          lng: sLng,
          locationName: s.locationName,
          category: s.category,
          state: s.state,
          reactions: s.reactions,
          user: s.user ? { 
            username: s.user.username, 
            avatarUrl: s.user.avatarUrl 
          } : null
        };
      }),
      heatmap
    });
  } catch (error) {
    console.error('Error getting community map:', error);
    res.status(500).json({ error: 'Failed to get community map data' });
  }
});

// ============================================
// SCHEDULED JOBS
// ============================================

// Cleanup expired spotlights
async function cleanupJob() {
  try {
    await Spotlight.cleanupExpired();
  } catch (error) {
    console.error('Error cleaning up spotlights:', error);
  }
}

// Recompute heatmap
async function heatmapJob() {
  try {
    // Get rough world bounds (expand as needed)
    const regions = [
      { north: 50, south: 25, east: -65, west: -130 },  // North America
      { north: 70, south: 35, east: 50, west: -10 },   // Europe
      { north: 45, south: -10, east: 145, west: 100 },  // Asia-Pacific
    ];
    
    for (const bounds of regions) {
      await HeatmapAggregation.recomputeRegion(bounds, 5);
    }
  } catch (error) {
    console.error('Error recomputing heatmap:', error);
  }
}

// Start scheduled jobs
let cleanupInterval = null;
let heatmapInterval = null;

function startScheduledJobs() {
  // Cleanup every 15 minutes
  cleanupInterval = setInterval(cleanupJob, 15 * 60 * 1000);
  
  // Recompute heatmap every 10 minutes
  heatmapInterval = setInterval(heatmapJob, 10 * 60 * 1000);
}

function stopScheduledJobs() {
  if (cleanupInterval) clearInterval(cleanupInterval);
  if (heatmapInterval) clearInterval(heatmapInterval);
}

router.use(authErrorHandler);

// Export for server.js
module.exports = {
  router,
  startScheduledJobs,
  stopScheduledJobs,
  cleanupJob,
  heatmapJob
};
