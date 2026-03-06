const ChatRoom = require('./ChatRoom');

describe('ChatRoom.syncUserLocationRooms zip-first behavior', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses zipCode as the primary city-room key when present', async () => {
    const zipRoom = { members: [], save: jest.fn().mockResolvedValue(true) };
    const stateRoom = { members: [], save: jest.fn().mockResolvedValue(true) };

    const findOrCreateSpy = jest.spyOn(ChatRoom, 'findOrCreateByLocation')
      .mockResolvedValueOnce({ room: zipRoom, created: true })
      .mockResolvedValueOnce({ room: stateRoom, created: false });

    const result = await ChatRoom.syncUserLocationRooms({
      _id: 'user-1',
      location: { coordinates: [-97.7431, 30.2672] },
      zipCode: '78701',
      county: 'Travis',
      city: 'Austin',
      state: 'TX',
      country: 'US'
    });

    expect(findOrCreateSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'city',
      zipCode: '78701',
      county: 'Travis'
    }));
    expect(result.created).toBe(1);
  });

  it('falls back to city/state/country behavior for legacy users without zipCode', async () => {
    const cityRoom = { members: [], save: jest.fn().mockResolvedValue(true) };
    const stateRoom = { members: [], save: jest.fn().mockResolvedValue(true) };

    const findOrCreateSpy = jest.spyOn(ChatRoom, 'findOrCreateByLocation')
      .mockResolvedValueOnce({ room: cityRoom, created: false })
      .mockResolvedValueOnce({ room: stateRoom, created: false });

    await ChatRoom.syncUserLocationRooms({
      _id: 'user-legacy',
      location: { coordinates: [-97.7431, 30.2672] },
      city: 'Austin',
      state: 'TX',
      country: 'US'
    });

    expect(findOrCreateSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'city',
      city: 'Austin',
      state: 'TX',
      country: 'US'
    }));
    expect(findOrCreateSpy.mock.calls[0][0].zipCode).toBeUndefined();
  });
});
