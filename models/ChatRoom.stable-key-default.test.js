const ChatRoom = require('./ChatRoom');

describe('ChatRoom stableKey defaults', () => {
  it('does not assign a null stableKey by default for non-canonical rooms', () => {
    const room = new ChatRoom({
      name: 'Community Room',
      type: 'topic',
      location: {
        type: 'Point',
        coordinates: [0, 0]
      },
      createdBy: null
    });

    const roomData = room.toObject();
    expect(room.stableKey).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(roomData, 'stableKey')).toBe(false);
  });
});
