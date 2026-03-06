const mongoose = require('mongoose');

const zipLocationIndexSchema = new mongoose.Schema({
  zipCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  city: {
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
  aliases: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  latitude: {
    type: Number,
    default: null
  },
  longitude: {
    type: Number,
    default: null
  },
  source: {
    type: String,
    default: 'seed'
  },
  lastImportedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

zipLocationIndexSchema.index({ city: 1, state: 1, countryCode: 1 });

module.exports = mongoose.models.ZipLocationIndex || mongoose.model('ZipLocationIndex', zipLocationIndexSchema);
