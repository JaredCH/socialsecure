jest.mock('../models/ChatRoom', () => ({
  ensureDefaultStateRooms: jest.fn(),
  deleteMany: jest.fn()
}));

const ChatRoom = require('../models/ChatRoom');
const { reconcileEventRooms } = require('./eventRoomLifecycle');

describe('event room lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ChatRoom.ensureDefaultStateRooms.mockResolvedValue(undefined);
    ChatRoom.deleteMany.mockResolvedValue({ deletedCount: 3 });
  });

  it('removes event rooms and reports archived count', async () => {
    const now = new Date('2026-03-10T12:00:00.000Z');
    const result = await reconcileEventRooms({ now });

    expect(ChatRoom.ensureDefaultStateRooms).toHaveBeenCalledTimes(1);
    expect(ChatRoom.deleteMany).toHaveBeenCalledWith({ type: 'event' });
    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      archived: 3,
      cap: 0,
      removedAt: now
    });
  });
});
