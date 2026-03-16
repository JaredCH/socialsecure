const ChatRoom = require('./ChatRoom');

describe('ChatRoom event lifecycle schema fields', () => {
  it('stores event lifecycle metadata used by scheduler', () => {
    const room = new ChatRoom({
      name: 'Event Room',
      type: 'event',
      location: { type: 'Point', coordinates: [0, 0] },
      stableKey: 'event-room::live_sport:abc:2026-03-10T12:00:00.000Z',
      autoLifecycle: true,
      discoverable: false,
      visibilityWindow: {
        startAt: new Date('2026-03-08T12:00:00.000Z'),
        endAt: new Date('2026-03-12T12:00:00.000Z')
      },
      archivedAt: new Date('2026-03-13T12:00:00.000Z')
    });

    expect(room.stableKey).toContain('event-room::');
    expect(room.autoLifecycle).toBe(true);
    expect(room.discoverable).toBe(false);
    expect(room.visibilityWindow.endAt).toEqual(new Date('2026-03-12T12:00:00.000Z'));
    expect(room.archivedAt).toEqual(new Date('2026-03-13T12:00:00.000Z'));
  });
});
