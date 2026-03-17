const mongoose = require('mongoose');
const ChatRoom = require('./ChatRoom');
const { STATE_DISCOVERY_ROOMS, TOPIC_DISCOVERY_ROOMS } = require('../config/chatDiscoveryRooms');

describe('ChatRoom.ensureDefaultDiscoveryRooms', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('seeds properly named state, city, and topic discovery rooms', async () => {
    const bulkWriteSpy = jest.spyOn(ChatRoom, 'bulkWrite').mockResolvedValue({ ok: 1 });
    jest.spyOn(ChatRoom, 'reconcileDefaultDiscoveryRoomDuplicates').mockResolvedValue(undefined);

    await ChatRoom.ensureDefaultDiscoveryRooms({ force: true });

    expect(bulkWriteSpy).toHaveBeenCalledTimes(1);
    const [operations] = bulkWriteSpy.mock.calls[0];
    const expectedCount = STATE_DISCOVERY_ROOMS.length
      + STATE_DISCOVERY_ROOMS.reduce((total, state) => total + state.cities.length, 0)
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
          filter: { stableKey: 'city:CA:los angeles' },
          update: expect.objectContaining({
            $set: expect.objectContaining({
              name: 'Los Angeles, California',
              type: 'city',
              city: 'Los Angeles'
            }),
            $setOnInsert: expect.objectContaining({
              name: 'Los Angeles, California',
              type: 'city',
              city: 'Los Angeles'
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

  it('merges duplicate seeded state and city rooms into the canonical stable-key room', async () => {
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
        _id: 'city-canonical',
        type: 'city',
        city: 'Houston',
        state: 'TX',
        country: 'US',
        stableKey: 'city:TX:houston',
        members: [],
        messageCount: 0,
        lastActivity: new Date('2026-01-01T00:00:00.000Z')
      },
      {
        _id: 'city-legacy',
        type: 'city',
        city: 'Houston',
        state: 'Texas',
        country: 'US',
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
      { roomId: { $in: ['city-legacy'] } },
      { $set: { roomId: 'city-canonical' } }
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
      { _id: 'city-canonical' },
      expect.objectContaining({
        $set: expect.objectContaining({
          name: 'Houston, Texas',
          members: ['user-3'],
          messageCount: 1
        })
      })
    );
    expect(deleteManySpy).toHaveBeenNthCalledWith(1, { _id: { $in: ['state-legacy'] } });
    expect(deleteManySpy).toHaveBeenNthCalledWith(2, { _id: { $in: ['city-legacy'] } });
  });

  it('continues seeding when bulk upserts hit duplicate-key races', async () => {
    const duplicateError = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000
    });
    const bulkWriteSpy = jest.spyOn(ChatRoom, 'bulkWrite').mockRejectedValue(duplicateError);
    const reconcileSpy = jest.spyOn(ChatRoom, 'reconcileDefaultDiscoveryRoomDuplicates').mockResolvedValue(undefined);

    await expect(ChatRoom.ensureDefaultDiscoveryRooms({ force: true })).resolves.toBeUndefined();

    expect(bulkWriteSpy).toHaveBeenCalledTimes(1);
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
  });

  it('continues seeding when bulkWrite reports only duplicate-key write errors', async () => {
    const duplicateWriteErrors = Object.assign(new Error('Bulk write duplicate entries'), {
      writeErrors: [{ code: 11000 }, { code: 11000 }]
    });
    jest.spyOn(ChatRoom, 'bulkWrite').mockRejectedValue(duplicateWriteErrors);
    const reconcileSpy = jest.spyOn(ChatRoom, 'reconcileDefaultDiscoveryRoomDuplicates').mockResolvedValue(undefined);

    await expect(ChatRoom.ensureDefaultDiscoveryRooms({ force: true })).resolves.toBeUndefined();

    expect(reconcileSpy).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-duplicate bulk write errors', async () => {
    const bulkError = Object.assign(new Error('Validation failed'), { code: 121 });
    jest.spyOn(ChatRoom, 'bulkWrite').mockRejectedValue(bulkError);
    const reconcileSpy = jest.spyOn(ChatRoom, 'reconcileDefaultDiscoveryRoomDuplicates').mockResolvedValue(undefined);

    await expect(ChatRoom.ensureDefaultDiscoveryRooms({ force: true })).rejects.toThrow('Validation failed');
    expect(reconcileSpy).not.toHaveBeenCalled();
  });
});
