const mongoose = require('mongoose');
const { normalizeRelationshipAudience } = require('../utils/relationshipAudience');

const calendarEventSchema = new mongoose.Schema({
  calendarId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Calendar',
    required: true,
    index: true
  },
  ownerId: {
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
  description: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  startAt: {
    type: Date,
    required: true
  },
  endAt: {
    type: Date,
    required: true,
    validate: {
      validator: function(endAt) {
        return !this.startAt || endAt >= this.startAt;
      },
      message: 'End time must be greater than or equal to start time'
    }
  },
  allDay: {
    type: Boolean,
    default: false
  },
  location: {
    type: String,
    trim: true,
    maxlength: 200,
    default: ''
  },
  color: {
    type: String,
    trim: true,
    enum: ['', 'blue', 'green', 'red', 'purple', 'orange', 'gray'],
    default: ''
  },
  recurrence: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'monthly'],
    default: 'none'
  },
  reminderMinutes: {
    type: Number,
    min: 0,
    max: 10080,
    default: null
  },
  invitees: {
    type: [String],
    default: []
  },
  announceToFeed: {
    type: Boolean,
    default: false
  },
  announceTarget: {
    type: String,
    enum: ['none', 'feed', 'post'],
    default: 'none'
  },
  relationshipAudience: {
    type: String,
    enum: ['public', 'social', 'secure'],
    default: 'social'
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

calendarEventSchema.index({ calendarId: 1, startAt: 1 });
calendarEventSchema.index({ ownerId: 1, startAt: 1 });

calendarEventSchema.pre('validate', function normalizeAudience(next) {
  this.relationshipAudience = normalizeRelationshipAudience(this.relationshipAudience);
  next();
});

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);
