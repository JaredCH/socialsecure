const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockChatRoom = { findById: jest.fn() };
const mockDeviceKey = { findOne: jest.fn() };
const mockUser = { findById: jest.fn() };
const mockRoomKeyPackage = {};
const mockChatConversation = {};
const mockConversationMessage = { findOne: jest.fn() };
const mockConversationKeyPackage = {};
const mockBlockList = { findOne: jest.fn() };
const mockSiteContentFilter = { findOne: jest.fn() };

const createSelectLean = (value) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value)
  })
});
const createSelectLeanOrSort = (value) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value),
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value)
    })
  })
});
const createLean = (value) => ({
  lean: jest.fn().mockResolvedValue(value)
});

const createUserDoc = (value) => ({
  ...value,
  select: jest.fn().mockResolvedValue(value)
});

const createQueryResult = (value) => ({
  select: jest.fn().mockResolvedValue(value),
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  catch: (reject) => Promise.resolve(value).catch(reject)
});

const createLeanResult = (value) => ({
  lean: jest.fn().mockResolvedValue(value)
});

const mockChatMessage = jest.fn();
mockChatMessage.findOne = jest.fn();
mockChatMessage.getRoomMessages = jest.fn();
mockChatMessage.getRoomMessagesByCursor = jest.fn();

jest.mock('../models/ChatRoom', () => mockChatRoom);
jest.mock('../models/ChatMessage', () => mockChatMessage);
jest.mock('../models/DeviceKey', () => mockDeviceKey);
jest.mock('../models/RoomKeyPackage', () => mockRoomKeyPackage);
jest.mock('../models/ChatConversation', () => mockChatConversation);
jest.mock('../models/ConversationMessage', () => mockConversationMessage);
jest.mock('../models/ConversationKeyPackage', () => mockConversationKeyPackage);
jest.mock('../models/User', () => mockUser);
jest.mock('../models/BlockList', () => mockBlockList);
jest.mock('../models/SiteContentFilter', () => mockSiteContentFilter);
jest.mock('../services/realtime', () => ({
  emitChatMessage: jest.fn()
}));

const jwt = require('jsonwebtoken');
const chatRouter = require('./chat');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRouter);
  return app;
};

const validEnvelope = {
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
    cipher: 'xchacha20poly1305',
    signature: 'ed25519',
    hash: 'sha256'
  }
};

describe('Chat E2EE boundary hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'user-1' }));
    mockUser.findById.mockImplementation(() => createQueryResult({
      _id: 'user-1',
      onboardingStatus: 'completed',
      city: 'City',
      location: { coordinates: [0, 0] }
    }));
    mockBlockList.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue(createLeanResult(null))
    });
    mockSiteContentFilter.findOne.mockReturnValue(createLeanResult({
      zeroToleranceWords: [],
      maturityCensoredWords: []
    }));
    mockChatMessage.findOne.mockReturnValue(createSelectLeanOrSort(null));
    mockConversationMessage.findOne.mockReturnValue(createSelectLeanOrSort(null));
  });

  it('rejects plaintext on E2EE message endpoint', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/chat/rooms/room-1/messages/e2ee')
      .set('Authorization', 'Bearer token')
      .send({
        content: 'plaintext',
        e2ee: validEnvelope
      });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('Plaintext content is not allowed on E2EE endpoint');
  });

  it('rejects malformed/tampered envelope hash', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/chat/rooms/room-1/messages/e2ee')
      .set('Authorization', 'Bearer token')
      .send({
        e2ee: {
          ...validEnvelope,
          ciphertextHash: 'NOT_HEX'
        }
      });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('ciphertextHash must be a hex digest');
  });

  it('enforces sender device ownership on E2EE message endpoint', async () => {
    const app = buildApp();

    mockChatRoom.findById.mockResolvedValue({ _id: 'room-1', city: 'City', incrementMessageCount: jest.fn(), addMember: jest.fn() });
    mockUser.findById.mockImplementation(() => createQueryResult({ _id: 'user-1', onboardingStatus: 'completed', city: 'City', location: { coordinates: [0, 0] } }));
    mockDeviceKey.findOne.mockReturnValue(createLeanResult(null));

    const response = await request(app)
      .post('/api/chat/rooms/room-1/messages/e2ee')
      .set('Authorization', 'Bearer token')
      .send({ e2ee: validEnvelope });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/Sender device is not registered/);
  });

  it('enforces the shared 20 second cooldown on chat room messages', async () => {
    const app = buildApp();

    mockChatRoom.findById.mockResolvedValue({ _id: 'room-1', city: 'City', incrementMessageCount: jest.fn(), addMember: jest.fn(), members: [] });
    mockUser.findById
      .mockImplementationOnce(() => createQueryResult({ _id: 'user-1', onboardingStatus: 'completed', city: 'City', location: { coordinates: [0, 0] }, isAdmin: false }))
      .mockImplementationOnce(() => createQueryResult({ _id: 'user-1', onboardingStatus: 'completed', city: 'City', location: { coordinates: [0, 0] }, isAdmin: false }));
    mockConversationMessage.findOne.mockReturnValue(createSelectLeanOrSort({
      _id: 'recent-conversation-message',
      createdAt: new Date()
    }));

    const response = await request(app)
      .post('/api/chat/rooms/room-1/messages')
      .set('Authorization', 'Bearer token')
      .send({ content: 'hello room' });

    expect(response.status).toBe(429);
    expect(response.body.error).toBe('Chat cooldown active');
    expect(mockChatMessage).not.toHaveBeenCalled();
  });

  it('rejects replayed clientMessageId for same sender device', async () => {
    const app = buildApp();

    mockChatRoom.findById.mockResolvedValue({ _id: 'room-1', city: 'City', incrementMessageCount: jest.fn(), addMember: jest.fn() });
    mockUser.findById.mockImplementation(() => createQueryResult({ _id: 'user-1', onboardingStatus: 'completed', city: 'City', location: { coordinates: [0, 0] } }));
    mockDeviceKey.findOne.mockReturnValue(createLeanResult({ _id: 'device-record' }));
    mockChatMessage.findOne.mockReturnValue(createSelectLean({ _id: 'existing-message' }));

    const response = await request(app)
      .post('/api/chat/rooms/room-1/messages/e2ee')
      .set('Authorization', 'Bearer token')
      .send({ e2ee: validEnvelope });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/Duplicate clientMessageId/);
  });

  it('rejects zero-tolerance words in plaintext room messages', async () => {
    const app = buildApp();
    mockSiteContentFilter.findOne.mockReturnValue(createLeanResult({
      zeroToleranceWords: ['banned'],
      maturityCensoredWords: []
    }));
    mockChatRoom.findById.mockResolvedValue({ _id: 'room-1', city: 'City', incrementMessageCount: jest.fn(), addMember: jest.fn(), members: [] });
    mockUser.findById
      .mockImplementationOnce(() => createQueryResult({ _id: 'user-1', onboardingStatus: 'completed', city: 'City', location: { coordinates: [0, 0] }, isAdmin: false }))
      .mockImplementationOnce(() => createQueryResult({ _id: 'user-1', onboardingStatus: 'completed', city: 'City', location: { coordinates: [0, 0] }, isAdmin: false }));

    const response = await request(app)
      .post('/api/chat/rooms/room-1/messages')
      .set('Authorization', 'Bearer token')
      .send({ content: 'A banned word appears here' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('banned');
    expect(mockChatMessage).not.toHaveBeenCalled();
  });

  it('supports idempotent migration and tombstones plaintext', async () => {
    const app = buildApp();

    const legacyMessage = {
      _id: 'message-1',
      roomId: 'room-1',
      userId: 'user-1',
      content: 'legacy plaintext',
      encryptedContent: null,
      isEncrypted: false,
      e2ee: { enabled: false, migrationFlag: 'legacy' },
      save: jest.fn(async function save() { return this; }),
      populate: jest.fn(async function populate() { return this; }),
      toPublicMessage: jest.fn(function toPublicMessage() {
        return {
          _id: this._id,
          content: this.content,
          isE2EE: !!this?.e2ee?.enabled,
          migrationFlag: this?.e2ee?.migrationFlag,
          plaintextTombstoned: !!this?.e2ee?.plaintextTombstoned,
          migratedFromMessageFormat: this?.e2ee?.migratedFromMessageFormat || null
        };
      })
    };

    mockChatRoom.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'room-1' }) });
    mockDeviceKey.findOne.mockReturnValue(createLeanResult({ _id: 'device-record' }));

    mockChatMessage.findOne.mockImplementation((query) => {
      if (query && query._id === 'message-1' && query.roomId === 'room-1') {
        return Promise.resolve(legacyMessage);
      }
      return createSelectLean(null);
    });

    const first = await request(app)
      .post('/api/chat/rooms/room-1/messages/message-1/migrate-e2ee')
      .set('Authorization', 'Bearer token')
      .send({ e2ee: validEnvelope });

    expect(first.status).toBe(200);
    expect(first.body.idempotent).toBe(false);
    expect(legacyMessage.content).toBeNull();
    expect(legacyMessage.encryptedContent).toBeNull();
    expect(legacyMessage.e2ee.enabled).toBe(true);
    expect(legacyMessage.e2ee.migrationFlag).toBe('migrated');
    expect(legacyMessage.e2ee.plaintextTombstoned).toBe(true);
    expect(legacyMessage.e2ee.migratedFromMessageFormat).toBe('legacy-plaintext');

    const second = await request(app)
      .post('/api/chat/rooms/room-1/messages/message-1/migrate-e2ee')
      .set('Authorization', 'Bearer token')
      .send({ e2ee: validEnvelope });

    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
  });

  it('prevents migration by non-sender', async () => {
    const app = buildApp();

    mockChatRoom.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'room-1' }) });
    mockChatMessage.findOne.mockResolvedValue({
      _id: 'message-2',
      roomId: 'room-1',
      userId: 'different-user'
    });

    const response = await request(app)
      .post('/api/chat/rooms/room-1/messages/message-2/migrate-e2ee')
      .set('Authorization', 'Bearer token')
      .send({ e2ee: validEnvelope });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/original sender/);
  });

  it('rejects plaintext fields on migration endpoint', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/chat/rooms/room-1/messages/message-4/migrate-e2ee')
      .set('Authorization', 'Bearer token')
      .send({
        content: 'legacy plaintext should not be re-sent',
        e2ee: validEnvelope
      });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('Plaintext content is not allowed on migration endpoint');
  });

  it('enforces sender device ownership on migration endpoint', async () => {
    const app = buildApp();

    const legacyMessage = {
      _id: 'message-3',
      roomId: 'room-1',
      userId: 'user-1',
      content: 'legacy plaintext',
      encryptedContent: null,
      isEncrypted: false,
      e2ee: { enabled: false, migrationFlag: 'legacy' }
    };

    mockChatRoom.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'room-1' }) });
    mockDeviceKey.findOne.mockReturnValue(createLeanResult(null));
    mockChatMessage.findOne.mockImplementation((query) => {
      if (query && query._id === 'message-3' && query.roomId === 'room-1') {
        return Promise.resolve(legacyMessage);
      }
      return createSelectLean(null);
    });

    const response = await request(app)
      .post('/api/chat/rooms/room-1/messages/message-3/migrate-e2ee')
      .set('Authorization', 'Bearer token')
      .send({ e2ee: validEnvelope });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/Sender device is not registered/);
  });

  it('supports cursor pagination contract with bounded limit', async () => {
    const app = buildApp();

    mockChatRoom.findById.mockResolvedValue({ _id: 'room-1', name: 'Room', type: 'city', city: 'City' });
    mockChatMessage.getRoomMessagesByCursor.mockResolvedValue({
      messages: [{ _id: 'm1', createdAt: new Date('2024-01-01T00:00:00.000Z') }],
      hasMore: true,
      cursorSource: { _id: 'm1', createdAt: new Date('2024-01-01T00:00:00.000Z') },
      limit: 500
    });

    const rawCursor = Buffer.from('2024-01-01T01:00:00.000Z|m9').toString('base64url');

    const response = await request(app)
      .get(`/api/chat/rooms/room-1/messages?cursor=${encodeURIComponent(rawCursor)}&limit=999`)
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(mockChatMessage.getRoomMessagesByCursor).toHaveBeenCalledWith(
      'room-1',
      expect.objectContaining({ limit: 500 })
    );
    expect(response.body.pagination.mode).toBe('cursor');
    expect(response.body.pagination.limit).toBe(500);
    expect(response.body.pagination.hasMore).toBe(true);
    expect(typeof response.body.pagination.nextCursor).toBe('string');
  });

  it('accepts messageType and commandData for E2EE messages', async () => {
    const app = buildApp();

    const savedDoc = {
      save: jest.fn().mockResolvedValue(undefined),
      populate: jest.fn().mockResolvedValue(undefined),
      toPublicMessage: jest.fn().mockReturnValue({ _id: 'msg-1', messageType: 'command' })
    };

    mockChatRoom.findById.mockResolvedValue({ _id: 'room-1', city: 'City', incrementMessageCount: jest.fn(), addMember: jest.fn() });
    mockUser.findById.mockImplementation(() => createQueryResult({ _id: 'user-1', onboardingStatus: 'completed', city: 'City', location: { coordinates: [0, 0] } }));
    mockDeviceKey.findOne.mockReturnValue(createLeanResult({ _id: 'device-record' }));
    mockChatMessage.findOne.mockReturnValue(createSelectLeanOrSort(null));
    mockChatMessage.mockImplementation(() => savedDoc);

    const response = await request(app)
      .post('/api/chat/rooms/room-1/messages/e2ee')
      .set('Authorization', 'Bearer token')
      .send({
        e2ee: validEnvelope,
        messageType: 'command',
        commandData: {
          command: 'msg',
          targetUsername: 'alice',
          processedContent: '→ alice: hello'
        }
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it('rejects invalid audio metadata for voice-note messages', async () => {
    const app = buildApp();
    mockChatRoom.findById.mockResolvedValue({ _id: 'room-1', city: 'City', members: ['user-1'], incrementMessageCount: jest.fn(), addMember: jest.fn() });
    mockUser.findById.mockReturnValue(createUserDoc({ _id: 'user-1', city: 'City', location: { coordinates: [0, 0] }, onboardingStatus: 'completed' }));

    const response = await request(app)
      .post('/api/chat/rooms/room-1/messages')
      .set('Authorization', 'Bearer token')
      .send({
        mediaType: 'audio',
        audio: {
          storageKey: 'bad-key',
          url: '/api/chat/media/bad-key',
          durationMs: 5000,
          waveformBins: [0.1, 0.2],
          mimeType: 'audio/webm',
          sizeBytes: 1000
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/audio\.storageKey/);
  });

  it('blocks media retrieval for non-room-members', async () => {
    const app = buildApp();
    mockChatMessage.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          roomId: 'room-1',
          audio: {
            storageKey: '11111111-1111-1111-1111-111111111111.webm',
            mimeType: 'audio/webm'
          }
        })
      })
    });
    mockChatRoom.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'room-1', members: ['user-2'] })
      })
    });

    const response = await request(app)
      .get('/api/chat/media/11111111-1111-1111-1111-111111111111.webm')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/Not authorized/);
  });
});
