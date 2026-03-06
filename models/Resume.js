const mongoose = require('mongoose');

const resumeSectionItemSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
    maxlength: 200,
    default: ''
  },
  subtitle: {
    type: String,
    trim: true,
    maxlength: 200,
    default: ''
  },
  startDate: {
    type: String,
    trim: true,
    maxlength: 64,
    default: ''
  },
  endDate: {
    type: String,
    trim: true,
    maxlength: 64,
    default: ''
  },
  description: {
    type: String,
    trim: true,
    maxlength: 4000,
    default: ''
  },
  bullets: {
    type: [String],
    default: []
  }
}, { _id: false });

const resumeSectionSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
    maxlength: 200,
    default: ''
  },
  items: {
    type: [resumeSectionItemSchema],
    default: []
  }
}, { _id: false });

const resumeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  visibility: {
    type: String,
    enum: ['private', 'unlisted', 'public'],
    default: 'private'
  },
  basics: {
    headline: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },
    summary: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: ''
    }
  },
  sections: {
    type: [resumeSectionSchema],
    default: []
  }
}, {
  timestamps: true
});

resumeSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Resume', resumeSchema);
