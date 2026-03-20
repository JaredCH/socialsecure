const presenceService = require('./presenceService');

// ── Stub Presence model ────────────────────────────────────────────────
const mockFindOne = jest.fn();
const mockFind = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockUpdateMany = jest.fn();

jest.mock('../models/Presence', () => {
  const model = function () {};
  model.findOne = (...args) => mockFindOne(...args);
  model.find = (...args) => mockFind(...args);
  model.findOneAndUpdate = (...args) => mockFindOneAndUpdate(...args);
  model.updateMany = (...args) => mockUpdateMany(...args);
  return model;
});

jest.mock('../utils/realtimePreferences', () => ({
  normalizeRealtimePreferences: (val) => ({
    enabled: val?.enabled !== false,
    showPresence: val?.showPresence !== false,
    showLastSeen: val?.showLastSeen !== false
  })
}));

describe('presenceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    presenceService.cacheClear();
  });

  // ── Constants ──────────────────────────────────────────────────────

  describe('PRESENCE_STATES', () => {
    it('exports all canonical states', () => {
      expect(presenceService.PRESENCE_STATES).toEqual({
        ONLINE: 'online',
        INACTIVE: 'inactive',
        OFFLINE: 'offline',
        HIDDEN: 'hidden',
        UNKNOWN: 'unknown'
      });
    });

    it('VALID_STATES contains all states', () => {
      expect(presenceService.VALID_STATES.size).toBe(5);
      for (const state of Object.values(presenceService.PRESENCE_STATES)) {
        expect(presenceService.VALID_STATES.has(state)).toBe(true);
      }
    });
  });

  // ── resolveStatus ─────────────────────────────────────────────────

  describe('resolveStatus', () => {
    it('returns "unknown" for null record', () => {
      expect(presenceService.resolveStatus(null)).toBe('unknown');
    });

    it('returns "unknown" for undefined record', () => {
      expect(presenceService.resolveStatus(undefined)).toBe('unknown');
    });

    it('returns "online" for online status', () => {
      expect(presenceService.resolveStatus({ status: 'online' })).toBe('online');
    });

    it('returns "hidden" for hidden status', () => {
      expect(presenceService.resolveStatus({ status: 'hidden' })).toBe('hidden');
    });

    it('returns "inactive" for recently disconnected user', () => {
      const now = Date.now();
      const lastSeen = new Date(now - 2 * 60 * 1000).toISOString(); // 2 min ago
      expect(presenceService.resolveStatus({ status: 'inactive', lastSeen }, now)).toBe('inactive');
    });

    it('returns "offline" when lastSeen is beyond inactive window', () => {
      const now = Date.now();
      const lastSeen = new Date(now - 7 * 60 * 1000).toISOString(); // 7 min ago
      expect(presenceService.resolveStatus({ status: 'inactive', lastSeen }, now)).toBe('offline');
    });

    it('returns "offline" for unknown raw status without lastSeen', () => {
      expect(presenceService.resolveStatus({ status: 'something' })).toBe('offline');
    });
  });

  // ── buildPresenceDTO ──────────────────────────────────────────────

  describe('buildPresenceDTO', () => {
    it('returns canonical DTO shape', () => {
      const dto = presenceService.buildPresenceDTO('user-1', { status: 'online', lastSeen: null });
      expect(dto).toEqual({
        userId: 'user-1',
        status: 'online',
        lastSeen: null,
        lastActivity: null
      });
    });

    it('respects showPresence=false (hidden)', () => {
      const dto = presenceService.buildPresenceDTO('user-1', { status: 'online' }, {
        preferences: { showPresence: false }
      });
      expect(dto.status).toBe('hidden');
      expect(dto.lastSeen).toBeNull();
    });

    it('self always sees own status even with showPresence=false', () => {
      const dto = presenceService.buildPresenceDTO('user-1', { status: 'online' }, {
        preferences: { showPresence: false },
        isSelf: true
      });
      expect(dto.status).toBe('online');
    });

    it('blocked users see "offline"', () => {
      const dto = presenceService.buildPresenceDTO('user-1', { status: 'online' }, {
        isBlocked: true
      });
      expect(dto.status).toBe('offline');
      expect(dto.lastSeen).toBeNull();
    });

    it('self can still see own status even if blocked flag sent', () => {
      const dto = presenceService.buildPresenceDTO('user-1', { status: 'online' }, {
        isBlocked: true,
        isSelf: true
      });
      expect(dto.status).toBe('online');
    });

    it('withholds lastSeen when showLastSeen=false', () => {
      const lastSeen = new Date().toISOString();
      const dto = presenceService.buildPresenceDTO('user-1', {
        status: 'inactive', lastSeen
      }, {
        preferences: { showLastSeen: false }
      });
      expect(dto.lastSeen).toBeNull();
    });

    it('includes lastSeen when showLastSeen=true', () => {
      const lastSeen = new Date().toISOString();
      const dto = presenceService.buildPresenceDTO('user-1', {
        status: 'inactive', lastSeen
      }, {
        preferences: { showLastSeen: true }
      });
      expect(dto.lastSeen).toBe(lastSeen);
    });
  });

  // ── buildPresencePayload (backward compat) ────────────────────────

  describe('buildPresencePayload', () => {
    it('returns userId, status, lastSeen (no lastActivity)', () => {
      const result = presenceService.buildPresencePayload('u1', { status: 'online' });
      expect(result).toEqual({
        userId: 'u1',
        status: 'online',
        lastSeen: null
      });
      expect(result).not.toHaveProperty('lastActivity');
    });

    it('hides presence when showPresence=false', () => {
      const result = presenceService.buildPresencePayload('u1', { status: 'online' }, { showPresence: false });
      expect(result.status).toBe('hidden');
    });
  });

  // ── normalizePresenceRecord (backward compat) ─────────────────────

  describe('normalizePresenceRecord', () => {
    it('returns offline for null record', () => {
      expect(presenceService.normalizePresenceRecord(null)).toEqual({
        status: 'offline',
        lastSeen: null,
        lastActivity: null
      });
    });

    it('preserves online status', () => {
      expect(presenceService.normalizePresenceRecord({ status: 'online', lastSeen: null }).status).toBe('online');
    });

    it('degrades inactive to offline after window', () => {
      const now = Date.now();
      const old = new Date(now - 10 * 60 * 1000).toISOString();
      expect(presenceService.normalizePresenceRecord({ status: 'inactive', lastSeen: old }, now).status).toBe('offline');
    });

    it('keeps inactive within window', () => {
      const now = Date.now();
      const recent = new Date(now - 2 * 60 * 1000).toISOString();
      expect(presenceService.normalizePresenceRecord({ status: 'inactive', lastSeen: recent }, now).status).toBe('inactive');
    });
  });

  // ── getPresence (cache + DB fallback) ─────────────────────────────

  describe('getPresence', () => {
    it('returns null for empty userId', async () => {
      const result = await presenceService.getPresence('');
      expect(result).toBeNull();
    });

    it('reads from DB and caches result', async () => {
      const record = { userId: 'user-1', status: 'online', lastSeen: null };
      mockFindOne.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(record) })
      });

      const r1 = await presenceService.getPresence('user-1');
      expect(r1).toEqual(record);
      expect(mockFindOne).toHaveBeenCalledTimes(1);

      // Second call hits cache, not DB
      const r2 = await presenceService.getPresence('user-1');
      expect(r2).toEqual(record);
      expect(mockFindOne).toHaveBeenCalledTimes(1);
    });

    it('returns null when DB has no record', async () => {
      mockFindOne.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) })
      });

      const result = await presenceService.getPresence('user-missing');
      expect(result).toBeNull();
    });
  });

  // ── getPresenceMap ────────────────────────────────────────────────

  describe('getPresenceMap', () => {
    it('returns empty map for empty array', async () => {
      const result = await presenceService.getPresenceMap([]);
      expect(result.size).toBe(0);
    });

    it('combines cache hits with DB fetches', async () => {
      // Pre-populate cache for user-1
      const cached = { userId: 'user-1', status: 'online' };
      presenceService.cacheClear();
      // Manually set cache by calling getPresence
      mockFindOne.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(cached) })
      });
      await presenceService.getPresence('user-1');

      // user-2 will come from DB
      const dbRecord = { userId: 'user-2', status: 'offline' };
      mockFind.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([dbRecord]) })
      });

      const result = await presenceService.getPresenceMap(['user-1', 'user-2']);
      expect(result.get('user-1')).toEqual(cached);
      expect(result.get('user-2')).toEqual(dbRecord);
    });
  });

  // ── updateConnection ──────────────────────────────────────────────

  describe('updateConnection', () => {
    it('returns null for empty userId', async () => {
      const result = await presenceService.updateConnection('', 'sock-1', true, new Set());
      expect(result).toBeNull();
    });

    it('calls findOneAndUpdate with correct params', async () => {
      const record = { userId: 'u1', status: 'online', socketIds: ['s1'] };
      mockFindOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(record) });

      const result = await presenceService.updateConnection('u1', 's1', true, new Set(['s1']));
      expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(result).toEqual(record);
    });
  });

  // ── recordHeartbeat ───────────────────────────────────────────────

  describe('recordHeartbeat', () => {
    it('returns null for empty userId', async () => {
      const result = await presenceService.recordHeartbeat('');
      expect(result).toBeNull();
    });

    it('updates heartbeat for online user', async () => {
      const record = { userId: 'u1', status: 'online', lastHeartbeat: new Date() };
      mockFindOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(record) });

      const result = await presenceService.recordHeartbeat('u1');
      expect(result).toEqual(record);
      expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    });
  });

  // ── sweepStalePresences ───────────────────────────────────────────

  describe('sweepStalePresences', () => {
    it('returns count of swept records', async () => {
      mockUpdateMany.mockResolvedValue({ modifiedCount: 3 });

      const count = await presenceService.sweepStalePresences();
      expect(count).toBe(3);
      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    });

    it('returns 0 when nothing to sweep', async () => {
      mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });

      const count = await presenceService.sweepStalePresences();
      expect(count).toBe(0);
    });
  });
});
