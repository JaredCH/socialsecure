const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { DEFAULT_REALTIME_PREFERENCES, normalizeRealtimePreferences } = require('../utils/realtimePreferences');
const {
  SOCIAL_THEME_PRESETS,
  SOCIAL_ACCENT_TOKENS,
  normalizeSocialPagePreferences,
  SOCIAL_MODULE_IDS,
  buildDefaultSocialPagePreferences,
  toPublicSocialPagePreferences
} = require('../utils/socialPagePreferences');

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
  socialPagePreferences: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  stripImageMetadataOnUpload: {
    type: Boolean,
    default: false
  },
  enableMaturityWordCensor: {
    type: Boolean,
    default: true
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
  county: {
    type: String,
    trim: true,
    default: null
  },
  zipCode: {
    type: String,
    trim: true,
    default: null
  },
  streetAddress: {
    type: String,
    trim: true,
    default: ''
  },
  pendingStreetAddress: {
    type: String,
    trim: true,
    default: ''
  },
  pendingStreetAddressStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'denied'],
    default: 'none'
  },
  pendingStreetAddressRequestedAt: {
    type: Date,
    default: null
  },
  pendingStreetAddressReviewedAt: {
    type: Date,
    default: null
  },
  pendingStreetAddressReviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  addressApprovalRequests: {
    type: [{
      requesterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      requesterUsername: {
        type: String,
        trim: true,
        default: ''
      },
      requesterRealName: {
        type: String,
        trim: true,
        default: ''
      },
      address: {
        type: String,
        trim: true,
        required: true
      },
      status: {
        type: String,
        enum: ['pending', 'approved', 'denied'],
        default: 'pending'
      },
      requestedAt: {
        type: Date,
        default: Date.now
      },
      respondedAt: {
        type: Date,
        default: null
      }
    }],
    default: []
  },
  worksAt: {
    type: String,
    trim: true,
    default: ''
  },
  hobbies: {
    type: [String],
    default: []
  },
  ageGroup: {
    type: String,
    trim: true,
    default: ''
  },
  sex: {
    type: String,
    trim: true,
    default: ''
  },
  race: {
    type: String,
    trim: true,
    default: ''
  },
  profileFieldVisibility: {
    streetAddress: {
      type: String,
      enum: ['public', 'social', 'secure'],
      default: 'social'
    },
    phone: {
      type: String,
      enum: ['public', 'social', 'secure'],
      default: 'social'
    },
    email: {
      type: String,
      enum: ['public', 'social', 'secure'],
      default: 'social'
    },
    worksAt: {
      type: String,
      enum: ['public', 'social', 'secure'],
      default: 'social'
    },
    hobbies: {
      type: String,
      enum: ['public', 'social', 'secure'],
      default: 'social'
    },
    ageGroup: {
      type: String,
      enum: ['public', 'social', 'secure'],
      default: 'social'
    },
    sex: {
      type: String,
      enum: ['public', 'social', 'secure'],
      default: 'social'
    },
    race: {
      type: String,
      enum: ['public', 'social', 'secure'],
      default: 'social'
    }
  },
  locationLastUpdatedAt: {
    type: Date,
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
  circles: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    relationshipAudience: {
      type: String,
      enum: ['social', 'secure'],
      default: 'social'
    },
    profileImageUrl: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2048
    },
    members: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    color: {
      type: String,
      trim: true,
      default: '#3B82F6',
      maxlength: 16
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
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
  // Recovery kit metadata (never store the kit itself - E2EE principle)
  recoveryKit: {
    lastGeneratedAt: {
      type: Date,
      default: null
    },
    kitVersion: {
      type: Number,
      default: 1,
      min: 1
    }
  },
  // Security settings for backup prompts
  securitySettings: {
    promptForBackup: {
      type: Boolean,
      default: true
    },
    backupReminderInterval: {
      type: Number,
      default: 30 // days
    }
  },
  securityScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  moderationStatus: {
    type: String,
    enum: ['active', 'warned', 'suspended', 'banned'],
    default: 'active'
  },
  moderationHistory: [{
    action: {
      type: String,
      enum: ['warning', 'suspension', 'ban', 'mute', 'unmute', 'infraction_added', 'infraction_removed', 'password_reset']
    },
    reason: {
      type: String,
      default: ''
    },
    duration: {
      type: Number,
      default: null
    },
    appliedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: null
    },
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  }],
  isAdmin: {
    type: Boolean,
    default: false
  },
  mustResetPassword: {
    type: Boolean,
    default: false
  },
  mutedUntil: {
    type: Date,
    default: null
  },
  muteReason: {
    type: String,
    trim: true,
    default: ''
  },
  notificationPreferences: {
    likes: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      push: { type: Boolean, default: false }
    },
    comments: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false }
    },
    mentions: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false }
    },
    follows: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      push: { type: Boolean, default: false }
    },
    messages: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      push: { type: Boolean, default: false }
    },
    system: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false }
    },
    securityAlerts: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false }
    },
    realtime: {
      enabled: { type: Boolean, default: true },
      typingIndicators: { type: Boolean, default: true },
      presence: { type: Boolean, default: true }
    }
  },
  unreadNotificationCount: {
    type: Number,
    default: 0,
    min: 0
  },
  realtimePreferences: {
    enabled: {
      type: Boolean,
      default: DEFAULT_REALTIME_PREFERENCES.enabled
    },
    showPresence: {
      type: Boolean,
      default: DEFAULT_REALTIME_PREFERENCES.showPresence
    },
    showLastSeen: {
      type: Boolean,
      default: DEFAULT_REALTIME_PREFERENCES.showLastSeen
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
userSchema.index({ registrationStatus: 1, createdAt: -1 });
userSchema.index({ city: 1, state: 1, country: 1 });
userSchema.index({ zipCode: 1 });
userSchema.index({ friendCount: -1, createdAt: -1 });

// Compound index to support discovery queries: active users ordered by recency
userSchema.index({ registrationStatus: 1, createdAt: -1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  const looksLikeBcryptHash = typeof this.passwordHash === 'string' && /^\$2[aby]\$\d{2}\$/.test(this.passwordHash);
  if (this.isModified('passwordHash') && this.passwordHash && !looksLikeBcryptHash) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
  const normalizedSocialPreferences = normalizeSocialPagePreferences(this.socialPagePreferences, {
    profileTheme: this.profileTheme || 'default'
  });
  this.socialPagePreferences = normalizedSocialPreferences.value || buildDefaultSocialPagePreferences(this.profileTheme);
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
    socialPagePreferences: toPublicSocialPagePreferences(this.socialPagePreferences, {
      profileTheme: this.profileTheme || 'default'
    }),
    stripImageMetadataOnUpload: this.stripImageMetadataOnUpload === true,
    enableMaturityWordCensor: this.enableMaturityWordCensor !== false,
    city: this.city,
    state: this.state,
    country: this.country,
    county: this.county,
    zipCode: this.zipCode,
    phone: this.phone || '',
    worksAt: this.worksAt || '',
    hobbies: Array.isArray(this.hobbies) ? this.hobbies : [],
    ageGroup: this.ageGroup || '',
    sex: this.sex || '',
    race: this.race || '',
    streetAddress: this.streetAddress || '',
    profileFieldVisibility: this.profileFieldVisibility || {},
    registrationStatus: this.registrationStatus,
    hasPGP: !!this.pgpPublicKey,
    hasEncryptionPassword,
    isAdmin: !!this.isAdmin,
    moderationStatus: this.moderationStatus || 'active',
    mustResetPassword: !!this.mustResetPassword,
    mutedUntil: this.mutedUntil || null,
    muteReason: this.muteReason || '',
    unreadNotificationCount: this.unreadNotificationCount || 0,
    notificationPreferences: this.notificationPreferences || {
      likes: { inApp: true, email: false, push: false },
      comments: { inApp: true, email: true, push: false },
      mentions: { inApp: true, email: true, push: false },
      follows: { inApp: true, email: false, push: false },
      messages: { inApp: true, email: false, push: false },
      system: { inApp: true, email: true, push: false },
      securityAlerts: { inApp: true, email: true, push: false }
    },
    realtimePreferences: normalizeRealtimePreferences(this.realtimePreferences),
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
