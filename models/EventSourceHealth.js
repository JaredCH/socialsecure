const mongoose = require('mongoose');

const eventSourceHealthSchema = new mongoose.Schema({
  sourceKey: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  pollIntervalMinutes: {
    type: Number,
    default: 60,
    min: 5
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  sportOrSeriesScope: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  lastSyncAt: {
    type: Date,
    default: null
  },
  lastStatus: {
    type: String,
    enum: ['success', 'error', 'pending'],
    default: 'pending'
  },
  errorCount: {
    type: Number,
    default: 0
  },
  lastError: {
    type: String,
    default: null
  },
  backoffUntil: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('EventSourceHealth', eventSourceHealthSchema);
