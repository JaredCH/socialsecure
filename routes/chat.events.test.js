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
  aggregate: jest.fn(),
  countDocuments: jest.fn(),
  ensureDefaultStateRooms: jest.fn(),
  ensureDefaultDiscoveryRooms: jest.fn(),
  syncUserLocationRooms: jest.fn(),
  findOrCreateByLocation: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn()
}));

jest.mock('../models/ChatConversation', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findById: jest.fn()
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
const ChatConversation = require('../models/ChatConversation');
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
    ChatRoom.syncUserLocationRooms.mockResolvedValue({ rooms: [], created: 0 });
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
    ChatRoom.aggregate.mockResolvedValue([
      {
        _id: 'room-any',
        name: 'General Room',
        type: 'city',
        members: ['m1', 'm2', 'm3'],
        messageCount: 10
      }
    ]);
    ChatRoom.countDocuments.mockResolvedValue(1);

    const app = buildApp();
    const response = await request(app)
      .get('/api/chat/rooms/all?page=1&limit=10')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rooms).toHaveLength(1);
    expect(ChatRoom.ensureDefaultDiscoveryRooms).toHaveBeenCalledTimes(1);
    expect(ChatRoom.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          archivedAt: null,
          discoverable: { $ne: false },
          $or: [
            { type: 'state' },
            { type: 'topic' },
            { parentRoomId: { $ne: null } },
            { type: 'city', zipCode: { $exists: true, $nin: [null, ''] } }
          ]
        }
      },
      {
        $addFields: {
          discoveryParentPriority: {
            $cond: [{ $ifNull: ['$parentRoomId', false] }, 1, 0]
          },
          discoveryTypePriority: {
            $switch: {
              branches: [
                { case: { $eq: ['$discoveryGroup', 'states'] }, then: 0 },
                { case: { $eq: ['$discoveryGroup', 'topics'] }, then: 1 },
                { case: { $eq: ['$type', 'city'] }, then: 2 }
              ],
              default: 3
            }
          }
        }
      },
      { $sort: { discoveryTypePriority: 1, discoveryParentPriority: 1, sortOrder: 1, name: 1, lastActivity: -1, createdAt: -1 } },
      { $skip: 0 },
      { $limit: 10 },
      {
        $project: {
          _id: 1,
          name: 1,
          type: 1,
          createdBy: 1,
          city: 1,
          state: 1,
          country: 1,
          county: 1,
          zipCode: 1,
          discoverable: 1,
          eventRef: 1,
          stableKey: 1,
          autoLifecycle: 1,
          discoveryGroup: 1,
          parentRoomId: 1,
          sortOrder: 1,
          defaultLanding: 1,
          archivedAt: 1,
          members: 1,
          messageCount: 1,
          lastActivity: 1
        }
      }
    ]);
    expect(response.body.rooms[0]).toMatchObject({
      _id: 'room-any',
      memberCount: 3
    });
    expect(response.body.hasMore).toBe(false);
  });

  it('still returns all rooms when discovery seeding fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    ChatRoom.ensureDefaultDiscoveryRooms.mockRejectedValueOnce(new Error('seed failure'));
    ChatRoom.aggregate.mockResolvedValue([
      {
        _id: 'room-any',
        name: 'General Room',
        type: 'city',
        members: ['m1']
      }
    ]);
    ChatRoom.countDocuments.mockResolvedValue(1);

    const app = buildApp();
    const response = await request(app)
      .get('/api/chat/rooms/all?page=1&limit=10')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.rooms).toHaveLength(1);
    expect(ChatRoom.aggregate).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it('returns discovery room types ahead of city rooms in the all rooms payload', async () => {
    ChatRoom.aggregate.mockResolvedValue([
      { _id: 'state-1', name: 'Alabama', type: 'state', members: [] },
      { _id: 'county-1', name: 'Mobile County, Alabama', type: 'county', members: [] },
      { _id: 'topic-1', name: 'AI', type: 'topic', members: [] },
      { _id: 'city-1', name: 'Boston, Massachusetts', type: 'city', members: [] }
    ]);
    ChatRoom.countDocuments.mockResolvedValue(4);

    const app = buildApp();
    const response = await request(app)
      .get('/api/chat/rooms/all?page=1&limit=10')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.rooms.map((room) => room.type)).toEqual(['state', 'county', 'topic', 'city']);
  });

  it('re-seeds discovery rooms when the first all-rooms query is empty', async () => {
    ChatRoom.aggregate
      .mockResolvedValueOnce([{ _id: 'state-1', name: 'Alabama', type: 'state', members: [] }]);
    ChatRoom.countDocuments
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    const app = buildApp();
    const response = await request(app)
      .get('/api/chat/rooms/all?page=1&limit=10')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(ChatRoom.ensureDefaultDiscoveryRooms).toHaveBeenNthCalledWith(1);
    expect(ChatRoom.ensureDefaultDiscoveryRooms).toHaveBeenNthCalledWith(2, { force: true });
    expect(response.body.rooms).toHaveLength(1);
  });

  it('returns relational quick-access rooms for the authenticated user', async () => {
    const onboardingSelect = jest.fn().mockResolvedValue({ _id: 'user-1', onboardingStatus: 'completed' });
    const locationSelect = jest.fn().mockResolvedValue({
      _id: 'user-1',
      city: 'Boston',
      state: 'MA',
      country: 'US',
      county: 'Suffolk County',
      zipCode: '02115',
      location: { type: 'Point', coordinates: [-71.0921, 42.3389] }
    });
    User.findById
      .mockReturnValueOnce({ select: onboardingSelect })
      .mockReturnValueOnce({ select: locationSelect });
    ChatRoom.findOrCreateByLocation
      .mockResolvedValueOnce({
        room: {
          _id: 'state-ma',
          name: 'Massachusetts',
          type: 'state',
          state: 'MA',
          country: 'US',
          members: ['user-1'],
          messageCount: 3,
          lastActivity: new Date('2026-03-01T00:00:00.000Z')
        }
      })
      .mockResolvedValueOnce({
        room: {
          _id: 'county-suffolk',
          name: 'Suffolk County, Massachusetts',
          type: 'county',
          state: 'MA',
          country: 'US',
          county: 'Suffolk County',
          members: ['user-1'],
          messageCount: 2,
          lastActivity: new Date('2026-03-01T00:00:00.000Z')
        }
      });
    ChatConversation.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'zip-02115',
        type: 'zip-room',
        zipCode: '02115',
        title: 'Zip 02115',
        participants: []
      })
    });
    ChatRoom.aggregate.mockResolvedValueOnce([
      {
        _id: 'city-1',
        name: 'Cambridge (ZIP 02139)',
        type: 'city',
        city: 'Cambridge',
        state: 'MA',
        zipCode: '02139',
        members: [],
        messageCount: 7,
        lastActivity: new Date('2026-03-01T00:00:00.000Z'),
        distanceMeters: 4023.35
      }
    ]);

    const app = buildApp();
    const response = await request(app)
      .get('/api/chat/rooms/quick-access')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(ChatRoom.syncUserLocationRooms).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'user-1',
      zipCode: '02115',
      county: 'Suffolk County'
    }));
    expect(response.body.rooms.state).toMatchObject({
      _id: 'state-ma',
      name: 'Massachusetts',
      isMember: true
    });
    expect(response.body.rooms.county).toMatchObject({
      _id: 'county-suffolk',
      name: 'Suffolk County, Massachusetts',
      isMember: true
    });
    expect(response.body.rooms.zip).toBeNull();
    expect(response.body.rooms.cities).toEqual([
      expect.objectContaining({
        _id: 'city-1',
        name: 'Cambridge (ZIP 02139)',
        distanceMiles: 2.5
      })
    ]);
  });

  it('keeps quick-access responses working when background location sync fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onboardingSelect = jest.fn().mockResolvedValue({ _id: 'user-1', onboardingStatus: 'completed' });
    const locationSelect = jest.fn().mockResolvedValue({
      _id: 'user-1',
      city: 'Boston',
      state: 'MA',
      country: 'US',
      county: 'Suffolk County',
      zipCode: '02115',
      location: { type: 'Point', coordinates: [-71.0921, 42.3389] }
    });
    User.findById
      .mockReturnValueOnce({ select: onboardingSelect })
      .mockReturnValueOnce({ select: locationSelect });
    ChatRoom.syncUserLocationRooms.mockRejectedValueOnce(new Error('membership failure'));
    ChatRoom.findOrCreateByLocation
      .mockResolvedValueOnce({ room: { _id: 'state-ma', name: 'Massachusetts', type: 'state', members: ['user-1'] } })
      .mockResolvedValueOnce({ room: { _id: 'county-suffolk', name: 'Suffolk County, Massachusetts', type: 'county', members: ['user-1'] } });
    ChatConversation.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'zip-02115',
        type: 'zip-room',
        zipCode: '02115',
        title: 'Zip 02115',
        participants: []
      })
    });
    ChatRoom.aggregate.mockResolvedValue([]);

    const app = buildApp();
    const response = await request(app)
      .get('/api/chat/rooms/quick-access')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.rooms).toMatchObject({
      state: { _id: 'state-ma' },
      county: { _id: 'county-suffolk' },
      zip: null
    });
    consoleErrorSpy.mockRestore();
  });

  it('handles quick-access users with unsupported location coordinates without 500 errors', async () => {
    const onboardingSelect = jest.fn().mockResolvedValue({ _id: 'user-1', onboardingStatus: 'completed' });
    const locationSelect = jest.fn().mockResolvedValue({
      _id: 'user-1',
      city: 'Boston',
      state: 'MA',
      country: 'US',
      county: 'Suffolk County',
      zipCode: '02115',
      location: { rejected: true, message: 'UNSUPPORTED_OS' }
    });
    User.findById
      .mockReturnValueOnce({ select: onboardingSelect })
      .mockReturnValueOnce({ select: locationSelect });
    ChatRoom.findOrCreateByLocation
      .mockResolvedValueOnce({
        room: {
          _id: 'state-ma',
          name: 'Massachusetts',
          type: 'state',
          state: 'MA',
          country: 'US',
          members: ['user-1']
        }
      })
      .mockResolvedValueOnce({
        room: {
          _id: 'county-suffolk',
          name: 'Suffolk County, Massachusetts',
          type: 'county',
          state: 'MA',
          country: 'US',
          county: 'Suffolk County',
          members: ['user-1']
        }
      });
    ChatConversation.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'zip-02115',
        type: 'zip-room',
        zipCode: '02115',
        title: 'Zip 02115',
        participants: []
      })
    });

    const app = buildApp();
    const response = await request(app)
      .get('/api/chat/rooms/quick-access')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(ChatRoom.syncUserLocationRooms).not.toHaveBeenCalled();
    expect(ChatRoom.aggregate).not.toHaveBeenCalled();
    expect(ChatRoom.findOrCreateByLocation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'state',
      coordinates: undefined
    }));
  });

  it('treats out-of-range coordinates as unavailable for quick-access without 500 errors', async () => {
    const onboardingSelect = jest.fn().mockResolvedValue({ _id: 'user-1', onboardingStatus: 'completed' });
    const locationSelect = jest.fn().mockResolvedValue({
      _id: 'user-1',
      city: 'Boston',
      state: 'MA',
      country: 'US',
      county: 'Suffolk County',
      zipCode: '02115',
      location: { coordinates: [220, 97] }
    });
    User.findById
      .mockReturnValueOnce({ select: onboardingSelect })
      .mockReturnValueOnce({ select: locationSelect });
    ChatRoom.findOrCreateByLocation
      .mockResolvedValueOnce({
        room: {
          _id: 'state-ma',
          name: 'Massachusetts',
          type: 'state',
          state: 'MA',
          country: 'US',
          members: ['user-1']
        }
      })
      .mockResolvedValueOnce({
        room: {
          _id: 'county-suffolk',
          name: 'Suffolk County, Massachusetts',
          type: 'county',
          state: 'MA',
          country: 'US',
          county: 'Suffolk County',
          members: ['user-1']
        }
      });
    ChatConversation.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'zip-02115',
        type: 'zip-room',
        zipCode: '02115',
        title: 'Zip 02115',
        participants: []
      })
    });

    const app = buildApp();
    const response = await request(app)
      .get('/api/chat/rooms/quick-access')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(ChatRoom.syncUserLocationRooms).not.toHaveBeenCalled();
    expect(ChatRoom.aggregate).not.toHaveBeenCalled();
    expect(ChatRoom.findOrCreateByLocation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'state',
      coordinates: undefined
    }));
  });

  it('returns a no-op success for sync-location when coordinates are unavailable', async () => {
    const onboardingSelect = jest.fn().mockResolvedValue({ _id: 'user-1', onboardingStatus: 'completed' });
    const syncUserSelect = jest.fn(function select() {
      return this;
    });
    const syncUserLean = jest.fn().mockResolvedValue({
      _id: 'user-1',
      location: { rejected: true, message: 'UNSUPPORTED_OS' }
    });
    User.findById
      .mockReturnValueOnce({ select: onboardingSelect })
      .mockReturnValueOnce({
        select: syncUserSelect,
        lean: syncUserLean
      });
    ChatRoom.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });

    const app = buildApp();
    const response = await request(app)
      .post('/api/chat/rooms/sync-location')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Location unavailable. Skipped location room sync.',
      createdRooms: [],
      allRooms: []
    });
    expect(ChatRoom.ensureDefaultStateRooms).not.toHaveBeenCalled();
    expect(ChatRoom.syncUserLocationRooms).not.toHaveBeenCalled();
  });

  it('uses lean user loading for sync-location to avoid cast-style failures on legacy location payloads', async () => {
    const onboardingSelect = jest.fn().mockResolvedValue({ _id: 'user-1', onboardingStatus: 'completed' });
    const syncUserQuery = {
      select: jest.fn(function select() {
        return this;
      }),
      lean: jest.fn().mockResolvedValue({
        _id: 'user-1',
        city: 'Boston',
        state: 'MA',
        country: 'US',
        county: 'Suffolk County',
        zipCode: '02115',
        location: { rejected: true, message: 'UNSUPPORTED_OS' }
      }),
      // If route code accidentally awaits the raw query instead of using lean(), this should fail.
      then: (resolve, reject) => reject(new Error('Cast to embedded failed for value "{ rejected: true }" at path "location"'))
    };
    User.findById
      .mockReturnValueOnce({ select: onboardingSelect })
      .mockReturnValueOnce(syncUserQuery);
    ChatRoom.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });

    const app = buildApp();
    const response = await request(app)
      .post('/api/chat/rooms/sync-location')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(syncUserQuery.select).toHaveBeenCalledWith('_id city state country county zipCode location');
    expect(syncUserQuery.lean).toHaveBeenCalledTimes(1);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Location unavailable. Skipped location room sync.',
      createdRooms: [],
      allRooms: []
    });
  });

  it('returns existing rooms when sync-location membership updates fail', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onboardingSelect = jest.fn().mockResolvedValue({ _id: 'user-1', onboardingStatus: 'completed' });
    const syncUserSelect = jest.fn(function select() {
      return this;
    });
    const syncUserLean = jest.fn().mockResolvedValue({
      _id: 'user-1',
      city: 'Boston',
      state: 'MA',
      country: 'US',
      county: 'Suffolk County',
      zipCode: '02115',
      location: { type: 'Point', coordinates: [-71.0921, 42.3389] }
    });
    User.findById
      .mockReturnValueOnce({ select: onboardingSelect })
      .mockReturnValueOnce({
        select: syncUserSelect,
        lean: syncUserLean
      });
    ChatRoom.syncUserLocationRooms.mockRejectedValueOnce(new Error('membership failure'));
    ChatRoom.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'room-1', name: 'Boston (ZIP 02115)', type: 'city', zipCode: '02115', memberCount: 1 }
        ])
      })
    });

    const app = buildApp();
    const response = await request(app)
      .post('/api/chat/rooms/sync-location')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Location rooms synced. 0 new room(s) created.',
      createdRooms: [],
      allRooms: [{ _id: 'room-1', name: 'Boston (ZIP 02115)', type: 'city', zipCode: '02115', memberCount: 1 }]
    });
    consoleErrorSpy.mockRestore();
  });
});
