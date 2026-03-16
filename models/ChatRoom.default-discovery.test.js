const ChatRoom = require('./ChatRoom');
const { STATE_DISCOVERY_ROOMS, TOPIC_DISCOVERY_ROOMS } = require('../config/chatDiscoveryRooms');

describe('ChatRoom.ensureDefaultDiscoveryRooms', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('seeds properly named state, county, and topic discovery rooms', async () => {
    const bulkWriteSpy = jest.spyOn(ChatRoom, 'bulkWrite').mockResolvedValue({ ok: 1 });

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
            $setOnInsert: expect.objectContaining({
              name: 'AI',
              type: 'topic'
            })
          })
        })
      })
    ]));
  });
});
