const mongoose = require('mongoose');

const cachedArticleSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  link: { type: String, default: '' },
  source: { type: String, default: '' },
  publishedAt: { type: Date, default: null },
  tier: { type: String, enum: ['local', 'state', 'national'], required: true },
  normalizedTitle: { type: String, default: '' },
  imageUrl: { type: String, default: null },
  description: { type: String, default: '' },
  categories: { type: [String], default: [] }
}, { _id: false });

const fetchErrorSchema = new mongoose.Schema({
  tier: { type: String, default: '' },
  error: { type: String, default: '' },
  at: { type: Date, default: Date.now }
}, { _id: false });

const locationNewsCacheSchema = new mongoose.Schema({
  locationKey: { type: String, required: true, unique: true, index: true },
  city: { type: String, default: null },
  state: { type: String, default: null },
  stateFull: { type: String, default: null },
  country: { type: String, default: 'us' },
  lastFetchedAt: { type: Date, default: null },
  ttlMinutes: { type: Number, default: 15 },
  articles: { type: [cachedArticleSchema], default: [] },
  fetchErrors: { type: [fetchErrorSchema], default: [] }
}, { timestamps: true });

locationNewsCacheSchema.index({ lastFetchedAt: 1 }, { expireAfterSeconds: 86400 });
locationNewsCacheSchema.index({ locationKey: 1, lastFetchedAt: -1 });

module.exports = mongoose.models.LocationNewsCache || mongoose.model('LocationNewsCache', locationNewsCacheSchema);
