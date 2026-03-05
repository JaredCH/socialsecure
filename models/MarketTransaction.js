const mongoose = require('mongoose');

const marketTransactionSchema = new mongoose.Schema({
  listingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketListing',
    required: true,
    index: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
    index: true
  },
  sellerAnonymous: {
    type: Boolean,
    default: false
  },
  buyerAnonymous: {
    type: Boolean,
    default: false
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  // Snapshot of listing title at time of transaction (for history even if listing deleted)
  listingTitle: {
    type: String,
    trim: true,
    default: ''
  },
  notificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notification',
    default: null
  }
}, {
  timestamps: true
});

marketTransactionSchema.index({ sellerId: 1, status: 1 });
marketTransactionSchema.index({ buyerId: 1, status: 1 });
marketTransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('MarketTransaction', marketTransactionSchema);
