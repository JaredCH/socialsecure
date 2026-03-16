const mongoose = require('mongoose');

const conversationMessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatConversation',
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
    default: null,
    trim: true,
    maxlength: 2000
  },
  messageType: {
    type: String,
    enum: ['text', 'action', 'system', 'command', 'meetup-invite'],
    default: 'text'
  },
  commandData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  senderNameColor: {
    type: String,
    trim: true,
    maxlength: 16,
    default: null,
    validate: {
      validator: (value) => value == null || /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value),
      message: 'senderNameColor must be a valid hex color'
    }
  },
  e2ee: {
    enabled: {
      type: Boolean,
      default: false,
      index: true
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
      maxlength: 8192,
      default: ''
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
    }
  }
}, {
  timestamps: true
});

conversationMessageSchema.index({ conversationId: 1, createdAt: -1 });
conversationMessageSchema.index(
  { conversationId: 1, 'e2ee.senderDeviceId': 1, 'e2ee.clientMessageId': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'e2ee.enabled': true,
      'e2ee.senderDeviceId': { $exists: true, $type: 'string' },
      'e2ee.clientMessageId': { $exists: true, $type: 'string' }
    }
  }
);

conversationMessageSchema.statics.toPublicMessageShape = function toPublicMessageShape(message, options = {}) {
  const isDmConversation = options.conversationType === 'dm';
  const isE2EE = !!message?.e2ee?.enabled;
  const base = {
    _id: message._id,
    conversationId: message.conversationId,
    userId: message.userId,
    messageType: message.messageType || 'text',
    commandData: message.commandData || null,
    senderNameColor: message.senderNameColor || null,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    isE2EE
  };

  if (isE2EE) {
    return {
      ...base,
      content: '[Encrypted message]',
      e2ee: {
        version: message.e2ee.version,
        senderDeviceId: message.e2ee.senderDeviceId,
        clientMessageId: message.e2ee.clientMessageId,
        keyVersion: message.e2ee.keyVersion,
        nonce: message.e2ee.nonce,
        aad: message.e2ee.aad || '',
        ciphertext: message.e2ee.ciphertext,
        signature: message.e2ee.signature,
        ciphertextHash: message.e2ee.ciphertextHash,
        algorithms: message.e2ee.algorithms
      }
    };
  }

  if (isDmConversation) {
    return {
      ...base,
      content: message.content || '',
      e2ee: null
    };
  }

  return {
    ...base,
    content: message.content || ''
  };
};

conversationMessageSchema.methods.toPublicMessage = function toPublicMessage(options = {}) {
  return this.constructor.toPublicMessageShape(this, options);
};

module.exports = mongoose.model('ConversationMessage', conversationMessageSchema);
