const mongoose = require('mongoose');

const rssSourceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  url: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['rss', 'googleNews', 'youtube', 'podcast', 'government', 'npr', 'bbc',
           'wire', 'national_tv', 'local_tv'],
    default: 'rss'
  },
  // Broad editorial scope
  scope: {
    type: String,
    enum: ['wire', 'national', 'local', 'regional'],
    default: 'national'
  },
  // Broadcast/publisher group that owns this feed
  networkGroup: {
    type: String,
    default: null
  },
  // Network affiliate brand: ABC, CBS, NBC, FOX, IND, NA
  affiliate: {
    type: String,
    default: null
  },
  // Normalized DMA market slug (e.g. "new-york", "tampa-st-petersburg")
  market: {
    type: String,
    default: null
  },
  // Station call sign (e.g. "WNBC", "KTLA")
  stationCallSign: {
    type: String,
    default: null
  },
  // City the station serves
  cityName: {
    type: String,
    default: null
  },
  // Two-letter US state code
  stateCode: {
    type: String,
    default: null
  },
  category: {
    type: String,
    default: 'general'
  },
  // For Google News generated feeds
  query: {
    type: String,
    default: null
  },
  // For categorized feeds
  keywords: [{
    type: String,
    lowercase: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  // Health tracking
  lastFetchAt: {
    type: Date,
    default: null
  },
  lastFetchStatus: {
    type: String,
    enum: ['success', 'error', 'pending'],
    default: 'pending'
  },
  lastError: {
    type: String,
    default: null
  },
  fetchCount: {
    type: Number,
    default: 0
  },
  errorCount: {
    type: Number,
    default: 0
  },
  // Priority for ingestion
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  }
}, {
  timestamps: true
});

// Index for efficient queries
rssSourceSchema.index({ type: 1, isActive: 1 });
rssSourceSchema.index({ category: 1, isActive: 1 });

// Static method to get active sources by type
rssSourceSchema.statics.getActiveSources = async function(type = null) {
  const query = { isActive: true };
  if (type) {
    query.type = type;
  }
  return await this.find(query).sort({ priority: -1 });
};

// Static method to get sources by category
rssSourceSchema.statics.getByCategory = async function(category) {
  return await this.find({ category, isActive: true }).sort({ priority: -1 });
};

// Method to record fetch attempt
rssSourceSchema.methods.recordFetch = async function(success, error = null) {
  this.lastFetchAt = new Date();
  this.lastFetchStatus = success ? 'success' : 'error';
  this.lastError = error;
  this.fetchCount += 1;
  if (!success) {
    this.errorCount += 1;
  }
  await this.save();
};

module.exports = mongoose.model('RssSource', rssSourceSchema);
