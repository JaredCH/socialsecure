const ChatRoom = require('./ChatRoom');

describe('ChatRoom.syncUserLocationRooms zip-first behavior', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses zipCode as the primary city-room key when present', async () => {
    const zipRoom = { members: [], save: jest.fn().mockResolvedValue(true) };
    const countyRoom = { members: [], save: jest.fn().mockResolvedValue(true) };
    const stateRoom = { members: [], save: jest.fn().mockResolvedValue(true) };

    const findOrCreateSpy = jest.spyOn(ChatRoom, 'findOrCreateByLocation')
      .mockResolvedValueOnce({ room: zipRoom, created: true })
      .mockResolvedValueOnce({ room: countyRoom, created: false })
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
    expect(findOrCreateSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'county',
      county: 'Travis',
      state: 'TX'
    }));
    expect(result.created).toBe(1);
  });

  it('only creates state room when zipCode is missing', async () => {
    const countyRoom = { members: [], save: jest.fn().mockResolvedValue(true) };
    const stateRoom = { members: [], save: jest.fn().mockResolvedValue(true) };

    const findOrCreateSpy = jest.spyOn(ChatRoom, 'findOrCreateByLocation')
      .mockResolvedValueOnce({ room: countyRoom, created: false })
      .mockResolvedValueOnce({ room: stateRoom, created: false });

    await ChatRoom.syncUserLocationRooms({
      _id: 'user-legacy',
      location: { coordinates: [-97.7431, 30.2672] },
      city: 'Austin',
      county: 'Travis County',
      state: 'TX',
      country: 'US'
    });

    expect(findOrCreateSpy).toHaveBeenCalledTimes(2);
    expect(findOrCreateSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'county',
      county: 'Travis County',
      state: 'TX',
      country: 'US'
    }));
    expect(findOrCreateSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'state',
      state: 'TX',
      country: 'US'
    }));
  });
});

describe('ChatRoom.findOrCreateByLocation canonical seeded room reuse', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reuses canonical seeded state rooms by stable key', async () => {
    const canonicalRoom = { _id: 'state-tx', stableKey: 'state:TX', members: [] };
    const findOneSpy = jest.spyOn(ChatRoom, 'findOne')
      .mockResolvedValueOnce(canonicalRoom);

    const result = await ChatRoom.findOrCreateByLocation({
      type: 'state',
      state: 'Texas',
      country: 'US',
      coordinates: [-97.7431, 30.2672]
    });

    expect(findOneSpy).toHaveBeenCalledWith({ stableKey: 'state:TX' });
    expect(result).toEqual({ room: canonicalRoom, created: false });
  });

  it('upgrades a legacy state room to the canonical seeded format instead of creating a duplicate', async () => {
    const legacyRoom = {
      _id: 'legacy-state-tx',
      name: 'TX',
      type: 'state',
      state: 'TX',
      country: 'US',
      members: ['user-1'],
      save: jest.fn().mockResolvedValue(true)
    };
    const findOneSpy = jest.spyOn(ChatRoom, 'findOne')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(legacyRoom);

    const result = await ChatRoom.findOrCreateByLocation({
      type: 'state',
      state: 'TX',
      country: 'US',
      coordinates: [-97.7431, 30.2672]
    });

    expect(findOneSpy).toHaveBeenNthCalledWith(1, { stableKey: 'state:TX' });
    expect(findOneSpy).toHaveBeenNthCalledWith(2, { type: 'state', state: 'TX', country: 'US' });
    expect(legacyRoom.name).toBe('Texas');
    expect(legacyRoom.stableKey).toBe('state:TX');
    expect(legacyRoom.radius).toBe(100);
    expect(legacyRoom.location).toEqual({ type: 'Point', coordinates: [0, 0] });
    expect(legacyRoom.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ room: legacyRoom, created: false });
  });
});
