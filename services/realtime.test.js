const realtime = require('./realtime');

describe('services/realtime', () => {
  beforeEach(() => {
    realtime.setRealtimeIo(null);
  });

  test('emitToUsers records replay events and replays by timestamp', () => {
    const emit = jest.fn();
    const io = {
      to: jest.fn(() => ({ emit }))
    };

    realtime.setRealtimeIo(io);
    realtime.emitToUsers(['user-1'], 'interaction', { postId: 'p1' });
    const events = realtime.getMissedEvents('user-1', 0);

    expect(io.to).toHaveBeenCalledWith('user:user-1');
    expect(emit).toHaveBeenCalledWith('interaction', { postId: 'p1' });
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('interaction');
  });

  test('emitToUsers does not record when record option is false', () => {
    const emit = jest.fn();
    const io = {
      to: jest.fn(() => ({ emit }))
    };

    realtime.setRealtimeIo(io);
    realtime.emitToUsers(['user-2'], 'friend_online', { userId: 'u2' }, { record: false });
    const events = realtime.getMissedEvents('user-2', 0);

    expect(emit).toHaveBeenCalledWith('friend_online', { userId: 'u2' });
    expect(events).toHaveLength(0);
  });
});
