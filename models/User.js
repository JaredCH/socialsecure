const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  universalId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  realName: {
    type: String,
    required: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  pgpPublicKey: {
    type: String,
    default: null
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    }
  },
  city: String,
  state: String,
  country: String,
  registrationStatus: {
    type: String,
    enum: ['pending', 'active', 'suspended'],
    default: 'pending'
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create geospatial index for location-based queries
userSchema.index({ location: '2dsphere' });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('passwordHash') && this.passwordHash) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// Generate universal ID from email/phone hash
userSchema.statics.generateUniversalId = function(email, phone) {
  const crypto = require('crypto');
  const input = email || phone;
  if (!input) return null;
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 32);
};

// Method to get public profile (without sensitive data)
userSchema.methods.toPublicProfile = function() {
  return {
    _id: this._id,
    username: this.username,
    realName: this.realName,
    city: this.city,
    state: this.state,
    country: this.country,
    registrationStatus: this.registrationStatus,
    hasPGP: !!this.pgpPublicKey,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);