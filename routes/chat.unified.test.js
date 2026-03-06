const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockChatRoom = {};
const mockChatMessage = {};
const mockDeviceKey = {};
const mockSecurityEvent = {};
const mockBlockList = { findOne: jest.fn() };
const mockRoomKeyPackage = {};
const mockUser = { findById: jest.fn(), find: jest.fn() };
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
  create: jest.fn()
};

jest.mock('../models/ChatRoom', () => mockChatRoom);
jest.mock('../models/ChatMessage', () => mockChatMessage);
jest.mock('../models/DeviceKey', () => mockDeviceKey);
jest.mock('../models/SecurityEvent', () => mockSecurityEvent);
jest.mock('../models/BlockList', () => mockBlockList);
jest.mock('../models/RoomKeyPackage', () => mockRoomKeyPackage);
jest.mock('../models/User', () => mockUser);
jest.mock('../models/ChatConversation', () => mockChatConversation);
jest.mock('../models/ConversationMessage', () => mockConversationMessage);
jest.mock('../services/notifications', () => ({ createNotification: jest.fn() }));

const jwt = require('jsonwebtoken');
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
  });
});
