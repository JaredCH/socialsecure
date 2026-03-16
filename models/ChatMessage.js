const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  messageType: {
    type: String,
    enum: ['text', 'action', 'system', 'command'],
    default: 'text',
    index: true
  },
  mediaType: {
    type: String,
    enum: ['audio', null],
    default: null,
    index: true
  },
  audio: {
    storageKey: {
      type: String,
      trim: true,
      maxlength: 255,
      default: null
    },
    url: {
      type: String,
      trim: true,
      maxlength: 1024,
      default: null
    },
    durationMs: {
      type: Number,
      min: 1,
      max: 120000,
      default: null
    },
    waveformBins: {
      type: [Number],
      default: []
    },
    mimeType: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null
    },
    sizeBytes: {
      type: Number,
      min: 1,
      max: 10485760,
      default: null
    }
  },
  commandData: {
    command: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    processedContent: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null
    },
    targetUserId: {
      type: String,
      trim: true,
      maxlength: 128,
      default: null
    },
    targetUsername: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null
    },
    nickname: {
      type: String,
      trim: true,
      maxlength: 32,
      default: null
    }
  },
  encryptedContent: {
    type: String,
    default: null
  },
  isEncrypted: {
    type: Boolean,
    default: false
  },
  e2ee: {
    enabled: {
      type: Boolean,
      default: false,
      index: true
    },
    migrationFlag: {
      type: String,
      enum: ['legacy', 'migrated', 'native-e2ee'],
      default: 'legacy'
    },
    version: {
      type: Number,
      min: 1,
      max: 10
    },
    senderDeviceId: {
      type: String,
      trim: true,
      maxlength: 128
    },
    clientMessageId: {
      type: String,
      trim: true,
      maxlength: 128
    },
    keyVersion: {
      type: Number,
      min: 1,
      max: 1000000
    },
    nonce: {
      type: String,
      maxlength: 4096
    },
    aad: {
      type: String,
      maxlength: 8192
    },
    ciphertext: {
      type: String,
      maxlength: 131072
    },
    signature: {
      type: String,
      maxlength: 16384
    },
    ciphertextHash: {
      type: String,
      maxlength: 128
    },
    algorithms: {
      cipher: {
        type: String,
        trim: true,
        maxlength: 64
      },
      signature: {
        type: String,
        trim: true,
        maxlength: 64
      },
      hash: {
        type: String,
        trim: true,
        maxlength: 32
      }
    },
    migratedAt: {
      type: Date,
      default: null
    },
    plaintextTombstoned: {
      type: Boolean,
      default: false
    },
    migratedFromMessageFormat: {
      type: String,
      enum: ['legacy-plaintext', 'legacy-encrypted-content', null],
      default: null
    },
    migrationActorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
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
  rateLimitKey: {
    type: String,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  moderation: {
    removedByAdmin: {
      type: Boolean,
      default: false,
      index: true
    },
    removedByAdminAt: {
      type: Date,
      default: null
    },
    removedByAdminBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    originalPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  }
}, {
  timestamps: true
});

// Index for efficient room message retrieval
chatMessageSchema.index({ roomId: 1, createdAt: -1 });
chatMessageSchema.index({ roomId: 1, createdAt: -1, _id: -1 });
chatMessageSchema.index({ userId: 1, createdAt: -1 });
chatMessageSchema.index(
  { 'e2ee.senderDeviceId': 1, 'e2ee.clientMessageId': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'e2ee.enabled': true,
      'e2ee.senderDeviceId': { $exists: true, $type: 'string' },
      'e2ee.clientMessageId': { $exists: true, $type: 'string' }
    }
  }
);

chatMessageSchema.statics.toPublicMessageShape = function(message) {
  const base = {
    _id: message._id,
    roomId: message.roomId,
    userId: message.userId,
    isEncrypted: !!message.isEncrypted,
    isE2EE: !!message?.e2ee?.enabled,
    messageType: message.messageType || 'text',
    mediaType: message.mediaType || null,
    audio: message.mediaType === 'audio' ? (message.audio || null) : null,
    commandData: message.commandData || null,
    location: message.location,
    createdAt: message.createdAt,
    moderation: {
      removedByAdmin: !!message?.moderation?.removedByAdmin,
      removedByAdminAt: message?.moderation?.removedByAdminAt || null
    },
    migrationFlag: message?.e2ee?.migrationFlag || 'legacy',
    plaintextTombstoned: !!message?.e2ee?.plaintextTombstoned,
    migratedAt: message?.e2ee?.migratedAt || null,
    migratedFromMessageFormat: message?.e2ee?.migratedFromMessageFormat || null
  };

  if (message?.e2ee?.enabled) {
    return {
      ...base,
      content: null,
      e2ee: {
        version: message.e2ee.version,
        senderDeviceId: message.e2ee.senderDeviceId,
        clientMessageId: message.e2ee.clientMessageId,
        keyVersion: message.e2ee.keyVersion,
        nonce: message.e2ee.nonce,
        aad: message.e2ee.aad,
        ciphertext: message.e2ee.ciphertext,
        signature: message.e2ee.signature,
        ciphertextHash: message.e2ee.ciphertextHash,
        migratedAt: message.e2ee.migratedAt,
        plaintextTombstoned: !!message.e2ee.plaintextTombstoned,
        migratedFromMessageFormat: message.e2ee.migratedFromMessageFormat,
        algorithms: message.e2ee.algorithms
      }
    };
  }

  return {
    ...base,
    content: message.isEncrypted ? '[Encrypted message]' : message.content
  };
};

// Static method to get messages for a room with pagination
chatMessageSchema.statics.getRoomMessages = async function(roomId, page = 1, limit = 50) {
  const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);
  const normalizedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const skip = (normalizedPage - 1) * normalizedLimit;
  
  const messages = await this.find({ roomId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(normalizedLimit)
    .populate('userId', 'username realName')
    .lean();
  
  return messages.reverse().map((message) => this.toPublicMessageShape(message)); // Return in chronological order
};

chatMessageSchema.statics.getRoomMessagesByCursor = async function(roomId, options = {}) {
  const normalizedLimit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 1), 500);
  const filter = { roomId };

  if (options.beforeCreatedAt && options.beforeId) {
    filter.$or = [
      { createdAt: { $lt: options.beforeCreatedAt } },
      { createdAt: options.beforeCreatedAt, _id: { $lt: options.beforeId } }
    ];
  }

  const docs = await this.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(normalizedLimit + 1)
    .populate('userId', 'username realName')
    .lean();

  const hasMore = docs.length > normalizedLimit;
  if (hasMore) {
    docs.pop();
  }

  const cursorSource = docs[docs.length - 1] || null;
  const messages = docs.reverse().map((message) => this.toPublicMessageShape(message));

  return {
    messages,
    hasMore,
    cursorSource,
    limit: normalizedLimit
  };
};

// Static method to check rate limit for user based on distance to room
// Distance buckets:
// - Primary (same city): unlimited
// - Nearby (<=50 miles): 3 messages per 15 seconds
// - Remote (>50 miles): 1 message per 15 seconds
chatMessageSchema.statics.checkRateLimit = async function(userId, roomId, userCity, roomCity, distanceMiles = null) {
  // If user is in the same city as room (primary city), no rate limit
  if (userCity === roomCity) {
    return {
      allowed: true,
      remaining: Infinity,
      bucket: 'primary',
      limit: null
    };
  }
  
  // Determine distance bucket
  let bucket = 'remote';
  let maxMessages = 1;
  let windowMs = 15000; // 15 seconds
  
  if (distanceMiles !== null && distanceMiles <= 50) {
    bucket = 'nearby';
    maxMessages = 3;
  }
  
  const windowStart = new Date(Date.now() - windowMs);
  const key = `${userId}:${roomId}:${bucket}`;
  
  // Count messages in the time window
  const messageCount = await this.countDocuments({
    rateLimitKey: key,
    createdAt: { $gte: windowStart }
  });
  
  if (messageCount >= maxMessages) {
    // Calculate retry after time
    const oldestMessage = await this.findOne({
      rateLimitKey: key,
      createdAt: { $gte: windowStart }
    }).sort({ createdAt: 1 });
    
    let retryAfter = 15;
    if (oldestMessage) {
      const oldestTime = new Date(oldestMessage.createdAt).getTime();
      const retryTime = oldestTime + windowMs - Date.now();
      retryAfter = Math.max(1, Math.ceil(retryTime / 1000));
    }
    
    return {
      allowed: false,
      remaining: 0,
      bucket,
      limit: maxMessages,
      windowSeconds: windowMs / 1000,
      retryAfter
    };
  }
  
  return {
    allowed: true,
    remaining: maxMessages - messageCount,
    bucket,
    limit: maxMessages,
    windowSeconds: windowMs / 1000
  };
};

// Method to get public representation (hides encrypted content)
chatMessageSchema.methods.toPublicMessage = function() {
  return this.constructor.toPublicMessageShape(this);
};

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
