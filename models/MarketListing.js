const mongoose = require('mongoose');

const marketListingSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  category: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true,
    length: 3
  },
  externalLink: {
    type: String,
    default: '',
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'External link must be a valid HTTP/HTTPS URL'
    }
  },
  images: [{
    type: String,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Image URL must be a valid HTTP/HTTPS URL'
    }
  }],
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    }
  },
  city: String,
  state: String,
  country: String,
  status: {
    type: String,
    enum: ['active', 'sold', 'expired', 'pending'],
    default: 'active',
    index: true
  },
  views: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Geospatial index for location-based queries
marketListingSchema.index({ location: '2dsphere' });
marketListingSchema.index({ category: 1, status: 1, createdAt: -1 });
marketListingSchema.index({ sellerId: 1, status: 1 });
// Full-text search index
marketListingSchema.index({ title: 'text', description: 'text' }, { weights: { title: 10, description: 1 } });

// Method to increment view count
marketListingSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Method to mark as sold
marketListingSchema.methods.markAsSold = function() {
  this.status = 'sold';
  this.updatedAt = new Date();
  return this.save();
};

// Method to mark as expired
marketListingSchema.methods.markAsExpired = function() {
  this.status = 'expired';
  this.updatedAt = new Date();
  return this.save();
};

// Static method to get active listings with filters
marketListingSchema.statics.getActiveListings = async function(filters = {}, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const query = {
    status: 'active',
    ...filters
  };
  
  // Handle text search filter
  let sortQuery = { createdAt: -1 };
  if (filters.search) {
    query.$text = { $search: filters.search };
    sortQuery = { score: { $meta: 'textScore' }, createdAt: -1 };
    delete query.search;
  }
  
  // Handle location filter
  if (filters.nearby) {
    const { longitude, latitude, maxDistance = 50 } = filters.nearby;
    query.location = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        },
        $maxDistance: maxDistance * 1609.34 // Convert miles to meters
      }
    };
    delete query.nearby;
  }
  
  const projection = filters.search ? { score: { $meta: 'textScore' } } : {};
  
  const listings = await this.find(query, projection)
    .sort(sortQuery)
    .skip(skip)
    .limit(limit)
    .populate('sellerId', 'username realName city state')
    .lean();
  
  const total = await this.countDocuments(query);
  
  return { listings, total, page, limit };
};

// Check if listing is expired
marketListingSchema.methods.isExpired = function() {
  return this.expiresAt < new Date() || this.status === 'expired';
};

// Pre-save hook to update status if expired
marketListingSchema.pre('save', function(next) {
  if (this.expiresAt < new Date() && this.status === 'active') {
    this.status = 'expired';
  }
  next();
});

module.exports = mongoose.model('MarketListing', marketListingSchema);