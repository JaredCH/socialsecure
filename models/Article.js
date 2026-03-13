const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  source: {
    type: String,
    required: true
  },
  sourceId: {
    type: String,
    default: null
  },
  url: {
    type: String,
    required: true,
    unique: true
  },
  imageUrl: {
    type: String,
    default: null
  },
  publishedAt: {
    type: Date,
    default: null
  },
  topics: [{
    type: String,
    lowercase: true
  }],
  locations: [{
    type: String,
    lowercase: true
  }],
  assignedZipCode: {
    type: String,
    default: null
  },
  locationTags: {
    zipCodes: [{ type: String }],
    cities: [{ type: String }],
    counties: [{ type: String }],
    states: [{ type: String }],
    countries: [{ type: String }]
  },
  scopeConfidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },
  scopeReason: {
    type: String,
    enum: ['zip_match', 'city_match', 'state_match', 'country_match', 'nlp_only', 'source_default'],
    default: 'source_default'
  },
  language: {
    type: String,
    default: 'en'
  },
  // Primary standardized category for filtering/sorting
  category: {
    type: String,
    default: 'general',
    lowercase: true
  },
  // Identifies the feed provider (e.g. 'google-news', 'npr', 'bbc')
  feedSource: {
    type: String,
    default: null
  },
  // Raw category string from the source feed
  feedCategory: {
    type: String,
    default: null
  },
  // Language reported by the feed
  feedLanguage: {
    type: String,
    default: null
  },
  // Extra metadata from the source (author, source url, etc.)
  feedMetadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  sourceType: {
    type: String,
    enum: ['rss', 'googleNews', 'youtube', 'podcast', 'government', 'gdlet', 'npr', 'bbc', 'patch', 'redditLocal', 'tvAffiliate', 'localNewspaper', 'newsApi'],
    default: 'rss'
  },
  // Local source tier metadata (populated by local ingestion pipeline)
  sourceTier: {
    type: Number,
    default: null
  },
  sourceProviderId: {
    type: String,
    default: null
  },
  // Operational fields
  normalizedUrlHash: {
    type: String,
    index: true
  },
  contentFingerprint: {
    type: String,
    index: true,
    default: null
  },
  ingestTimestamp: {
    type: Date,
    default: Date.now
  },
  freshnessScore: {
    type: Number,
    default: 0
  },
  viralScore: {
    type: Number,
    default: 0,
    index: true
  },
  viralScoreVersion: {
    type: String,
    default: 'v1'
  },
  viralSignals: {
    freshness: { type: Number, default: 0 },
    urgencyTerms: { type: Number, default: 0 },
    sentimentIntensity: { type: Number, default: 0 },
    sourceMomentum: { type: Number, default: 0 },
    shareCueTerms: { type: Number, default: 0 }
  },
  isPromoted: {
    type: Boolean,
    default: false
  },
  lastScoredAt: {
    type: Date,
    default: null
  },
  localityLevel: {
    type: String,
    enum: ['city', 'county', 'state', 'country', 'global'],
    default: 'global'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
articleSchema.index({ publishedAt: -1 });
articleSchema.index({ topics: 1, publishedAt: -1 });
articleSchema.index({ locations: 1, publishedAt: -1 });
articleSchema.index({ localityLevel: 1, publishedAt: -1 });
articleSchema.index({ sourceType: 1, publishedAt: -1 });
articleSchema.index({ category: 1, publishedAt: -1 });
articleSchema.index({ normalizedUrlHash: 1 });
articleSchema.index({ isActive: 1, isPromoted: 1, viralScore: -1, publishedAt: -1 });

// Pre-save hook to generate normalized URL hash
articleSchema.pre('save', function(next) {
  if (this.url) {
    const crypto = require('crypto');
    this.normalizedUrlHash = crypto
      .createHash('sha256')
      .update(this.url.toLowerCase().trim())
      .digest('hex')
      .substring(0, 16);
  }
  next();
});

// Static method to find duplicates
articleSchema.statics.findDuplicate = async function(url, sourceId, contentFingerprint = null) {
  // Try normalized URL hash first
  const crypto = require('crypto');
  const urlHash = crypto
    .createHash('sha256')
    .update(url.toLowerCase().trim())
    .digest('hex')
    .substring(0, 16);

  const byHash = await this.findOne({ normalizedUrlHash: urlHash });
  if (byHash) return byHash;

  // Try by sourceId
  if (sourceId) {
    const bySourceId = await this.findOne({ sourceId });
    if (bySourceId) return bySourceId;
  }

  // Last fallback: content fingerprint
  if (contentFingerprint) {
    const byFingerprint = await this.findOne({ contentFingerprint });
    if (byFingerprint) return byFingerprint;
  }

  return null;
};

// Static method to get personalized feed
articleSchema.statics.getPersonalizedFeed = async function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    sources = [],
    topics = [],
    locations = [],
    localPriority = true
  } = options;

  const query = { isActive: true };

  // Filter by enabled sources
  if (sources.length > 0) {
    query.sourceType = { $in: sources };
  }

  // Filter by topics if provided
  if (topics.length > 0) {
    query.topics = { $in: topics.map(t => t.toLowerCase()) };
  }

  // Filter by locations if provided
  if (locations.length > 0) {
    query.locations = { $in: locations.map(l => l.toLowerCase()) };
  }

  let articles = await this.find(query)
    .sort({ publishedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  // Apply local prioritization if enabled
  if (localPriority && locations.length > 0) {
    const localityOrder = ['city', 'county', 'state', 'country', 'global'];
    
    articles = articles.sort((a, b) => {
      const aIndex = localityOrder.indexOf(a.localityLevel);
      const bIndex = localityOrder.indexOf(b.localityLevel);
      
      // Both have location match - sort by priority
      if (aIndex !== -1 && bIndex !== -1) {
        if (aIndex !== bIndex) return aIndex - bIndex;
      }
      
      // Prefer articles with location match
      if (aIndex !== -1 && bIndex === -1) return -1;
      if (aIndex === -1 && bIndex !== -1) return 1;
      
      // Fall back to published date
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });
  }

  return articles;
};

module.exports = mongoose.model('Article', articleSchema);
