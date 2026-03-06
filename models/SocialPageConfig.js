const mongoose = require('mongoose');
const {
  buildDefaultSocialPagePreferences,
  normalizeSocialPagePreferences
} = require('../utils/socialPagePreferences');

const socialPageConfigSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  design: {
    type: mongoose.Schema.Types.Mixed,
    default: () => buildDefaultSocialPagePreferences('default')
  },
  isShared: {
    type: Boolean,
    default: false,
    index: true
  },
  sourceConfigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SocialPageConfig',
    default: null
  },
  sourceOwnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  templateId: {
    type: String,
    default: null,
    trim: true,
    maxlength: 80
  },
  favoritedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

socialPageConfigSchema.index({ owner: 1, updatedAt: -1 });
socialPageConfigSchema.index({ owner: 1, name: 1 });
socialPageConfigSchema.index({ isShared: 1, updatedAt: -1 });

socialPageConfigSchema.pre('save', function normalizeDesign(next) {
  const normalized = normalizeSocialPagePreferences(this.design, { profileTheme: 'default' });
  this.design = normalized.value || buildDefaultSocialPagePreferences('default');
  next();
});

module.exports = mongoose.model('SocialPageConfig', socialPageConfigSchema);
