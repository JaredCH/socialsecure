'use strict';

const mongoose = require('mongoose');

const articleImpressionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  article: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  articleKey: {
    type: String,
    required: true,
    index: true
  },
  articleLink: {
    type: String,
    default: null
  },
  locationKey: {
    type: String,
    default: null,
    index: true
  },
  scrollCount: {
    type: Number,
    default: 0,
    min: 0
  },
  clickCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

articleImpressionSchema.index({ user: 1, articleKey: 1 }, { unique: true });
articleImpressionSchema.index({ user: 1, lastSeenAt: -1 });
articleImpressionSchema.index({ locationKey: 1, articleLink: 1, clickCount: -1 });

articleImpressionSchema.statics.upsertImpression = async function upsertImpression(userId, articleRef, type, options = {}) {
  const field = type === 'click' ? 'clickCount' : 'scrollCount';
  const articleKey = String(options.articleLink || articleRef || '').trim();
  if (!articleKey) return null;

  return this.findOneAndUpdate(
    { user: userId, articleKey },
    {
      $inc: { [field]: 1 },
      $set: {
        article: options.articleId || (!options.articleLink ? articleRef : null),
        articleKey,
        articleLink: options.articleLink || (typeof articleRef === 'string' ? articleRef : null),
        locationKey: options.locationKey || null,
        lastSeenAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
};

articleImpressionSchema.statics.getDeprioritisedArticleIds = async function getDeprioritisedArticleIds(userId, threshold = 2) {
  const docs = await this.find({
    user: userId,
    $expr: { $gte: [{ $add: ['$scrollCount', '$clickCount'] }, threshold] }
  }).select('article articleKey').lean();
  return docs.map((doc) => doc.article || doc.articleKey).filter(Boolean);
};

articleImpressionSchema.statics.getTopClickedLinksForLocation = async function getTopClickedLinksForLocation(locationKey, limit = 20) {
  return this.aggregate([
    { $match: { locationKey, articleLink: { $ne: null } } },
    { $group: { _id: '$articleLink', clicks: { $sum: '$clickCount' }, scrolls: { $sum: '$scrollCount' } } },
    { $sort: { clicks: -1, scrolls: -1, _id: 1 } },
    { $limit: Math.max(1, Math.min(Number(limit) || 20, 100)) }
  ]);
};

module.exports = mongoose.models.ArticleImpression || mongoose.model('ArticleImpression', articleImpressionSchema);
