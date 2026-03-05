const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const NodeGeocoder = require('node-geocoder');
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');

// Initialize geocoder
const geocoder = NodeGeocoder({
  provider: 'openstreetmap',
  httpAdapter: 'https',
  formatter: null
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Update user's location
router.post('/update', [
  authenticateToken,
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('country').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const { latitude, longitude, city, state, country } = req.body;
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update location coordinates
    user.location = {
      type: 'Point',
      coordinates: [parseFloat(longitude), parseFloat(latitude)]
    };
    
    // Update city, state, country if provided
    if (city) user.city = city;
    if (state) user.state = state;
    if (country) user.country = country;
    
    // If city not provided, reverse geocode to get location details
    if (!city || !state || !country) {
      try {
        const geoResults = await geocoder.reverse({ lat: latitude, lon: longitude });
        if (geoResults && geoResults.length > 0) {
          const result = geoResults[0];
          if (!city) user.city = result.city || result.town || result.village;
          if (!state) user.state = result.state || result.region;
          if (!country) user.country = result.country;
        }
      } catch (geoError) {
        console.warn('Geocoding failed:', geoError.message);
        // Continue without geocoding results
      }
    }
    
    user.updatedAt = new Date();
    await user.save();
    
    // Sync location rooms for the user (auto-create rooms if needed)
    let locationRooms = [];
    try {
      const roomSyncResult = await ChatRoom.syncUserLocationRooms(user);
      locationRooms = roomSyncResult.rooms;
    } catch (roomError) {
      console.warn('Failed to sync location rooms:', roomError.message);
      // Continue - location update was successful even if room sync failed
    }
    
    res.json({
      success: true,
      message: 'Location updated successfully',
      location: {
        coordinates: user.location.coordinates,
        city: user.city,
        state: user.state,
        country: user.country
      },
      locationRooms: locationRooms.map(room => ({
        _id: room._id,
        name: room.name,
        type: room.type
      }))
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update location', details: error.message });
  }
});

// Find nearby cities based on coordinates
router.get('/cities', [
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('address').optional().trim()
], async (req, res) => {
  try {
    const { latitude, longitude, address, radius = 50 } = req.query;
    
    let lat, lon;
    
    // If address provided, geocode it
    if (address) {
      const geoResults = await geocoder.geocode(address);
      if (!geoResults || geoResults.length === 0) {
        return res.status(404).json({ error: 'Address not found' });
      }
      lat = geoResults[0].latitude;
      lon = geoResults[0].longitude;
    } else if (latitude && longitude) {
      lat = parseFloat(latitude);
      lon = parseFloat(longitude);
    } else {
      return res.status(400).json({ error: 'Either address or latitude/longitude required' });
    }
    
    // In a real implementation, you would query your database for cities
    // For now, we'll use reverse geocoding to get nearby cities
    const geoResults = await geocoder.reverse({ lat, lon });
    
    if (!geoResults || geoResults.length === 0) {
      return res.status(404).json({ error: 'No location data found' });
    }
    
    // Get current city info
    const currentLocation = geoResults[0];
    
    // Simulate nearby cities (in production, you'd have a cities database)
    const nearbyCities = [
      {
        name: currentLocation.city || currentLocation.town || currentLocation.village,
        state: currentLocation.state,
        country: currentLocation.country,
        distance: 0,
        coordinates: [lon, lat]
      },
      {
        name: 'Neighboring City 1',
        state: currentLocation.state,
        country: currentLocation.country,
        distance: 15,
        coordinates: [lon + 0.1, lat + 0.1]
      },
      {
        name: 'Neighboring City 2',
        state: currentLocation.state,
        country: currentLocation.country,
        distance: 30,
        coordinates: [lon - 0.1, lat + 0.05]
      }
    ];
    
    res.json({
      success: true,
      currentLocation: {
        city: currentLocation.city || currentLocation.town || currentLocation.village,
        state: currentLocation.state,
        country: currentLocation.country,
        coordinates: [lon, lat]
      },
      nearbyCities,
      radius: parseInt(radius)
    });
  } catch (error) {
    console.error('Error finding cities:', error);
    res.status(500).json({ error: 'Failed to find cities', details: error.message });
  }
});

// Validate and geocode an address
router.get('/validate', async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }
    
    const geoResults = await geocoder.geocode(address);
    
    if (!geoResults || geoResults.length === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }
    
    const result = geoResults[0];
    
    res.json({
      success: true,
      address: result.formattedAddress,
      location: {
        latitude: result.latitude,
        longitude: result.longitude,
        city: result.city || result.town || result.village,
        state: result.state || result.region,
        country: result.country,
        countryCode: result.countryCode
      },
      confidence: result.extra ? result.extra.confidence : 'medium'
    });
  } catch (error) {
    console.error('Error validating address:', error);
    res.status(500).json({ error: 'Failed to validate address', details: error.message });
  }
});

// Get user's current location
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId).select('location city state country');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      location: {
        coordinates: user.location.coordinates,
        city: user.city,
        state: user.state,
        country: user.country
      }
    });
  } catch (error) {
    console.error('Error fetching user location:', error);
    res.status(500).json({ error: 'Failed to fetch location', details: error.message });
  }
});

// Calculate distance between two points
router.post('/distance', [
  body('lat1').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude 1 required'),
  body('lon1').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude 1 required'),
  body('lat2').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude 2 required'),
  body('lon2').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude 2 required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const { lat1, lon1, lat2, lon2 } = req.body;
    
    // Haversine formula to calculate distance in miles
    const toRad = (deg) => deg * Math.PI / 180;
    const R = 3959; // Earth's radius in miles
    
    const lat1Rad = toRad(parseFloat(lat1));
    const lon1Rad = toRad(parseFloat(lon1));
    const lat2Rad = toRad(parseFloat(lat2));
    const lon2Rad = toRad(parseFloat(lon2));
    
    const dLat = lat2Rad - lat1Rad;
    const dLon = lon2Rad - lon1Rad;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    res.json({
      success: true,
      distance: {
        miles: distance,
        kilometers: distance * 1.60934,
        coordinates1: [parseFloat(lon1), parseFloat(lat1)],
        coordinates2: [parseFloat(lon2), parseFloat(lat2)]
      }
    });
  } catch (error) {
    console.error('Error calculating distance:', error);
    res.status(500).json({ error: 'Failed to calculate distance', details: error.message });
  }
});

// Get user's primary city and nearby cities based on zip code
router.get('/zip/:zipCode', authenticateToken, async (req, res) => {
  try {
    const { zipCode } = req.params;
    
    if (!zipCode || zipCode.length < 5) {
      return res.status(400).json({ error: 'Valid zip code required' });
    }

    // Try to resolve zip code to location
    let locationData = null;
    try {
      const results = await geocoder.geocode(`${zipCode}, United States`);
      if (results && results.length > 0) {
        const result = results[0];
        locationData = {
          zipCode: zipCode,
          city: result.city,
          state: result.state,
          country: result.country,
          latitude: result.latitude,
          longitude: result.longitude
        };
      }
    } catch (geoError) {
      console.warn('Geocoding failed for zip:', zipCode, geoError.message);
    }

    if (!locationData) {
      return res.status(404).json({ error: 'Could not resolve zip code to location' });
    }

    // Find or create primary city room
    let primaryRoom = await ChatRoom.findOne({
      city: locationData.city,
      state: locationData.state,
      isActive: true
    });

    // Find nearby cities (within 50 miles)
    const nearbyCities = await ChatRoom.find({
      isActive: true,
      $or: [
        { city: locationData.city, state: locationData.state },
        {
          location: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [locationData.longitude, locationData.latitude]
              },
              $maxDistance: 50 * 1609.34 // 50 miles in meters
            }
          }
        }
      ]
    }).limit(20);

    // Categorize rooms
    const primary = primaryRoom ? {
      _id: primaryRoom._id,
      name: primaryRoom.name,
      city: primaryRoom.city,
      state: primaryRoom.state,
      bucket: 'primary',
      memberCount: primaryRoom.memberCount || 0
    } : null;

    const nearby = nearbyCities
      .filter(r => r._id.toString() !== primaryRoom?._id?.toString())
      .map(r => ({
        _id: r._id,
        name: r.name,
        city: r.city,
        state: r.state,
        bucket: 'nearby',
        memberCount: r.memberCount || 0
      }));

    // Update user's location
    await User.findByIdAndUpdate(req.user.userId, {
      zipCode: locationData.zipCode,
      city: locationData.city,
      state: locationData.state,
      country: locationData.country,
      location: {
        type: 'Point',
        coordinates: [locationData.longitude, locationData.latitude]
      }
    });

    res.json({
      success: true,
      location: locationData,
      primary,
      nearby,
      totalNearby: nearby.length
    });
  } catch (error) {
    console.error('Error resolving zip code:', error);
    res.status(500).json({ error: 'Failed to resolve zip code', details: error.message });
  }
});

// Search for cities/rooms by name
router.get('/search', authenticateToken, [
  query('q').trim().notEmpty().withMessage('Search query required'),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    const searchRegex = new RegExp(q, 'i');
    
    const rooms = await ChatRoom.find({
      name: searchRegex,
      isActive: true
    })
    .select('name city state memberCount')
    .limit(parseInt(limit))
    .lean();

    const results = rooms.map(room => ({
      _id: room._id,
      name: room.name,
      city: room.city,
      state: room.state,
      bucket: 'remote', // Manual search results are considered remote
      memberCount: room.memberCount || 0
    }));

    res.json({
      success: true,
      results,
      count: results.length
    });
  } catch (error) {
    console.error('Error searching cities:', error);
    res.status(500).json({ error: 'Failed to search cities' });
  }
});

module.exports = router;