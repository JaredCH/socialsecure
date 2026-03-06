const mongoose = require('mongoose');

const profileLinkSchema = new mongoose.Schema({
  label: {
    type: String,
    trim: true,
    maxlength: 80,
    default: ''
  },
  url: {
    type: String,
    trim: true,
    maxlength: 300,
    default: ''
  }
}, { _id: false });

const experienceSchema = new mongoose.Schema({
  employer: { type: String, trim: true, maxlength: 120, default: '' },
  title: { type: String, trim: true, maxlength: 120, default: '' },
  location: { type: String, trim: true, maxlength: 120, default: null },
  startDate: { type: String, trim: true, maxlength: 20, default: '' },
  endDate: { type: String, trim: true, maxlength: 20, default: null },
  isCurrent: { type: Boolean, default: false },
  bullets: {
    type: [String],
    default: []
  }
}, { _id: false });

const educationSchema = new mongoose.Schema({
  institution: { type: String, trim: true, maxlength: 120, default: '' },
  degree: { type: String, trim: true, maxlength: 120, default: '' },
  fieldOfStudy: { type: String, trim: true, maxlength: 120, default: null },
  startDate: { type: String, trim: true, maxlength: 20, default: '' },
  endDate: { type: String, trim: true, maxlength: 20, default: null },
  isCurrent: { type: Boolean, default: false },
  location: { type: String, trim: true, maxlength: 120, default: null },
  bullets: {
    type: [String],
    default: []
  }
}, { _id: false });

const certificationSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 120, default: '' },
  issuer: { type: String, trim: true, maxlength: 120, default: null },
  issueDate: { type: String, trim: true, maxlength: 20, default: null },
  expirationDate: { type: String, trim: true, maxlength: 20, default: null },
  credentialId: { type: String, trim: true, maxlength: 120, default: null },
  url: { type: String, trim: true, maxlength: 300, default: null }
}, { _id: false });

const projectSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 120, default: '' },
  description: { type: String, trim: true, maxlength: 600, default: null },
  url: { type: String, trim: true, maxlength: 300, default: null },
  highlights: {
    type: [String],
    default: []
  }
}, { _id: false });

const resumeSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  basics: {
    fullName: { type: String, trim: true, maxlength: 120, default: '' },
    headline: { type: String, trim: true, maxlength: 160, default: '' },
    email: { type: String, trim: true, maxlength: 160, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: null },
    city: { type: String, trim: true, maxlength: 80, default: null },
    state: { type: String, trim: true, maxlength: 80, default: null },
    country: { type: String, trim: true, maxlength: 80, default: null },
    website: { type: String, trim: true, maxlength: 300, default: null },
    profileLinks: {
      type: [profileLinkSchema],
      default: []
    }
  },
  summary: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  experience: {
    type: [experienceSchema],
    default: []
  },
  education: {
    type: [educationSchema],
    default: []
  },
  skills: {
    type: [String],
    default: []
  },
  certifications: {
    type: [certificationSchema],
    default: []
  },
  projects: {
    type: [projectSchema],
    default: []
  },
  visibility: {
    type: String,
    enum: ['private', 'unlisted', 'public'],
    default: 'private'
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Resume', resumeSchema);
