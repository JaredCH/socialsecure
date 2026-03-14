'use strict';

const mongoose = require('mongoose');

/**
 * ArticleImpression — tracks how many times a user has been served a given article.
 *
 * An impression is counted in two ways:
 *   scroll — the article scrolled ≥70% into the viewport (IntersectionObserver)
 *   click  — the user opened/read the article
 *
 * Both kinds increment their respective counters.
 * `totalCount = scrollCount + clickCount` is used by the feed builder to
 * deprioritise articles the user has already seen twice or more.
 */
const articleImpressionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: true
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

// Compound unique index — one doc per (user, article) pair
articleImpressionSchema.index({ user: 1, article: 1 }, { unique: true });

// Index for fast feed-builder lookups (all article IDs seen by a user)
articleImpressionSchema.index({ user: 1, lastSeenAt: -1 });

/**
 * Upsert an impression record for the given user/article pair.
 *
 * @param {string|ObjectId} userId
 * @param {string|ObjectId} articleId
 * @param {'scroll'|'click'} type
 */
articleImpressionSchema.statics.upsertImpression = async function (userId, articleId, type) {
  const field = type === 'click' ? 'clickCount' : 'scrollCount';
  return this.findOneAndUpdate(
    { user: userId, article: articleId },
    {
      $inc: { [field]: 1 },
      $set: { lastSeenAt: new Date() }
    },
    { upsert: true, new: true }
  );
};

/**
 * Return the set of article IDs that the user has seen totalCount ≥ threshold times.
 * Used by the feed builder to deprioritise stale content.
 *
 * @param {string|ObjectId} userId
 * @param {number} threshold   default: 2
 * @returns {ObjectId[]}
 */
articleImpressionSchema.statics.getDeprioritisedArticleIds = async function (userId, threshold = 2) {
  const docs = await this.find({
    user: userId,
    $expr: { $gte: [{ $add: ['$scrollCount', '$clickCount'] }, threshold] }
  }).select('article').lean();
  return docs.map((d) => d.article);
};

const ArticleImpression = mongoose.model('ArticleImpression', articleImpressionSchema);
module.exports = ArticleImpression;
