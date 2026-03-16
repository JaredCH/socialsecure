const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockChatRoom = {};
const mockChatMessage = {};
const mockDeviceKey = { findOne: jest.fn(), find: jest.fn() };
const mockSecurityEvent = {};
const mockBlockList = { findOne: jest.fn() };
const mockRoomKeyPackage = {};
const mockUser = { findById: jest.fn(), find: jest.fn() };
const mockFriendship = { findOne: jest.fn() };
const mockChatConversation = {
  findOneAndUpdate: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn()
};
const mockConversationMessage = {
  find: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
  toPublicMessageShape: jest.fn((message) => message)
};
const mockConversationKeyPackage = {
  findOneAndUpdate: jest.fn(),
  find: jest.fn(),
  updateMany: jest.fn()
};

jest.mock('../models/ChatRoom', () => mockChatRoom);
jest.mock('../models/ChatMessage', () => mockChatMessage);
jest.mock('../models/DeviceKey', () => mockDeviceKey);
jest.mock('../models/SecurityEvent', () => mockSecurityEvent);
jest.mock('../models/BlockList', () => mockBlockList);
jest.mock('../models/RoomKeyPackage', () => mockRoomKeyPackage);
jest.mock('../models/User', () => mockUser);
jest.mock('../models/Friendship', () => mockFriendship);
jest.mock('../models/ChatConversation', () => mockChatConversation);
jest.mock('../models/ConversationMessage', () => mockConversationMessage);
jest.mock('../models/ConversationKeyPackage', () => mockConversationKeyPackage);
jest.mock('../services/notifications', () => ({ createNotification: jest.fn() }));
jest.mock('../services/realtime', () => ({ emitChatMessage: jest.fn() }));

const jwt = require('jsonwebtoken');
const { emitChatMessage } = require('../services/realtime');
const chatRouter = require('./chat');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRouter);
  return app;
};

const createSelectResolved = (value) => ({
  select: jest.fn().mockResolvedValue(value)
});

const createSelectLean = (value) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value)
  })
});

const validDmEnvelope = {
  version: 1,
  senderDeviceId: 'device-1',
  clientMessageId: 'client-1',
  keyVersion: 1,
  nonce: 'bm9uY2U',
  aad: '',
  ciphertext: 'Y2lwaGVydGV4dA',
  signature: 'c2lnbmF0dXJl',
  ciphertextHash: 'a'.repeat(64),
  algorithms: {
    cipher: 'AES-256-GCM',
    signature: 'ECDSA-P256-SHA256',
    hash: 'SHA-256'
  }
};

describe('Unified chat hub routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: '507f1f77bcf86cd799439011' }));
    mockUser.findById.mockImplementation(() => createSelectResolved({ onboardingStatus: 'completed' }));
    mockUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });
    mockBlockList.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      })
    });
    mockDeviceKey.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'device-1' })
      })
    });
    mockDeviceKey.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      })
    });
    mockFriendship.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'friendship-1' })
      })
    });
  });

  it('defaults to user zip room and nearby active zip rooms', async () => {
    const app = buildApp();
    mockUser.findById
      .mockImplementationOnce(() => createSelectResolved({ onboardingStatus: 'completed' }))
      .mockImplementationOnce(() => createSelectLean({
        _id: '507f1f77bcf86cd799439011',
        username: 'alpha',
        zipCode: '02115-1234'
      }));

    mockChatConversation.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'conv-zip',
        type: 'zip-room',
        title: 'Zip 02115',
        zipCode: '02115',
        participants: [],
        messageCount: 0,
        lastMessageAt: new Date('2024-01-01T00:00:00.000Z')
      })
    });

    mockChatConversation.find.mockImplementation((query) => {
      if (query?.type === 'zip-room') {
        return {
          select: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                  {
                    _id: 'nearby-1',
                    type: 'zip-room',
                    title: 'Zip 02110',
                    zipCode: '02110',
                    messageCount: 5,
                    lastMessageAt: new Date('2024-01-02T00:00:00.000Z')
                  },
                  {
                    _id: 'far-1',
                    type: 'zip-room',
                    title: 'Zip 90210',
                    zipCode: '90210',
                    messageCount: 8,
                    lastMessageAt: new Date('2024-01-03T00:00:00.000Z')
                  }
                ])
              })
            })
          })
        };
      }
      return {
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      };
    });

    const response = await request(app)
      .get('/api/chat/conversations')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.conversations.zip.current.zipCode).toBe('02115');
    expect(response.body.conversations.zip.nearby).toHaveLength(1);
    expect(response.body.conversations.zip.nearby[0].zipCode).toBe('02110');
  });

  it('enforces participant permissions for DM conversations', async () => {
    const app = buildApp();
    mockChatConversation.findById.mockResolvedValue({
      _id: 'conv-dm',
      type: 'dm',
      participants: ['507f1f77bcf86cd799439099']
    });

    const response = await request(app)
      .post('/api/chat/conversations/conv-dm/messages')
      .set('Authorization', 'Bearer token')
      .send({ content: 'hello' });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/Access denied/);
  });

  it('creates profile thread and returns shared conversation id', async () => {
    const app = buildApp();
    mockUser.findById
      .mockImplementationOnce(() => createSelectResolved({ onboardingStatus: 'completed' }))
      .mockImplementationOnce(() => createSelectLean({
        _id: '507f1f77bcf86cd799439022',
        username: 'profileOwner',
        realName: 'Profile Owner'
      }))
      .mockImplementationOnce(() => createSelectLean({
        _id: '507f1f77bcf86cd799439022',
        circles: []
      }));

    mockChatConversation.findOne.mockResolvedValue(null);
    mockChatConversation.create.mockResolvedValue({
      _id: 'profile-thread-1',
      type: 'profile-thread',
      title: 'Profile thread: @profileOwner',
      profileUserId: '507f1f77bcf86cd799439022',
      participants: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022'],
      lastMessageAt: new Date('2024-01-04T00:00:00.000Z'),
      messageCount: 0
    });

    const response = await request(app)
      .get('/api/chat/profile/507f1f77bcf86cd799439022/thread')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.conversation.type).toBe('profile-thread');
    expect(response.body.conversation._id).toBe('profile-thread-1');
    expect(response.body.conversation.profileThreadAccess.readRoles).toEqual(['friends', 'circles']);
  });

  it('allows guests to load profile threads when guest read access is enabled', async () => {
    const app = buildApp();
    mockUser.findById.mockImplementation(() => createSelectLean({
      _id: '507f1f77bcf86cd799439022',
      username: 'profileOwner',
      realName: 'Profile Owner',
      circles: []
    }));

    mockChatConversation.findOne.mockResolvedValue({
      _id: 'profile-thread-guest',
      type: 'profile-thread',
      title: 'Profile thread: @profileOwner',
      profileUserId: '507f1f77bcf86cd799439022',
      profileThreadAccess: { readRoles: ['guests'], writeRoles: ['friends'] },
      participants: ['507f1f77bcf86cd799439022'],
      lastMessageAt: new Date('2024-01-04T00:00:00.000Z'),
      messageCount: 3
    });

    const response = await request(app)
      .get('/api/chat/profile/507f1f77bcf86cd799439022/thread');

    expect(response.status).toBe(200);
    expect(response.body.conversation.permissions.canRead).toBe(true);
    expect(response.body.conversation.permissions.canWrite).toBe(false);
  });

  it('denies profile thread reads when viewer is outside configured access roles', async () => {
    const app = buildApp();
    mockUser.findById
      .mockImplementationOnce(() => createSelectResolved({ onboardingStatus: 'completed' }))
      .mockImplementationOnce(() => createSelectLean({
        _id: '507f1f77bcf86cd799439022',
        username: 'profileOwner',
        realName: 'Profile Owner',
        circles: []
      }))
      .mockImplementationOnce(() => createSelectLean({
        _id: '507f1f77bcf86cd799439022',
        circles: []
      }));

    mockFriendship.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      })
    });
    mockChatConversation.findOne.mockResolvedValue({
      _id: 'profile-thread-2',
      type: 'profile-thread',
      title: 'Profile thread: @profileOwner',
      profileUserId: '507f1f77bcf86cd799439022',
      profileThreadAccess: { readRoles: ['friends'], writeRoles: ['friends'] },
      participants: ['507f1f77bcf86cd799439022'],
      lastMessageAt: new Date('2024-01-04T00:00:00.000Z'),
      messageCount: 0
    });

    const response = await request(app)
      .get('/api/chat/profile/507f1f77bcf86cd799439022/thread')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/unavailable/i);
  });

  it('returns profile thread messages to guests when guest read access is enabled', async () => {
    const app = buildApp();
    mockChatConversation.findById.mockResolvedValue({
      _id: 'profile-thread-2',
      type: 'profile-thread',
      title: 'Profile thread: @profileOwner',
      profileUserId: '507f1f77bcf86cd799439022',
      profileThreadAccess: { readRoles: ['guests'], writeRoles: ['friends'] },
      participants: ['507f1f77bcf86cd799439022']
    });
    mockConversationMessage.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                {
                  _id: 'msg-guest-1',
                  content: 'hello world',
                  userId: { _id: '507f1f77bcf86cd799439022', username: 'profileOwner' }
                }
              ])
            })
          })
        })
      })
    });
    mockConversationMessage.countDocuments.mockResolvedValue(1);

    const response = await request(app)
      .get('/api/chat/conversations/profile-thread-2/messages');

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0].content).toBe('hello world');
  });

  it('allows profile owners to update profile thread access settings', async () => {
    const app = buildApp();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: '507f1f77bcf86cd799439022' }));
    mockUser.findById
      .mockImplementationOnce(() => createSelectResolved({ onboardingStatus: 'completed' }))
      .mockImplementationOnce(() => createSelectLean({
        _id: '507f1f77bcf86cd799439022',
        username: 'profileOwner'
      }));

    const save = jest.fn().mockResolvedValue(undefined);
    mockChatConversation.findOne.mockResolvedValue({
      _id: 'profile-thread-3',
      type: 'profile-thread',
      profileUserId: '507f1f77bcf86cd799439022',
      participants: ['507f1f77bcf86cd799439022'],
      profileThreadAccess: { readRoles: ['friends'], writeRoles: ['friends'] },
      save
    });

    const response = await request(app)
      .put('/api/chat/profile/507f1f77bcf86cd799439022/thread/settings')
      .set('Authorization', 'Bearer token')
      .send({ readRoles: ['friends', 'guests'], writeRoles: ['friends'] });

    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalled();
    expect(response.body.conversation.profileThreadAccess.readRoles).toEqual(['friends', 'guests']);
  });

  it('lists users for an accessible zip conversation', async () => {
    const app = buildApp();
    mockChatConversation.findById.mockResolvedValue({
      _id: 'conv-zip',
      type: 'zip-room',
      title: 'Zip 02115',
      participants: []
    });
    mockConversationMessage.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([{ userId: '507f1f77bcf86cd799439022' }])
          })
        })
      })
    });
    mockUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: '507f1f77bcf86cd799439022', username: 'buddy', realName: 'Buddy' }
        ])
      })
    });

    const response = await request(app)
      .get('/api/chat/conversations/conv-zip/users')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.users).toEqual([
      { _id: '507f1f77bcf86cd799439022', username: 'buddy', realName: 'Buddy' }
    ]);
  });

  it('stores sender name color when posting conversation messages', async () => {
    const app = buildApp();
    const conversationDoc = {
      _id: 'conv-zip',
      type: 'zip-room',
      participants: [],
      messageCount: 0,
      save: jest.fn().mockResolvedValue(undefined)
    };
    const populate = jest.fn().mockResolvedValue(undefined);
    const createdMessage = {
      _id: 'msg-1',
      content: 'hello',
      senderNameColor: '#ff0000',
      userId: { _id: '507f1f77bcf86cd799439011', username: 'alpha' },
      populate,
      toPublicMessage: jest.fn().mockReturnValue({
        _id: 'msg-1',
        content: 'hello',
        senderNameColor: '#ff0000'
      })
    };

    mockChatConversation.findById.mockResolvedValue(conversationDoc);
    mockConversationMessage.create.mockResolvedValue(createdMessage);

    const response = await request(app)
      .post('/api/chat/conversations/conv-zip/messages')
      .set('Authorization', 'Bearer token')
      .send({ content: 'hello', senderNameColor: '#ff0000' });

    expect(response.status).toBe(201);
    expect(mockConversationMessage.create).toHaveBeenCalledWith({
      conversationId: 'conv-zip',
      userId: '507f1f77bcf86cd799439011',
      content: 'hello',
      messageType: 'text',
      commandData: null,
      senderNameColor: '#ff0000',
      e2ee: { enabled: false }
    });
    expect(populate).toHaveBeenCalledWith('userId', '_id username realName');
    expect(emitChatMessage).toHaveBeenCalledWith({
      userIds: ['507f1f77bcf86cd799439011'],
      message: { _id: 'msg-1', content: 'hello', senderNameColor: '#ff0000' }
    });
  });

  it('rejects plaintext DM message payloads', async () => {
    const app = buildApp();
    mockChatConversation.findById.mockResolvedValue({
      _id: 'conv-dm',
      type: 'dm',
      participants: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022']
    });

    const response = await request(app)
      .post('/api/chat/conversations/conv-dm/messages')
      .set('Authorization', 'Bearer token')
      .send({ content: 'hello' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Plaintext content is not allowed/);
  });

  it('accepts E2EE envelope payload for DM messages', async () => {
    const app = buildApp();
    const conversationDoc = {
      _id: 'conv-dm',
      type: 'dm',
      participants: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022'],
      messageCount: 1,
      save: jest.fn().mockResolvedValue(undefined)
    };
    const createdMessage = {
      _id: 'dm-msg-1',
      userId: { _id: '507f1f77bcf86cd799439011', username: 'alpha' },
      populate: jest.fn().mockResolvedValue(undefined),
      toPublicMessage: jest.fn().mockReturnValue({
        _id: 'dm-msg-1',
        isE2EE: true,
        content: '[Encrypted message]',
        e2ee: { senderDeviceId: 'device-1' }
      })
    };
    mockChatConversation.findById.mockResolvedValue(conversationDoc);
    mockConversationMessage.findOne.mockReturnValue(createSelectLean(null));
    mockConversationMessage.create.mockResolvedValue(createdMessage);

    const response = await request(app)
      .post('/api/chat/conversations/conv-dm/messages')
      .set('Authorization', 'Bearer token')
      .send({ e2ee: validDmEnvelope, messageType: 'meetup-invite' });

    expect(response.status).toBe(201);
    expect(mockConversationMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-dm',
      userId: '507f1f77bcf86cd799439011',
      content: null,
      messageType: 'meetup-invite'
    }));
    expect(emitChatMessage).toHaveBeenCalledWith({
      userIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022'],
      message: {
        _id: 'dm-msg-1',
        isE2EE: true,
        content: '[Encrypted message]',
        e2ee: { senderDeviceId: 'device-1' }
      }
    });
  });

  it('syncs DM key packages only for authenticated active device', async () => {
    const app = buildApp();
    mockChatConversation.findById.mockResolvedValue({
      _id: 'conv-dm',
      type: 'dm',
      participants: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022']
    });
    mockConversationKeyPackage.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      })
    });
    mockConversationKeyPackage.updateMany.mockResolvedValue({ modifiedCount: 0 });

    const response = await request(app)
      .get('/api/chat/conversations/conv-dm/keys/packages/sync?deviceId=device-1')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.conversationId).toBe('conv-dm');
  });

  it('rejects conversation message attachments', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/chat/conversations/conv-dm/messages')
      .set('Authorization', 'Bearer token')
      .send({ content: 'hello', attachments: [{ name: 'file.png' }] });

    expect(response.status).toBe(400);
    expect(response.body.errors?.[0]?.msg).toMatch(/Attachments are not supported/);
  });
});
