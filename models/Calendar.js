const mongoose = require('mongoose');

const calendarSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    trim: true,
    maxlength: 120,
    default: 'My Calendar'
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  guestVisibility: {
    type: String,
    enum: ['private', 'public_readonly', 'friends_readonly'],
    default: 'private'
  },
  timezone: {
    type: String,
    trim: true,
    maxlength: 80,
    default: 'UTC'
  },
  defaultView: {
    type: String,
    enum: ['month', 'week', 'agenda'],
    default: 'month'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Calendar', calendarSchema);
