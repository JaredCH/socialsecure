const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import models
const LocationPresence = require('../models/LocationPresence');
const Spotlight = require('../models/Spotlight');
const HeatmapAggregation = require('../models/HeatmapAggregation');
const User = require('../models/User');

const parseCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePositiveInteger = (value, fallbackValue) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
};

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const jwt = require('jsonwebtoken');
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Optional authentication (for public endpoints)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    req.user = null;
    return next();
  }
  
  const jwt = require('jsonwebtoken');
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    req.user = err ? null : user;
    next();
  });
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
    
    const presence = await LocationPresence.findOneAndUpdate(
      { user: req.user.userId },
      { $set: { shareWithFriends } },
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
    
    // Return coarse (already rounded by precision level) coordinates for map display
    const sanitized = locations.map(loc => {
      const [lng = null, lat = null] = loc.location?.coordinates || [];
      return {
        user: {
          _id: loc.user._id,
          username: loc.user.username,
          realName: loc.user.realName,
          avatarUrl: loc.user.avatarUrl
        },
        lat,
        lng,
        locationName: loc.locationName,
        city: loc.city,
        state: loc.state,
        country: loc.country,
        precisionLevel: loc.precisionLevel,
        lastActivityAt: loc.lastActivityAt,
        isActive: loc.isActive
      };
    });
    
    res.json({ friends: sanitized });
  } catch (error) {
    console.error('Error getting friends locations:', error);
    res.status(500).json({ error: 'Failed to get friends locations' });
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
      console.log('Warning: Spotlight created from non-mobile device');
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
 * Get heatmap data for a region
 */
router.get('/heatmap', optionalAuth, async (req, res) => {
  try {
    const { north, south, east, west, precision = 5 } = req.query;

    const parsedNorth = parseCoordinate(north);
    const parsedSouth = parseCoordinate(south);
    const parsedEast = parseCoordinate(east);
    const parsedWest = parseCoordinate(west);
    const parsedPrecision = parsePositiveInteger(precision, 5);
    
    if (
      parsedNorth === null ||
      parsedSouth === null ||
      parsedEast === null ||
      parsedWest === null
    ) {
      return res.status(400).json({ error: 'Bounding box coordinates required (north, south, east, west)' });
    }
    
    const bounds = {
      north: parsedNorth,
      south: parsedSouth,
      east: parsedEast,
      west: parsedWest
    };
    
    // Try to get cached aggregation first
    let tiles = await HeatmapAggregation.getTiles(bounds, parsedPrecision);
    
    // If no cached data, compute on-the-fly
    if (tiles.length === 0) {
      await HeatmapAggregation.recomputeRegion(bounds, parsedPrecision);
      tiles = await HeatmapAggregation.getTiles(bounds, parsedPrecision);
    }
    
    // Format response - anonymized, no user IDs
    const heatmapData = tiles.map(tile => ({
      lat: tile.center.lat,
      lng: tile.center.lng,
      intensity: Math.min(tile.data.userCount / 10, 1), // Normalize 0-1
      userCount: tile.data.userCount,
      spotlightCount: tile.data.spotlightCount
    }));
    
    res.json({ heatmap: heatmapData });
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
    const result = await Spotlight.cleanupExpired();
    console.log(`Cleaned up ${result.nModified || 0} expired spotlights`);
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
    
    console.log('Heatmap recomputation complete');
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
  
  console.log('Maps scheduled jobs started');
}

function stopScheduledJobs() {
  if (cleanupInterval) clearInterval(cleanupInterval);
  if (heatmapInterval) clearInterval(heatmapInterval);
  console.log('Maps scheduled jobs stopped');
}

// Export for server.js
module.exports = {
  router,
  startScheduledJobs,
  stopScheduledJobs,
  cleanupJob,
  heatmapJob
};
