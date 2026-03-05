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
  encryptionPasswordHash: {
    type: String,
    default: null
  },
  encryptionPasswordSetAt: {
    type: Date,
    default: null
  },
  encryptionPasswordVersion: {
    type: Number,
    default: 0,
    min: 0
  },
  pgpPublicKey: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  avatarUrl: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  bannerUrl: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  links: {
    type: [String],
    default: []
  },
  profileTheme: {
    type: String,
    enum: ['default', 'light', 'dark', 'sunset', 'forest'],
    default: 'default'
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
  zipCode: {
    type: String,
    trim: true,
    default: null
  },
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
  // Friend system privacy settings
  friendListPrivacy: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'friends'
  },
  topFriendsPrivacy: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'public'
  },
  onboardingStatus: {
    type: String,
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending'
  },
  onboardingStep: {
    type: Number,
    min: 1,
    max: 4,
    default: 1
  },
  securityPreferences: {
    loginNotifications: {
      type: Boolean,
      default: true
    },
    sessionTimeout: {
      type: Number,
      default: 60,
      min: 5,
      max: 1440
    },
    requirePasswordForSensitive: {
      type: Boolean,
      default: true
    }
  },
  // Friend count (cached for performance)
  friendCount: {
    type: Number,
    default: 0
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

// Method to compare encryption password
userSchema.methods.compareEncryptionPassword = async function(candidatePassword) {
  if (!this.encryptionPasswordHash) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.encryptionPasswordHash);
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
  const hasEncryptionPassword = Boolean(
    this.encryptionPasswordHash
    || this.encryptionPasswordSetAt
    || (typeof this.encryptionPasswordVersion === 'number' && this.encryptionPasswordVersion > 0)
  );

  return {
    _id: this._id,
    username: this.username,
    realName: this.realName,
    pgpPublicKey: this.pgpPublicKey || '',
    bio: this.bio || '',
    avatarUrl: this.avatarUrl || '',
    bannerUrl: this.bannerUrl || '',
    links: Array.isArray(this.links) ? this.links : [],
    profileTheme: this.profileTheme || 'default',
    city: this.city,
    state: this.state,
    country: this.country,
    registrationStatus: this.registrationStatus,
    hasPGP: !!this.pgpPublicKey,
    hasEncryptionPassword,
    onboardingStatus: this.onboardingStatus || 'pending',
    onboardingStep: this.onboardingStep || 1,
    securityPreferences: this.securityPreferences || {
      loginNotifications: true,
      sessionTimeout: 60,
      requirePasswordForSensitive: true
    },
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);
