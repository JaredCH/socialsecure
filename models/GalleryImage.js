const mongoose = require('mongoose');
const { normalizeRelationshipAudience } = require('../utils/relationshipAudience');

const galleryReactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['like', 'dislike'],
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false
});

const galleryImageSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  mediaUrl: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048
  },
  mediaType: {
    type: String,
    enum: ['url', 'upload'],
    default: 'url'
  },
  relationshipAudience: {
    type: String,
    enum: ['social', 'secure'],
    default: 'social',
    index: true
  },
  caption: {
    type: String,
    trim: true,
    maxlength: 280,
    default: ''
  },
  storageFileName: {
    type: String,
    default: null
  },
  reactions: {
    type: [galleryReactionSchema],
    default: []
  }
}, {
  timestamps: true
});

galleryImageSchema.index({ ownerId: 1, createdAt: -1 });
galleryImageSchema.index({ ownerId: 1, mediaUrl: 1 }, { unique: true });

galleryImageSchema.methods.getReactionCounts = function getReactionCounts() {
  let likesCount = 0;
  let dislikesCount = 0;

  for (const reaction of this.reactions || []) {
    if (reaction?.type === 'like') likesCount += 1;
    if (reaction?.type === 'dislike') dislikesCount += 1;
  }

  return {
    likesCount,
    dislikesCount
  };
};

galleryImageSchema.methods.getViewerReaction = function getViewerReaction(viewerId) {
  const normalizedViewerId = String(viewerId || '');
  if (!normalizedViewerId) return null;

  const existing = (this.reactions || []).find(
    (reaction) => String(reaction?.userId || '') === normalizedViewerId
  );

  return existing?.type || null;
};

galleryImageSchema.methods.applyReaction = function applyReaction(userId, reactionType) {
  const normalizedUserId = String(userId || '');
  if (!normalizedUserId) {
    throw new Error('Reaction userId is required');
  }

  const existingIndex = (this.reactions || []).findIndex(
    (reaction) => String(reaction?.userId || '') === normalizedUserId
  );

  if (existingIndex >= 0) {
    const existingReaction = this.reactions[existingIndex];
    if (existingReaction?.type === reactionType) {
      this.reactions.splice(existingIndex, 1);
    } else {
      existingReaction.type = reactionType;
      existingReaction.updatedAt = new Date();
    }
  } else {
    this.reactions.push({
      userId,
      type: reactionType,
      updatedAt: new Date()
    });
  }

  return {
    viewerReaction: this.getViewerReaction(normalizedUserId),
    ...this.getReactionCounts()
  };
};

galleryImageSchema.methods.canView = function canView(viewerId, context = {}) {
  const normalizedViewerId = String(viewerId || '');
  const normalizedOwnerId = String(this.ownerId || '');
  if (normalizedViewerId && normalizedOwnerId === normalizedViewerId) {
    return true;
  }

  const relationshipAudience = normalizeRelationshipAudience(this.relationshipAudience);
  if (relationshipAudience === 'secure') {
    return Boolean(context.isSecureFriend);
  }

  return true;
};

module.exports = mongoose.model('GalleryImage', galleryImageSchema);
