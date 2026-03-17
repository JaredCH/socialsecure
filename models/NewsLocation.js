const mongoose = require('mongoose');

const newsLocationSchema = new mongoose.Schema({
  locationKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  city: { type: String, default: null },
  state: { type: String, default: null },
  stateFull: { type: String, default: null },
  country: { type: String, default: 'us' },
  lastAccessedAt: { type: Date, default: null, index: true },
  accessCount: { type: Number, default: 0 },
  cacheStatus: {
    type: String,
    enum: ['warm', 'stale', 'empty'],
    default: 'empty'
  }
}, {
  timestamps: true
});

newsLocationSchema.index({ lastAccessedAt: -1, cacheStatus: 1 });

module.exports = mongoose.models.NewsLocation || mongoose.model('NewsLocation', newsLocationSchema);
