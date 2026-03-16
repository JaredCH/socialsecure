const mongoose = require('mongoose');
const ChatRoom = require('./ChatRoom');
const { STATE_DISCOVERY_ROOMS, TOPIC_DISCOVERY_ROOMS } = require('../config/chatDiscoveryRooms');

describe('ChatRoom.ensureDefaultDiscoveryRooms', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('seeds properly named state, county, and topic discovery rooms', async () => {
    const bulkWriteSpy = jest.spyOn(ChatRoom, 'bulkWrite').mockResolvedValue({ ok: 1 });
    jest.spyOn(ChatRoom, 'reconcileDefaultDiscoveryRoomDuplicates').mockResolvedValue(undefined);

    await ChatRoom.ensureDefaultDiscoveryRooms({ force: true });

    expect(bulkWriteSpy).toHaveBeenCalledTimes(1);
    const [operations] = bulkWriteSpy.mock.calls[0];
    const expectedCount = STATE_DISCOVERY_ROOMS.length
      + STATE_DISCOVERY_ROOMS.reduce((total, state) => total + state.counties.length, 0)
      + TOPIC_DISCOVERY_ROOMS.length;
    expect(operations).toHaveLength(expectedCount);

    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: { stableKey: 'state:AL' },
          update: expect.objectContaining({
            $set: expect.objectContaining({
              name: 'Alabama',
              type: 'state'
            }),
            $setOnInsert: expect.objectContaining({
              name: 'Alabama',
              type: 'state'
            })
          })
        })
      }),
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: { stableKey: 'county:CA:los angeles county' },
          update: expect.objectContaining({
            $set: expect.objectContaining({
              name: 'Los Angeles County, California',
              type: 'county',
              county: 'Los Angeles County'
            }),
            $setOnInsert: expect.objectContaining({
              name: 'Los Angeles County, California',
              type: 'county',
              county: 'Los Angeles County'
            })
          })
        })
      }),
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: { stableKey: 'topic:ai' },
          update: expect.objectContaining({
            $set: expect.objectContaining({
              name: 'AI',
              type: 'topic'
            }),
            $setOnInsert: expect.objectContaining({
              name: 'AI',
              type: 'topic'
            })
          })
        })
      })
    ]));
  });

  it('merges duplicate seeded state and county rooms into the canonical stable-key room', async () => {
    const bulkWriteSpy = jest.spyOn(ChatRoom, 'bulkWrite').mockResolvedValue({ ok: 1 });
    jest.spyOn(ChatRoom, 'find').mockResolvedValue([
      {
        _id: 'state-canonical',
        type: 'state',
        state: 'TX',
        country: 'US',
        stableKey: 'state:TX',
        members: ['user-1'],
        messageCount: 2,
        lastActivity: new Date('2026-01-01T00:00:00.000Z')
      },
      {
        _id: 'state-legacy',
        type: 'state',
        state: 'TX',
        country: 'US',
        stableKey: null,
        members: ['user-2'],
        messageCount: 3,
        lastActivity: new Date('2026-01-02T00:00:00.000Z')
      },
      {
        _id: 'county-canonical',
        type: 'county',
        state: 'TX',
        country: 'US',
        county: 'Travis County',
        stableKey: 'county:TX:travis county',
        members: [],
        messageCount: 0,
        lastActivity: new Date('2026-01-01T00:00:00.000Z')
      },
      {
        _id: 'county-legacy',
        type: 'county',
        state: 'Texas',
        country: 'US',
        county: 'Travis County',
        stableKey: null,
        members: ['user-3'],
        messageCount: 1,
        lastActivity: new Date('2026-01-03T00:00:00.000Z')
      }
    ]);
    const updateOneSpy = jest.spyOn(ChatRoom, 'updateOne').mockResolvedValue({ acknowledged: true });
    const deleteManySpy = jest.spyOn(ChatRoom, 'deleteMany').mockResolvedValue({ acknowledged: true, deletedCount: 2 });

    const chatMessageModel = { updateMany: jest.fn().mockResolvedValue({ acknowledged: true }) };
    const roomKeyPackageModel = { updateMany: jest.fn().mockResolvedValue({ acknowledged: true }) };
    const notificationModel = { updateMany: jest.fn().mockResolvedValue({ acknowledged: true }) };
    jest.spyOn(mongoose, 'model').mockImplementation((modelName) => {
      if (modelName === 'ChatMessage') return chatMessageModel;
      if (modelName === 'RoomKeyPackage') return roomKeyPackageModel;
      if (modelName === 'Notification') return notificationModel;
      throw new Error(`Unexpected model lookup: ${modelName}`);
    });

    await ChatRoom.ensureDefaultDiscoveryRooms({ force: true });

    expect(bulkWriteSpy).toHaveBeenCalledTimes(1);
    expect(chatMessageModel.updateMany).toHaveBeenNthCalledWith(
      1,
      { roomId: { $in: ['state-legacy'] } },
      { $set: { roomId: 'state-canonical' } }
    );
    expect(chatMessageModel.updateMany).toHaveBeenNthCalledWith(
      2,
      { roomId: { $in: ['county-legacy'] } },
      { $set: { roomId: 'county-canonical' } }
    );
    expect(updateOneSpy).toHaveBeenCalledWith(
      { _id: 'state-canonical' },
      expect.objectContaining({
        $set: expect.objectContaining({
          name: 'Texas',
          members: ['user-1', 'user-2'],
          messageCount: 5
        })
      })
    );
    expect(updateOneSpy).toHaveBeenCalledWith(
      { _id: 'county-canonical' },
      expect.objectContaining({
        $set: expect.objectContaining({
          name: 'Travis County, Texas',
          members: ['user-3'],
          messageCount: 1
        })
      })
    );
    expect(deleteManySpy).toHaveBeenNthCalledWith(1, { _id: { $in: ['state-legacy'] } });
    expect(deleteManySpy).toHaveBeenNthCalledWith(2, { _id: { $in: ['county-legacy'] } });
  });
});
