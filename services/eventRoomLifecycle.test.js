jest.mock('../models/ChatRoom', () => ({
  countDocuments: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn()
}));

jest.mock('../models/EventSchedule', () => ({
  find: jest.fn()
}));

jest.mock('./eventScheduleIngestion', () => ({
  buildDedupeKey: jest.fn(({ eventType, sourceRef, startAt }) => `${eventType}:${sourceRef}:${new Date(startAt).toISOString()}`)
}));

const ChatRoom = require('../models/ChatRoom');
const EventSchedule = require('../models/EventSchedule');
const { reconcileEventRooms } = require('./eventRoomLifecycle');

describe('event room lifecycle', () => {
  const buildLean = (value) => ({
    lean: jest.fn().mockResolvedValue(value)
  });
  const buildSelectLean = (value) => ({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value)
    })
  });

  beforeEach(() => {
    jest.clearAllMocks();
    ChatRoom.countDocuments.mockResolvedValue(0);
    ChatRoom.findOneAndUpdate.mockResolvedValue({ _id: 'room-1' });
    ChatRoom.updateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  it('creates discoverable room during visibility window', async () => {
    const now = new Date('2026-03-10T12:00:00.000Z');
    EventSchedule.find.mockReturnValue(buildLean([
      {
        _id: 'event-1',
        eventType: 'live_sport',
        sourceRef: 'espn:event-1',
        title: 'Fight Night',
        startAt: new Date('2026-03-11T12:00:00.000Z'),
        status: 'scheduled'
      }
    ]));
    ChatRoom.findOne.mockReturnValue(buildSelectLean(null));

    const result = await reconcileEventRooms({ now });

    expect(result.created).toBe(1);
    expect(ChatRoom.findOneAndUpdate).toHaveBeenCalled();
    const updateArg = ChatRoom.findOneAndUpdate.mock.calls[0][1];
    expect(updateArg.$set.discoverable).toBe(true);
    expect(updateArg.$set.autoLifecycle).toBe(true);
  });

  it('archives room when event is canceled', async () => {
    const now = new Date('2026-03-10T12:00:00.000Z');
    EventSchedule.find.mockReturnValue(buildLean([
      {
        _id: 'event-2',
        eventType: 'tv_episode',
        sourceRef: 'tv:event-2',
        title: 'Series Finale',
        startAt: new Date('2026-03-08T12:00:00.000Z'),
        status: 'canceled'
      }
    ]));
    ChatRoom.findOne.mockReturnValue(buildSelectLean({ _id: 'room-existing' }));

    const result = await reconcileEventRooms({ now });

    expect(result.archived).toBe(1);
    const updateArg = ChatRoom.findOneAndUpdate.mock.calls[0][1];
    expect(updateArg.$set.discoverable).toBe(false);
    expect(updateArg.$set.archivedAt).toEqual(now);
  });
});
