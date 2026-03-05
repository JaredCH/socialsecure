const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const MarketListing = require('../models/MarketListing');
const MarketTransaction = require('../models/MarketTransaction');
const User = require('../models/User');
const { createNotification } = require('../services/notifications');

// Hierarchical category definitions
const MARKET_CATEGORIES = [
  {
    id: 'for-sale',
    name: 'For Sale',
    icon: '🛍️',
    subcategories: [
      { id: 'electronics', name: 'Electronics', icon: '📱' },
      { id: 'furniture', name: 'Furniture', icon: '🪑' },
      { id: 'clothing', name: 'Clothing & Accessories', icon: '👕' },
      { id: 'vehicles', name: 'Vehicles', icon: '🚗' },
      { id: 'tools', name: 'Tools & Hardware', icon: '🔧' },
      { id: 'books', name: 'Books & Media', icon: '📚' },
      { id: 'sports', name: 'Sports & Outdoors', icon: '⚽' },
      { id: 'home-garden', name: 'Home & Garden', icon: '🌱' },
      { id: 'collectibles', name: 'Collectibles & Antiques', icon: '🏆' },
      { id: 'toys', name: 'Toys & Games', icon: '🧸' },
      { id: 'health-beauty', name: 'Health & Beauty', icon: '💄' },
      { id: 'other-sale', name: 'Other', icon: '📦' }
    ]
  },
  {
    id: 'services',
    name: 'Services',
    icon: '🛠️',
    subcategories: [
      { id: 'professional', name: 'Professional Services', icon: '💼' },
      { id: 'labor', name: 'Labor & Moving', icon: '🏗️' },
      { id: 'creative', name: 'Creative Services', icon: '🎨' },
      { id: 'tutoring', name: 'Tutoring & Lessons', icon: '📖' },
      { id: 'tech-support', name: 'Tech Support', icon: '💻' },
      { id: 'other-services', name: 'Other Services', icon: '🔨' }
    ]
  },
  {
    id: 'housing',
    name: 'Housing',
    icon: '🏠',
    subcategories: [
      { id: 'apartments', name: 'Apartments & Condos', icon: '🏢' },
      { id: 'houses', name: 'Houses', icon: '🏡' },
      { id: 'rooms', name: 'Rooms for Rent', icon: '🚪' },
      { id: 'shared', name: 'Shared Housing', icon: '👥' },
      { id: 'commercial', name: 'Commercial & Office', icon: '🏬' }
    ]
  },
  {
    id: 'jobs',
    name: 'Jobs',
    icon: '💼',
    subcategories: [
      { id: 'full-time', name: 'Full-Time', icon: '📋' },
      { id: 'part-time', name: 'Part-Time', icon: '🕐' },
      { id: 'contract', name: 'Contract & Freelance', icon: '📝' },
      { id: 'gigs', name: 'Gigs & Temp', icon: '⚡' },
      { id: 'internships', name: 'Internships', icon: '🎓' }
    ]
  },
  {
    id: 'community',
    name: 'Community',
    icon: '🤝',
    subcategories: [
      { id: 'events', name: 'Events & Activities', icon: '🎉' },
      { id: 'classes', name: 'Classes & Workshops', icon: '🏫' },
      { id: 'volunteer', name: 'Volunteer', icon: '❤️' },
      { id: 'lost-found', name: 'Lost & Found', icon: '🔍' },
      { id: 'free-stuff', name: 'Free Stuff', icon: '🎁' }
    ]
  }
];

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
      const user = await User.findById(decoded.userId).select('onboardingStatus');
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (user.onboardingStatus !== 'completed') {
        return res.status(403).json({
          error: 'Complete onboarding before using market features',
          code: 'ONBOARDING_REQUIRED'
        });
      }

      req.user = decoded;
      next();
    } catch (lookupError) {
      return res.status(500).json({ error: 'Authentication failed' });
    }
  });
};

// Get market categories
router.get('/categories', (req, res) => {
  res.json({ success: true, categories: MARKET_CATEGORIES });
});

// Search users for buyer selection (authenticated)
router.get('/users/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const searchRegex = new RegExp(q.trim(), 'i');
    const users = await User.find({
      $or: [{ username: searchRegex }, { realName: searchRegex }],
      registrationStatus: 'active',
      _id: { $ne: req.user.userId }
    })
      .select('username realName avatarUrl city state')
      .limit(20)
      .lean();

    res.json({ success: true, users });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users', details: error.message });
  }
});

// Browse listings with filters and search
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
    const searchQuery = req.query.q ? req.query.q.trim() : null;
    
    const filters = {};
    
    // Category filter (supports parent category matching subcategories)
    if (category) {
      const parentCategory = MARKET_CATEGORIES.find(c => c.id === category);
      if (parentCategory && parentCategory.subcategories) {
        const allIds = [category, ...parentCategory.subcategories.map(s => s.id)];
        filters.category = { $in: allIds };
      } else {
        filters.category = category;
      }
    }
    
    // Price range filter
    if (minPrice !== null || maxPrice !== null) {
      filters.price = {};
      if (minPrice !== null) filters.price.$gte = minPrice;
      if (maxPrice !== null) filters.price.$lte = maxPrice;
    }
    
    // Location filter
    if (latitude !== null && longitude !== null) {
      filters.nearby = { longitude, latitude, maxDistance };
    }

    // Text search
    if (searchQuery) {
      filters.search = searchQuery;
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
        search: searchQuery,
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
  body('externalLink').optional({ checkFalsy: true }).isURL().withMessage('Valid URL is required'),
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
      externalLink: externalLink || '',
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
  body('externalLink').optional({ checkFalsy: true }).isURL().withMessage('Valid URL is required'),
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

// Mark listing as sold (simple, no SocialSecure transaction)
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

// Mark listing as active (reactivate)
router.post('/listings/:listingId/reactivate', authenticateToken, async (req, res) => {
  try {
    const { listingId } = req.params;
    const userId = req.user.userId;
    
    const listing = await MarketListing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    if (listing.sellerId.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to reactivate this listing' });
    }
    
    listing.status = 'active';
    listing.updatedAt = new Date();
    await listing.save();
    
    res.json({ success: true, message: 'Listing reactivated', listing });
  } catch (error) {
    console.error('Error reactivating listing:', error);
    res.status(500).json({ error: 'Failed to reactivate listing', details: error.message });
  }
});

// Initiate SocialSecure transaction (seller selects buyer)
router.post('/listings/:listingId/initiate-sale', [
  authenticateToken,
  body('buyerId').notEmpty().withMessage('Buyer ID is required'),
  body('sellerAnonymous').optional().isBoolean(),
  body('buyerAnonymous').optional().isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { listingId } = req.params;
    const sellerId = req.user.userId;
    const { buyerId, sellerAnonymous = false, buyerAnonymous = false } = req.body;

    // Prevent self-transaction
    if (String(buyerId) === String(sellerId)) {
      return res.status(400).json({ error: 'Cannot initiate a transaction with yourself' });
    }

    const [listing, buyer] = await Promise.all([
      MarketListing.findById(listingId),
      User.findById(buyerId).select('username realName')
    ]);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (listing.sellerId.toString() !== sellerId) {
      return res.status(403).json({ error: 'Not authorized to initiate sale for this listing' });
    }

    if (listing.status !== 'active') {
      return res.status(400).json({ error: 'Listing is not active' });
    }

    if (!buyer) {
      return res.status(404).json({ error: 'Buyer not found' });
    }

    // Cancel any existing pending transactions for this listing
    await MarketTransaction.updateMany(
      { listingId, status: 'pending' },
      { status: 'rejected' }
    );

    // Create new transaction
    const transaction = await MarketTransaction.create({
      listingId,
      sellerId,
      buyerId,
      status: 'pending',
      sellerAnonymous: !!sellerAnonymous,
      buyerAnonymous: !!buyerAnonymous,
      amount: listing.price,
      currency: listing.currency,
      listingTitle: listing.title
    });

    // Mark listing as pending
    listing.status = 'pending';
    listing.updatedAt = new Date();
    await listing.save();

    // Send notification to buyer
    const notification = await createNotification({
      recipientId: buyerId,
      senderId: sellerAnonymous ? null : sellerId,
      type: 'market_transaction',
      title: 'Transaction Request',
      body: sellerAnonymous
        ? `You have a new transaction request for an item priced at ${listing.currency} ${listing.price}.`
        : `You have a transaction request for "${listing.title}" priced at ${listing.currency} ${listing.price}.`,
      data: {
        listingId: listing._id,
        transactionId: transaction._id,
        url: '/market?tab=transactions'
      }
    });

    if (notification) {
      transaction.notificationId = notification._id;
      await transaction.save();
    }

    res.status(201).json({
      success: true,
      message: 'Transaction initiated and buyer notified',
      transaction
    });
  } catch (error) {
    console.error('Error initiating sale:', error);
    res.status(500).json({ error: 'Failed to initiate sale', details: error.message });
  }
});

// Respond to transaction (buyer accepts or rejects)
router.post('/transactions/:transactionId/respond', [
  authenticateToken,
  body('response').isIn(['accept', 'reject']).withMessage('Response must be accept or reject')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { transactionId } = req.params;
    const userId = req.user.userId;
    const { response } = req.body;

    const transaction = await MarketTransaction.findById(transactionId)
      .populate('listingId');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.buyerId.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to respond to this transaction' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ error: 'Transaction is no longer pending' });
    }

    const listing = transaction.listingId;
    if (!listing) {
      return res.status(404).json({ error: 'Associated listing not found' });
    }

    if (response === 'accept') {
      transaction.status = 'accepted';
      listing.status = 'sold';
      listing.updatedAt = new Date();
      await listing.save();

      // Notify seller of acceptance
      await createNotification({
        recipientId: transaction.sellerId,
        senderId: transaction.buyerAnonymous ? null : userId,
        type: 'market_transaction',
        title: 'Transaction Accepted',
        body: transaction.buyerAnonymous
          ? `Your transaction for "${transaction.listingTitle}" was accepted.`
          : `Your transaction for "${transaction.listingTitle}" was accepted.`,
        data: {
          listingId: listing._id,
          transactionId: transaction._id,
          url: '/market?tab=myListings'
        }
      });
    } else {
      transaction.status = 'rejected';
      listing.status = 'active';
      listing.updatedAt = new Date();
      await listing.save();

      // Notify seller of rejection
      await createNotification({
        recipientId: transaction.sellerId,
        senderId: null,
        type: 'market_transaction',
        title: 'Transaction Declined',
        body: `The transaction for "${transaction.listingTitle}" was declined.`,
        data: {
          listingId: listing._id,
          transactionId: transaction._id,
          url: '/market?tab=myListings'
        }
      });
    }

    await transaction.save();

    res.json({
      success: true,
      message: response === 'accept' ? 'Transaction accepted' : 'Transaction rejected',
      transaction
    });
  } catch (error) {
    console.error('Error responding to transaction:', error);
    res.status(500).json({ error: 'Failed to respond to transaction', details: error.message });
  }
});

// Get user's transactions (as buyer or seller)
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const role = req.query.role; // 'buyer', 'seller', or undefined for both
    const status = req.query.status;

    const query = {};
    if (role === 'buyer') {
      query.buyerId = userId;
    } else if (role === 'seller') {
      query.sellerId = userId;
    } else {
      query.$or = [{ buyerId: userId }, { sellerId: userId }];
    }

    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      MarketTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('listingId', 'title price currency status images category')
        .populate('sellerId', 'username realName avatarUrl')
        .populate('buyerId', 'username realName avatarUrl')
        .lean(),
      MarketTransaction.countDocuments(query)
    ]);

    // Apply anonymity: hide seller/buyer info based on anonymous flags
    const sanitized = transactions.map(t => {
      const isSeller = String(t.sellerId?._id || t.sellerId) === String(userId);
      const isBuyer = String(t.buyerId?._id || t.buyerId) === String(userId);

      return {
        ...t,
        sellerId: t.sellerAnonymous && !isSeller ? { username: 'Anonymous', realName: 'Anonymous' } : t.sellerId,
        buyerId: t.buyerAnonymous && !isBuyer ? { username: 'Anonymous', realName: 'Anonymous' } : t.buyerId
      };
    });

    res.json({
      success: true,
      transactions: sanitized,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions', details: error.message });
  }
});

// Public trade history (accepted transactions)
router.get('/trade-history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      MarketTransaction.find({ status: 'accepted' })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sellerId', 'username realName')
        .populate('buyerId', 'username realName')
        .lean(),
      MarketTransaction.countDocuments({ status: 'accepted' })
    ]);

    // Apply anonymity rules: if both parties are anonymous, hide item info too
    const publicHistory = transactions.map(t => {
      const bothAnonymous = t.sellerAnonymous && t.buyerAnonymous;
      return {
        _id: t._id,
        amount: t.amount,
        currency: t.currency,
        completedAt: t.updatedAt,
        sellerAnonymous: t.sellerAnonymous,
        buyerAnonymous: t.buyerAnonymous,
        // Only reveal item info if at least one party is not anonymous
        listingTitle: bothAnonymous ? null : t.listingTitle,
        seller: t.sellerAnonymous ? null : { username: t.sellerId?.username, realName: t.sellerId?.realName },
        buyer: t.buyerAnonymous ? null : { username: t.buyerId?.username, realName: t.buyerId?.realName }
      };
    });

    res.json({
      success: true,
      history: publicHistory,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Error fetching trade history:', error);
    res.status(500).json({ error: 'Failed to fetch trade history', details: error.message });
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
