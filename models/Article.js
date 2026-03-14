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
    enum: ['rss', 'googleNews', 'youtube', 'podcast', 'government', 'gdlet', 'npr', 'bbc', 'patch', 'redditLocal', 'tvAffiliate', 'localNewspaper', 'newsApi', 'reddit', 'sportNews'],
    default: 'rss'
  },
  // Which ingestion pipeline created this article
  pipeline: {
    type: String,
    enum: ['local', 'category', 'sports', 'social'],
    default: 'category',
    index: true
  },
  // Key for local/geo articles: normalised "city-state" slug
  cityKey: {
    type: String,
    default: null,
    index: true
  },
  // Sports team IDs this article is linked to (from sportsTeams followed by users)
  sportTeamIds: [{
    type: String,
    lowercase: true
  }],
  // Reddit-specific fields
  subreddit: {
    type: String,
    default: null
  },
  redditScore: {
    type: Number,
    default: null
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
    sparse: true,
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
// Text index for full-text keyword search
articleSchema.index({ title: 'text', description: 'text', topics: 'text' }, { name: 'article_text_search', weights: { title: 10, topics: 5, description: 1 } });

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
  // Content fingerprint (hash of title+description) is checked first because
  // Google News serves the same article with a different opaque URL token on
  // every RSS fetch, making URL-based hashes unreliable for deduplication.
  if (contentFingerprint) {
    const byFingerprint = await this.findOne({ contentFingerprint });
    if (byFingerprint) return byFingerprint;
  }

  // Normalized URL hash works for sources with stable URLs (non-Google-News).
  const crypto = require('crypto');
  const urlHash = crypto
    .createHash('sha256')
    .update(url.toLowerCase().trim())
    .digest('hex')
    .substring(0, 16);

  const byHash = await this.findOne({ normalizedUrlHash: urlHash });
  if (byHash) return byHash;

  // Fallback: RSS GUID / sourceId
  if (sourceId) {
    const bySourceId = await this.findOne({ sourceId });
    if (bySourceId) return bySourceId;
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
