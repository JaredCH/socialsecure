const mongoose = require('mongoose');

const eventScheduleSchema = new mongoose.Schema({
  eventType: {
    type: String,
    enum: ['tv_episode', 'live_sport'],
    required: true
  },
  leagueOrSeries: {
    type: String,
    trim: true,
    required: true
  },
  title: {
    type: String,
    trim: true,
    required: true
  },
  season: {
    type: Number,
    min: 0,
    default: null
  },
  episode: {
    type: Number,
    min: 0,
    default: null
  },
  startAt: {
    type: Date,
    required: true,
    index: true
  },
  endAt: {
    type: Date,
    default: null
  },
  sourceRef: {
    type: String,
    required: true,
    trim: true
  },
  sourceUpdatedAt: {
    type: Date,
    default: Date.now
  },
  sourceKey: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'live', 'completed', 'canceled'],
    default: 'scheduled',
    index: true
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  dedupeKey: {
    type: String,
    required: true,
    unique: true
  }
}, {
  timestamps: true
});

eventScheduleSchema.index({ eventType: 1, startAt: 1, status: 1 });
eventScheduleSchema.index({ tags: 1, startAt: 1 });
eventScheduleSchema.index({ sourceKey: 1, sourceRef: 1 });

module.exports = mongoose.model('EventSchedule', eventScheduleSchema);
