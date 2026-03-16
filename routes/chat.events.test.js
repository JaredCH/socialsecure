const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

jest.mock('../models/User', () => ({
  findById: jest.fn()
}));

jest.mock('../models/ChatRoom', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  ensureDefaultStateRooms: jest.fn(),
  ensureDefaultDiscoveryRooms: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn()
}));

jest.mock('../models/EventSchedule', () => ({
  find: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock('../models/ChatMessage', () => {
  const fn = jest.fn();
  fn.getRoomMessages = jest.fn();
  fn.getRoomMessagesByCursor = jest.fn();
  fn.findOne = jest.fn();
  return fn;
});

jest.mock('../models/DeviceKey', () => ({ findOne: jest.fn() }));
jest.mock('../models/SecurityEvent', () => ({ create: jest.fn() }));
jest.mock('../models/BlockList', () => ({ find: jest.fn(), exists: jest.fn() }));
jest.mock('../models/RoomKeyPackage', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../services/notifications', () => ({ createNotification: jest.fn() }));
jest.mock('../services/eventRoomLifecycle', () => ({ reconcileEventRooms: jest.fn().mockResolvedValue({ created: 0, updated: 0, archived: 0 }) }));

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const EventSchedule = require('../models/EventSchedule');
const router = require('./chat');

const buildChain = (value) => {
  const chain = {
    select: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lean: jest.fn().mockResolvedValue(value)
  };
  return chain;
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', router);
  return app;
};

describe('Chat event room discovery routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secret, cb) => cb(null, { userId: 'user-1' }));
    ChatRoom.ensureDefaultStateRooms.mockResolvedValue(undefined);
    ChatRoom.ensureDefaultDiscoveryRooms.mockResolvedValue(undefined);
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user-1', onboardingStatus: 'completed' })
    });
  });

  it('returns discoverable event rooms', async () => {
    ChatRoom.find.mockReturnValue(
      buildChain([
        {
          _id: 'room-1',
          name: 'Fight Night',
          type: 'event',
          eventRef: 'event-1',
          members: ['a', 'b'],
          messageCount: 9,
          lastActivity: new Date('2026-03-01T00:00:00.000Z')
        }
      ])
    );
    EventSchedule.find.mockReturnValue(
      buildChain([
        {
          _id: 'event-1',
          eventType: 'live_sport',
          leagueOrSeries: 'UFC',
          title: 'UFC 999',
          startAt: new Date('2026-03-08T02:00:00.000Z'),
          endAt: null,
          status: 'scheduled',
          tags: ['mma']
        }
      ])
    );

    const app = buildApp();
    const response = await request(app)
      .get('/api/chat/rooms/discover?query=ufc&tags=mma&page=1')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rooms).toHaveLength(1);
    expect(response.body.rooms[0]).toMatchObject({
      _id: 'room-1',
      name: 'Fight Night',
      memberCount: 2
    });
    expect(response.body.rooms[0].event).toMatchObject({
      eventType: 'live_sport',
      title: 'UFC 999'
    });
  });

  it('returns upcoming events with linked rooms', async () => {
    EventSchedule.find.mockReturnValue(
      buildChain([
        {
          _id: 'event-upcoming',
          eventType: 'tv_episode',
          leagueOrSeries: 'The Show',
          title: 'S2E5',
          season: 2,
          episode: 5,
          startAt: new Date(Date.now() + 3600_000),
          endAt: null,
          status: 'scheduled',
          tags: ['tv']
        }
      ])
    );
    ChatRoom.find.mockReturnValue(
      buildChain([
        {
          _id: 'room-upcoming',
          name: 'Watch Party',
          eventRef: 'event-upcoming',
          members: ['x'],
          messageCount: 0
        }
      ])
    );

    const app = buildApp();
    const response = await request(app)
      .get('/api/chat/rooms/events/upcoming?days=3')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0].schedule).toMatchObject({
      _id: 'event-upcoming',
      eventType: 'tv_episode'
    });
    expect(response.body.events[0].room).toMatchObject({
      _id: 'room-upcoming'
    });
  });

  it('requires explicit call for all rooms endpoint and returns paginated payload', async () => {
    const roomQueryChain = buildChain([
      {
        _id: 'room-any',
        name: 'General Room',
        type: 'city',
        members: ['m1', 'm2', 'm3'],
        messageCount: 10
      }
    ]);
    ChatRoom.find.mockReturnValue(roomQueryChain);
    ChatRoom.countDocuments.mockResolvedValue(1);

    const app = buildApp();
    const response = await request(app)
      .get('/api/chat/rooms/all?page=1&limit=10')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rooms).toHaveLength(1);
    expect(ChatRoom.ensureDefaultDiscoveryRooms).toHaveBeenCalledTimes(1);
    expect(ChatRoom.find).toHaveBeenCalledWith({
      $or: [
        { type: 'state' },
        { type: 'county' },
        { type: 'topic' },
        { type: 'city', zipCode: { $exists: true, $nin: [null, ''] } }
      ]
    });
    expect(roomQueryChain.sort).toHaveBeenCalledWith({ type: -1, lastActivity: -1, createdAt: -1 });
    expect(response.body.rooms[0]).toMatchObject({
      _id: 'room-any',
      memberCount: 3
    });
    expect(response.body.hasMore).toBe(false);
  });
});
