const mongoose = require('mongoose');

const deviceKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128
  },
  keyVersion: {
    type: Number,
    required: true,
    min: 1,
    max: 1000000
  },
  publicEncryptionKey: {
    type: String,
    required: true,
    maxlength: 16384
  },
  publicSigningKey: {
    type: String,
    required: true,
    maxlength: 16384
  },
  algorithms: {
    encryption: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64
    },
    signing: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64
    }
  },
  isRevoked: {
    type: Boolean,
    default: false,
    index: true
  },
  revokedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

deviceKeySchema.index({ userId: 1, deviceId: 1 }, { unique: true });
deviceKeySchema.index({ userId: 1, isRevoked: 1, updatedAt: -1 });

module.exports = mongoose.model('DeviceKey', deviceKeySchema);
