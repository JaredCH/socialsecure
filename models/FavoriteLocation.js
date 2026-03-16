const mongoose = require('mongoose');

const favoriteLocationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  address: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  sourceType: {
    type: String,
    enum: ['address', 'current_location'],
    default: 'address'
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  city: {
    type: String,
    default: null
  },
  state: {
    type: String,
    default: null
  },
  country: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

favoriteLocationSchema.index({ location: '2dsphere' });
favoriteLocationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('FavoriteLocation', favoriteLocationSchema);
