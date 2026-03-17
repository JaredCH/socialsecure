const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  slug: {
    type: String,
    trim: true,
    maxlength: 250
  },
  content: {
    type: String,
    required: true,
    maxlength: 50000
  },
  excerpt: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  category: {
    type: String,
    trim: true,
    maxlength: 100,
    default: 'General'
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  audience: {
    type: String,
    enum: ['social', 'secure'],
    default: 'social'
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft'
  },
  publishedAt: {
    type: Date,
    default: null
  },
  backgroundImage: {
    type: String,
    trim: true,
    maxlength: 2048,
    default: ''
  },
  backgroundColor: {
    type: String,
    trim: true,
    maxlength: 20,
    default: ''
  },
  fontFamily: {
    type: String,
    trim: true,
    maxlength: 60,
    default: ''
  },
  fontSize: {
    type: Number,
    min: 12,
    max: 32,
    default: 16
  },
  fontColor: {
    type: String,
    trim: true,
    maxlength: 20,
    default: ''
  },
  reactions: {
    like: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    love: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    insightful: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

blogPostSchema.index({ author: 1, status: 1, publishedAt: -1 });
blogPostSchema.index({ author: 1, slug: 1 }, { unique: true });

blogPostSchema.pre('save', function generateSlug(next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 200);
  }
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('BlogPost', blogPostSchema);
