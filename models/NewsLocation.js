const mongoose = require('mongoose');

const newsLocationSchema = new mongoose.Schema({
  locationKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  canonicalName: {
    type: String,
    required: true,
    trim: true
  },
  canonicalCity: {
    type: String,
    default: null
  },
  canonicalState: {
    type: String,
    default: null
  },
  canonicalStateCode: {
    type: String,
    default: null
  },
  canonicalCountry: {
    type: String,
    default: 'United States'
  },
  canonicalCountryCode: {
    type: String,
    default: 'US'
  },
  canonicalCounty: {
    type: String,
    default: null
  },
  canonicalZipCode: {
    type: String,
    default: null
  },
  coordinates: {
    lat: { type: Number, default: null },
    lon: { type: Number, default: null }
  },
  geoIdentifier: {
    type: String,
    default: null
  },
  aliases: [{
    type: String,
    trim: true
  }],
  userIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  userCount: {
    type: Number,
    default: 0,
    index: true
  },
  lastPolledAt: {
    type: Date,
    default: null,
    index: true
  },
  nextPollAt: {
    type: Date,
    default: null,
    index: true
  },
  lastPollDurationMs: {
    type: Number,
    default: null
  },
  lastPollStatus: {
    type: String,
    enum: ['idle', 'success', 'error'],
    default: 'idle'
  },
  lastPollError: {
    type: String,
    default: null
  },
  lastResultArticleCount: {
    type: Number,
    default: 0
  },
  lastResultDuplicateCount: {
    type: Number,
    default: 0
  },
  totalPollCount: {
    type: Number,
    default: 0
  },
  totalFailureCount: {
    type: Number,
    default: 0
  },
  consecutiveFailureCount: {
    type: Number,
    default: 0
  },
  onDemandRequestedAt: {
    type: Date,
    default: null,
    index: true
  },
  onDemandLastTriggeredAt: {
    type: Date,
    default: null
  },
  onDemandStatus: {
    type: String,
    enum: ['none', 'queued', 'running', 'success', 'error'],
    default: 'none'
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

newsLocationSchema.index({ nextPollAt: 1, isActive: 1 });
newsLocationSchema.index({ onDemandRequestedAt: 1, onDemandStatus: 1, isActive: 1 });

module.exports = mongoose.model('NewsLocation', newsLocationSchema);
