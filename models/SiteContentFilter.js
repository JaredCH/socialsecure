const mongoose = require('mongoose');
const { normalizeFilterWords } = require('../utils/contentFilter');

const siteContentFilterSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'global',
    unique: true
  },
  zeroToleranceWords: {
    type: [String],
    default: []
  },
  maturityCensoredWords: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

siteContentFilterSchema.pre('validate', function normalizeWordLists(next) {
  this.zeroToleranceWords = normalizeFilterWords(this.zeroToleranceWords);
  this.maturityCensoredWords = normalizeFilterWords(this.maturityCensoredWords);
  next();
});

module.exports = mongoose.model('SiteContentFilter', siteContentFilterSchema);
