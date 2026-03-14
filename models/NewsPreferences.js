const mongoose = require('mongoose');

// User's location preferences for news
const newsLocationSchema = new mongoose.Schema({
  city: {
    type: String,
    default: null
  },
  zipCode: {
    type: String,
    default: null
  },
  county: {
    type: String,
    default: null
  },
  state: {
    type: String,
    default: null
  },
  stateCode: {
    type: String,
    default: null
  },
  country: {
    type: String,
    default: null
  },
  countryCode: {
    type: String,
    default: null
  },
  cityKey: {
    type: String,
    default: null
  },
  isPrimary: {
    type: Boolean,
    default: false
  }
});

// User's followed keywords
const followedKeywordSchema = new mongoose.Schema({
  keyword: {
    type: String,
    required: true,
    lowercase: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// User's news source preferences
const sourcePreferenceSchema = new mongoose.Schema({
  sourceId: {
    type: String,
    required: true
  },
  sourceType: {
    type: String,
    enum: ['rss', 'googleNews', 'youtube', 'podcast', 'government', 'gdlet', 'npr', 'bbc'],
    default: 'rss'
  },
  enabled: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 5
  }
});

// Weather location preferences
const weatherLocationSchema = new mongoose.Schema({
  label: { type: String, default: null },
  city: { type: String, default: null },
  state: { type: String, default: null },
  country: { type: String, default: null },
  countryCode: { type: String, default: null },
  zipCode: { type: String, default: null },
  lat: { type: Number, default: null },
  lon: { type: Number, default: null },
  timezone: { type: String, default: null },
  isPrimary: { type: Boolean, default: false }
});

// Main user news preferences
const newsPreferencesSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // RSS source preferences
  rssSources: [sourcePreferenceSchema],
  
  // Google News generated feeds
  googleNewsTopics: [{
    type: String,
    lowercase: true
  }],
  googleNewsEnabled: {
    type: Boolean,
    default: true
  },
  
  // GDLET preferences
  gdletCategories: [String],
  gdletEnabled: {
    type: Boolean,
    default: true
  },
  
  // Location preferences
  locations: [newsLocationSchema],
  
  // Followed keywords
  followedKeywords: [followedKeywordSchema],

  // Default feed scope preference
  defaultScope: {
    type: String,
    enum: ['local', 'regional', 'national', 'global'],
    default: 'global'
  },
  
  // Local prioritization settings
  localPriorityEnabled: {
    type: Boolean,
    default: true
  },
  
  // Hidden categories (categories user has hidden from the feed)
  hiddenCategories: [{
    type: String,
    lowercase: true
  }],

  // Per-source disabled categories (sourceId → [category1, category2, ...])
  disabledSourceCategories: {
    type: Map,
    of: [String],
    default: () => new Map()
  },

  // Weather location preferences (max 3)
  weatherLocations: {
    type: [weatherLocationSchema],
    default: []
  },

  // Reddit subreddit monitoring
  redditMonitors: [{
    subreddit: { type: String, required: true, trim: true, lowercase: true },
    minUpvotes: { type: Number, default: 100, min: 0, max: 100000 },
    enabled: { type: Boolean, default: true },
    addedAt: { type: Date, default: Date.now }
  }],

  // Followed sports teams (team ids from sportsTeamLocationIndex)
  followedSportsTeams: {
    type: [{
      type: String,
      lowercase: true,
      trim: true
    }],
    default: []
  },
  
  // General settings
  refreshInterval: {
    type: Number,
    default: 10 // minutes
  },
  articlesPerPage: {
    type: Number,
    default: 20
  }
}, {
  timestamps: true
});

// Static method to get or create preferences
newsPreferencesSchema.statics.getOrCreate = async function(userId) {
  let prefs = await this.findOne({ user: userId });
  if (!prefs) {
    prefs = await this.create({ user: userId });
  }
  return prefs;
};

// Method to add a location
newsPreferencesSchema.methods.addLocation = async function(location) {
  // Check if location already exists
  const exists = this.locations.some(loc => 
    loc.city === location.city && 
    loc.zipCode === location.zipCode &&
    loc.state === location.state && 
    loc.country === location.country
  );
  
  if (!exists) {
    this.locations.push({
      ...location,
      isPrimary: this.locations.length === 0
    });
    await this.save();
  }
  return this;
};

// Method to remove a location
newsPreferencesSchema.methods.removeLocation = async function(locationId) {
  this.locations = this.locations.filter(loc => 
    loc._id.toString() !== locationId.toString()
  );
  
  // If primary was removed, make first remaining as primary
  if (this.locations.length > 0 && !this.locations.some(loc => loc.isPrimary)) {
    this.locations[0].isPrimary = true;
  }
  
  await this.save();
  return this;
};

// Method to add a keyword
newsPreferencesSchema.methods.addKeyword = async function(keyword) {
  const normalized = keyword.toLowerCase().trim();
  
  if (!this.followedKeywords.some(k => k.keyword === normalized)) {
    this.followedKeywords.push({ keyword: normalized });
    await this.save();
  }
  return this;
};

// Method to remove a keyword
newsPreferencesSchema.methods.removeKeyword = async function(keyword) {
  this.followedKeywords = this.followedKeywords.filter(k => 
    k.keyword !== keyword.toLowerCase()
  );
  await this.save();
  return this;
};

// Method to toggle source
newsPreferencesSchema.methods.toggleSource = async function(sourceId, enabled) {
  const source = this.rssSources.find(s => s.sourceId === sourceId);
  if (source) {
    source.enabled = enabled;
  } else {
    this.rssSources.push({ sourceId, enabled });
  }
  await this.save();
  return this;
};

// Method to hide a category
newsPreferencesSchema.methods.hideCategory = async function(category) {
  const normalized = category.toLowerCase().trim();
  if (!this.hiddenCategories.includes(normalized)) {
    this.hiddenCategories.push(normalized);
    await this.save();
  }
  return this;
};

// Method to show a category (remove from hidden)
newsPreferencesSchema.methods.showCategory = async function(category) {
  const normalized = category.toLowerCase().trim();
  this.hiddenCategories = this.hiddenCategories.filter(c => c !== normalized);
  await this.save();
  return this;
};

// Method to toggle a category for a specific source
newsPreferencesSchema.methods.toggleSourceCategory = async function(sourceId, category) {
  const normalized = category.toLowerCase().trim();
  if (!this.disabledSourceCategories) {
    this.disabledSourceCategories = new Map();
  }
  const current = this.disabledSourceCategories.get(sourceId) || [];
  if (current.includes(normalized)) {
    this.disabledSourceCategories.set(sourceId, current.filter(c => c !== normalized));
  } else {
    this.disabledSourceCategories.set(sourceId, [...current, normalized]);
  }
  this.markModified('disabledSourceCategories');
  await this.save();
  return this;
};

module.exports = mongoose.model('NewsPreferences', newsPreferencesSchema);
