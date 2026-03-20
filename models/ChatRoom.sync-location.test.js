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

  it('adds the user when a legacy room has a missing members array', async () => {
    const zipRoom = { members: null, save: jest.fn().mockResolvedValue(true) };
    const countyRoom = { members: [], save: jest.fn().mockResolvedValue(true) };
    const stateRoom = { members: [], save: jest.fn().mockResolvedValue(true) };

    jest.spyOn(ChatRoom, 'findOrCreateByLocation')
      .mockResolvedValueOnce({ room: zipRoom, created: false })
      .mockResolvedValueOnce({ room: countyRoom, created: false })
      .mockResolvedValueOnce({ room: stateRoom, created: false });

    await expect(ChatRoom.syncUserLocationRooms({
      _id: 'user-1',
      location: { coordinates: [-97.7431, 30.2672] },
      zipCode: '78701',
      county: 'Travis',
      city: 'Austin',
      state: 'TX',
      country: 'US'
    })).resolves.toMatchObject({ created: 0 });

    expect(zipRoom.members).toEqual(['user-1']);
    expect(zipRoom.save).toHaveBeenCalledTimes(1);
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

    expect(findOneSpy).toHaveBeenCalledWith({
      stableKey: 'state:TX',
      archivedAt: null,
      discoverable: { $ne: false }
    });
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
    const findOneSpy = jest.spyOn(ChatRoom, 'findOne').mockImplementation(async (query) => {
      if (query?.stableKey === 'state:TX' && query?.archivedAt && query.archivedAt.$ne !== undefined) {
        return null;
      }
      if (query?.stableKey === 'state:TX') {
        return null;
      }
      if (query?.type === 'state' && query?.state === 'TX') {
        return legacyRoom;
      }
      return null;
    });

    const result = await ChatRoom.findOrCreateByLocation({
      type: 'state',
      state: 'TX',
      country: 'US',
      coordinates: [-97.7431, 30.2672]
    });

    expect(findOneSpy).toHaveBeenNthCalledWith(1, {
      stableKey: 'state:TX',
      archivedAt: null,
      discoverable: { $ne: false }
    });
    expect(findOneSpy).toHaveBeenNthCalledWith(2, { stableKey: 'state:TX', archivedAt: { $ne: null } });
    expect(findOneSpy).toHaveBeenNthCalledWith(3, {
      type: 'state',
      state: 'TX',
      country: 'US',
      archivedAt: null,
      discoverable: { $ne: false }
    });
    expect(legacyRoom.name).toBe('Texas');
    expect(legacyRoom.stableKey).toBe('state:TX');
    expect(legacyRoom.radius).toBe(100);
    expect(legacyRoom.location).toEqual({ type: 'Point', coordinates: [0, 0] });
    expect(legacyRoom.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ room: legacyRoom, created: false });
  });
});

describe('ChatRoom.findOrCreateByLocation county room stable key', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('finds county rooms by deterministic stable key', async () => {
    const countyRoom = {
      _id: 'county-hays',
      stableKey: 'county:US:TX:hays-county',
      type: 'county',
      county: 'Hays County',
      state: 'TX',
      country: 'US',
      members: []
    };
    const findOneSpy = jest.spyOn(ChatRoom, 'findOne')
      .mockResolvedValueOnce(countyRoom);

    const result = await ChatRoom.findOrCreateByLocation({
      type: 'county',
      county: 'Hays County',
      state: 'TX',
      country: 'US',
      coordinates: [-98.0, 30.0]
    });

    expect(findOneSpy).toHaveBeenCalledWith({
      stableKey: 'county:US:TX:hays-county',
      archivedAt: null,
      discoverable: { $ne: false }
    });
    expect(result).toEqual({ room: countyRoom, created: false });
  });

  it('normalizes state name to code for county stable key', async () => {
    const countyRoom = {
      _id: 'county-travis',
      stableKey: 'county:US:TX:travis',
      type: 'county',
      county: 'Travis',
      state: 'TX',
      country: 'US',
      members: []
    };
    const findOneSpy = jest.spyOn(ChatRoom, 'findOne')
      .mockResolvedValueOnce(countyRoom);

    const result = await ChatRoom.findOrCreateByLocation({
      type: 'county',
      county: 'Travis',
      state: 'Texas',
      country: 'US',
      coordinates: [-97.7431, 30.2672]
    });

    expect(findOneSpy).toHaveBeenCalledWith({
      stableKey: 'county:US:TX:travis',
      archivedAt: null,
      discoverable: { $ne: false }
    });
    expect(result).toEqual({ room: countyRoom, created: false });
  });

  it('normalizes country to uppercase code for county rooms', async () => {
    const countyRoom = {
      _id: 'county-harris',
      stableKey: 'county:US:TX:harris',
      type: 'county',
      members: []
    };
    const findOneSpy = jest.spyOn(ChatRoom, 'findOne')
      .mockResolvedValueOnce(countyRoom);

    await ChatRoom.findOrCreateByLocation({
      type: 'county',
      county: 'Harris',
      state: 'TX',
      country: 'us',
      coordinates: [-95.3698, 29.7604]
    });

    expect(findOneSpy).toHaveBeenCalledWith({
      stableKey: 'county:US:TX:harris',
      archivedAt: null,
      discoverable: { $ne: false }
    });
  });

  it('upgrades legacy county room without stableKey', async () => {
    const legacyRoom = {
      _id: 'legacy-county-travis',
      type: 'county',
      county: 'Travis',
      state: 'TX',
      country: 'US',
      members: ['user-1'],
      save: jest.fn().mockResolvedValue(true)
    };
    jest.spyOn(ChatRoom, 'findOne').mockImplementation(async (query) => {
      if (query?.stableKey === 'county:US:TX:travis') return null;
      if (query?.type === 'county' && query?.county === 'Travis') return legacyRoom;
      return null;
    });

    const result = await ChatRoom.findOrCreateByLocation({
      type: 'county',
      county: 'Travis',
      state: 'TX',
      country: 'US',
      coordinates: [-97.7431, 30.2672]
    });

    expect(legacyRoom.stableKey).toBe('county:US:TX:travis');
    expect(legacyRoom.state).toBe('TX');
    expect(legacyRoom.country).toBe('US');
    expect(legacyRoom.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ room: legacyRoom, created: false });
  });

  it('creates county room with stable key when none exists', async () => {
    const saveSpy = jest.fn().mockResolvedValue(true);
    jest.spyOn(ChatRoom, 'findOne').mockResolvedValue(null);
    jest.spyOn(ChatRoom.prototype, 'save').mockImplementation(saveSpy);

    const result = await ChatRoom.findOrCreateByLocation({
      type: 'county',
      county: 'Hays County',
      state: 'TX',
      country: 'US',
      coordinates: [-98.0, 30.0]
    });

    expect(result.created).toBe(true);
    expect(result.room.stableKey).toBe('county:US:TX:hays-county');
    expect(result.room.state).toBe('TX');
    expect(result.room.country).toBe('US');
    expect(result.room.county).toBe('Hays County');
    expect(result.room.name).toBe('Hays County, TX');
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('skips archived county room with matching stable key', async () => {
    jest.spyOn(ChatRoom, 'findOne').mockImplementation(async (query) => {
      if (query?.stableKey === 'county:US:TX:travis' && query?.archivedAt?.$ne !== undefined) {
        return { _id: 'archived-county', archivedAt: new Date() };
      }
      return null;
    });

    const result = await ChatRoom.findOrCreateByLocation({
      type: 'county',
      county: 'Travis',
      state: 'TX',
      country: 'US',
      coordinates: [-97.7431, 30.2672]
    });

    expect(result).toEqual({ room: null, created: false });
  });
});
