const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const MarketListing = require('../models/MarketListing');
const User = require('../models/User');

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

// Browse listings with filters
router.get('/listings', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const category = req.query.category;
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
    const latitude = req.query.latitude ? parseFloat(req.query.latitude) : null;
    const longitude = req.query.longitude ? parseFloat(req.query.longitude) : null;
    const maxDistance = req.query.maxDistance ? parseFloat(req.query.maxDistance) : 50; // miles
    
    const filters = {};
    
    // Category filter
    if (category) {
      filters.category = category;
    }
    
    // Price range filter
    if (minPrice !== null || maxPrice !== null) {
      filters.price = {};
      if (minPrice !== null) filters.price.$gte = minPrice;
      if (maxPrice !== null) filters.price.$lte = maxPrice;
    }
    
    // Location filter
    if (latitude !== null && longitude !== null) {
      filters.nearby = {
        longitude,
        latitude,
        maxDistance
      };
    }
    
    const { listings, total } = await MarketListing.getActiveListings(filters, page, limit);
    
    res.json({
      success: true,
      listings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        category,
        minPrice,
        maxPrice,
        location: latitude && longitude ? { latitude, longitude, maxDistance } : null
      }
    });
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: 'Failed to fetch listings', details: error.message });
  }
});

// Get listing details
router.get('/listings/:listingId', async (req, res) => {
  try {
    const { listingId } = req.params;
    
    const listing = await MarketListing.findById(listingId)
      .populate('sellerId', 'username realName city state country');
    
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    // Increment view count
    await listing.incrementViews();
    
    res.json({
      success: true,
      listing
    });
  } catch (error) {
    console.error('Error fetching listing:', error);
    res.status(500).json({ error: 'Failed to fetch listing', details: error.message });
  }
});

// Create new listing
router.post('/listings', [
  authenticateToken,
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }).withMessage('Title too long'),
  body('description').trim().notEmpty().withMessage('Description is required').isLength({ max: 5000 }).withMessage('Description too long'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('externalLink').isURL().withMessage('Valid URL is required'),
  body('images').optional().isArray().withMessage('Images must be an array'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('country').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const {
      title,
      description,
      category,
      price,
      currency = 'USD',
      externalLink,
      images = [],
      latitude,
      longitude,
      city,
      state,
      country
    } = req.body;
    
    const sellerId = req.user.userId;
    
    // Verify seller exists
    const seller = await User.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    
    const listingData = {
      sellerId,
      title,
      description,
      category,
      price: parseFloat(price),
      currency: currency.toUpperCase(),
      externalLink,
      images,
      status: 'active'
    };
    
    // Add location if provided
    if (latitude && longitude) {
      listingData.location = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      };
      listingData.city = city || seller.city;
      listingData.state = state || seller.state;
      listingData.country = country || seller.country;
    } else if (seller.location && seller.location.coordinates[0] !== 0 && seller.location.coordinates[1] !== 0) {
      // Use seller's location if available
      listingData.location = seller.location;
      listingData.city = seller.city;
      listingData.state = seller.state;
      listingData.country = seller.country;
    }
    
    const listing = new MarketListing(listingData);
    await listing.save();
    
    // Populate seller info
    await listing.populate('sellerId', 'username realName city state country');
    
    res.status(201).json({
      success: true,
      message: 'Listing created successfully',
      listing
    });
  } catch (error) {
    console.error('Error creating listing:', error);
    res.status(500).json({ error: 'Failed to create listing', details: error.message });
  }
});

// Update listing
router.put('/listings/:listingId', [
  authenticateToken,
  body('title').optional().trim().isLength({ max: 200 }).withMessage('Title too long'),
  body('description').optional().trim().isLength({ max: 5000 }).withMessage('Description too long'),
  body('category').optional().trim(),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('externalLink').optional().isURL().withMessage('Valid URL is required'),
  body('images').optional().isArray().withMessage('Images must be an array'),
  body('status').optional().isIn(['active', 'sold', 'expired']).withMessage('Invalid status')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const { listingId } = req.params;
    const userId = req.user.userId;
    const updateData = req.body;
    
    const listing = await MarketListing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    // Check if user is the seller
    if (listing.sellerId.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this listing' });
    }
    
    // Update allowed fields
    const allowedFields = ['title', 'description', 'category', 'price', 'currency', 'externalLink', 'images', 'status'];
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        listing[field] = field === 'price' ? parseFloat(updateData[field]) : updateData[field];
      }
    });
    
    listing.updatedAt = new Date();
    await listing.save();
    
    // Populate seller info
    await listing.populate('sellerId', 'username realName city state country');
    
    res.json({
      success: true,
      message: 'Listing updated successfully',
      listing
    });
  } catch (error) {
    console.error('Error updating listing:', error);
    res.status(500).json({ error: 'Failed to update listing', details: error.message });
  }
});

// Delete listing
router.delete('/listings/:listingId', authenticateToken, async (req, res) => {
  try {
    const { listingId } = req.params;
    const userId = req.user.userId;
    
    const listing = await MarketListing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    // Check if user is the seller
    if (listing.sellerId.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this listing' });
    }
    
    await listing.deleteOne();
    
    res.json({
      success: true,
      message: 'Listing deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting listing:', error);
    res.status(500).json({ error: 'Failed to delete listing', details: error.message });
  }
});

// Increment view count
router.post('/listings/:listingId/view', async (req, res) => {
  try {
    const { listingId } = req.params;
    
    const listing = await MarketListing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    await listing.incrementViews();
    
    res.json({
      success: true,
      views: listing.views
    });
  } catch (error) {
    console.error('Error incrementing view count:', error);
    res.status(500).json({ error: 'Failed to increment view count', details: error.message });
  }
});

// Mark listing as sold
router.post('/listings/:listingId/sold', authenticateToken, async (req, res) => {
  try {
    const { listingId } = req.params;
    const userId = req.user.userId;
    
    const listing = await MarketListing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    // Check if user is the seller
    if (listing.sellerId.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to mark this listing as sold' });
    }
    
    await listing.markAsSold();
    
    res.json({
      success: true,
      message: 'Listing marked as sold',
      listing
    });
  } catch (error) {
    console.error('Error marking listing as sold:', error);
    res.status(500).json({ error: 'Failed to mark listing as sold', details: error.message });
  }
});

// Get user's listings
router.get('/user/listings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    
    const query = { sellerId: userId };
    if (status) {
      query.status = status;
    }
    
    const skip = (page - 1) * limit;
    
    const listings = await MarketListing.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sellerId', 'username realName')
      .lean();
    
    const total = await MarketListing.countDocuments(query);
    
    res.json({
      success: true,
      listings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching user listings:', error);
    res.status(500).json({ error: 'Failed to fetch user listings', details: error.message });
  }
});

module.exports = router;