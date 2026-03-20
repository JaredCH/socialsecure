/**
 * Presence Service — single source of truth for account presence.
 *
 * Manages the online / inactive / offline / hidden / unknown state machine,
 * heartbeat tracking, in-memory cache with durable DB fallback, canonical
 * DTO building, privacy/visibility enforcement, and subscription fan-out.
 *
 * This module is intentionally separated from location-sharing (maps) which
 * lives in models/LocationPresence.js and the maps route.
 */

const LRU = require('lru-cache');

const Presence = require('../models/Presence');
const { normalizeRealtimePreferences } = require('../utils/realtimePreferences');

// ── State machine ────────────────────────────────────────────────────────

/**
 * Canonical presence states.
 * - online:   user has at least one active socket.
 * - inactive: user disconnected within the INACTIVE window (grace period).
 * - offline:  user disconnected beyond the INACTIVE window or never connected.
 * - hidden:   user opted out of presence visibility.
 * - unknown:  presence record missing or not yet initialized.
 */
const PRESENCE_STATES = Object.freeze({
  ONLINE:   'online',
  INACTIVE: 'inactive',
  OFFLINE:  'offline',
  HIDDEN:   'hidden',
  UNKNOWN:  'unknown'
});

const VALID_STATES = new Set(Object.values(PRESENCE_STATES));

/** Grace period: how long after disconnect a user stays "inactive". */
const INACTIVE_WINDOW_MS = 5 * 60 * 1000;

/** Maximum age for a heartbeat before user is considered stale. */
const HEARTBEAT_STALE_MS = 90 * 1000;

// ── In-memory LRU cache (fast reads, DB fallback) ───────────────────────

const presenceCache = new LRU({ max: 2000, maxAge: 30 * 1000 });

const cacheKey = (userId) => `p:${String(userId || '').trim()}`;

const cacheGet = (userId) => presenceCache.get(cacheKey(userId)) || null;

const cacheSet = (userId, record) => {
  if (!userId) return;
  presenceCache.set(cacheKey(userId), record);
};

const cacheDelete = (userId) => presenceCache.del(cacheKey(userId));

const cacheClear = () => presenceCache.reset();

// ── Helpers ──────────────────────────────────────────────────────────────

const toTimestamp = (value) => {
  const ts = new Date(value || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

// ── State derivation (authoritative) ────────────────────────────────────

/**
 * Resolve the canonical status from a raw presence record.
 * This is the ONLY place status is derived — no other module should
 * duplicate this logic.
 */
const resolveStatus = (record, referenceTime = Date.now()) => {
  if (!record) return PRESENCE_STATES.UNKNOWN;

  const raw = String(record.status || '').trim().toLowerCase();
  if (raw === PRESENCE_STATES.HIDDEN) return PRESENCE_STATES.HIDDEN;
  if (raw === PRESENCE_STATES.ONLINE) return PRESENCE_STATES.ONLINE;

  const lastSeenTs = toTimestamp(record.lastSeen);
  if (lastSeenTs > 0 && (referenceTime - lastSeenTs) < INACTIVE_WINDOW_MS) {
    return PRESENCE_STATES.INACTIVE;
  }

  return PRESENCE_STATES.OFFLINE;
};

// ── Canonical DTO builder ───────────────────────────────────────────────

/**
 * Build the canonical presence DTO consumed by every client.
 *
 * Shape:
 *   { userId, status, lastSeen, lastActivity }
 *
 * Privacy enforcement:
 *   - If the target user has showPresence=false → status='hidden', lastSeen=null.
 *   - If showLastSeen=false → lastSeen is withheld.
 *   - If the viewer is blocked by the target → status='offline', lastSeen=null.
 */
const buildPresenceDTO = (userId, record, options = {}) => {
  const {
    preferences: preferencesInput,
    isBlocked = false,
    isSelf = false
  } = options;

  const normalizedUserId = String(userId || '').trim();

  // Blocked users always see "offline"
  if (isBlocked && !isSelf) {
    return {
      userId: normalizedUserId,
      status: PRESENCE_STATES.OFFLINE,
      lastSeen: null,
      lastActivity: null
    };
  }

  const preferences = normalizeRealtimePreferences(preferencesInput);

  // User opted out of presence visibility
  if (!preferences.showPresence && !isSelf) {
    return {
      userId: normalizedUserId,
      status: PRESENCE_STATES.HIDDEN,
      lastSeen: null,
      lastActivity: null
    };
  }

  const status = resolveStatus(record);
  return {
    userId: normalizedUserId,
    status,
    lastSeen: preferences.showLastSeen || isSelf
      ? (record?.lastSeen ? new Date(record.lastSeen).toISOString() : null)
      : null,
    lastActivity: isSelf
      ? (record?.lastActivity ? new Date(record.lastActivity).toISOString() : null)
      : null
  };
};

// ── Read operations (cache → DB fallback) ───────────────────────────────

/**
 * Get the raw presence record for a single user.
 * Reads from in-memory cache first; falls back to DB.
 */
const getPresence = async (userId) => {
  const id = String(userId || '').trim();
  if (!id) return null;

  const cached = cacheGet(id);
  if (cached) return cached;

  const record = await Presence.findOne({ userId: id })
    .select('userId status lastSeen lastActivity lastHeartbeat socketIds')
    .lean();

  if (record) cacheSet(id, record);
  return record || null;
};

/**
 * Get raw presence records for multiple users.
 * Returns Map<userId, record>.
 */
const getPresenceMap = async (userIds) => {
  const ids = [...new Set(
    (Array.isArray(userIds) ? userIds : [])
      .map((v) => String(v || '').trim())
      .filter(Boolean)
  )];
  if (ids.length === 0) return new Map();

  const result = new Map();
  const missingIds = [];

  for (const id of ids) {
    const cached = cacheGet(id);
    if (cached) {
      result.set(id, cached);
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length > 0) {
    const records = await Presence.find({ userId: { $in: missingIds } })
      .select('userId status lastSeen lastActivity lastHeartbeat socketIds')
      .lean();
    for (const rec of records) {
      const id = String(rec.userId);
      cacheSet(id, rec);
      result.set(id, rec);
    }
  }

  return result;
};

// ── Write operations (DB + cache update) ────────────────────────────────

/**
 * Update presence when a socket connects or disconnects.
 * Returns the updated raw record.
 */
const updateConnection = async (userId, socketId, isConnected, socketSet) => {
  const id = String(userId || '').trim();
  const sid = String(socketId || '').trim();
  if (!id || !sid) return null;

  const now = new Date();
  const socketIds = socketSet ? [...socketSet] : [];

  const record = await Presence.findOneAndUpdate(
    { userId: id },
    {
      $set: {
        status: socketIds.length > 0 ? PRESENCE_STATES.ONLINE : PRESENCE_STATES.INACTIVE,
        lastActivity: now,
        lastSeen: socketIds.length > 0 ? null : now,
        lastHeartbeat: socketIds.length > 0 ? now : null,
        socketIds
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (record) cacheSet(id, record);
  return record;
};

/**
 * Record a heartbeat from a connected user.
 * Heartbeats refresh the lastActivity and lastHeartbeat timestamps.
 */
const recordHeartbeat = async (userId) => {
  const id = String(userId || '').trim();
  if (!id) return null;

  const now = new Date();
  const record = await Presence.findOneAndUpdate(
    { userId: id, status: PRESENCE_STATES.ONLINE },
    { $set: { lastHeartbeat: now, lastActivity: now } },
    { new: true }
  ).lean();

  if (record) cacheSet(id, record);
  return record;
};

/**
 * Sweep stale presence records whose heartbeat has expired.
 * Transitions them from online → inactive.
 * Returns count of swept records.
 */
const sweepStalePresences = async () => {
  const threshold = new Date(Date.now() - HEARTBEAT_STALE_MS);

  const result = await Presence.updateMany(
    {
      status: PRESENCE_STATES.ONLINE,
      lastHeartbeat: { $lt: threshold }
    },
    {
      $set: { status: PRESENCE_STATES.INACTIVE, lastSeen: new Date() }
    }
  );

  return result.modifiedCount || 0;
};

// ── Backward-compatible wrappers ────────────────────────────────────────

/**
 * normalizePresenceRecord — backward-compatible wrapper around resolveStatus.
 * Used by existing callers in realtime.js that expect a full record back.
 */
const normalizePresenceRecord = (presence, referenceTime = Date.now()) => {
  if (!presence) {
    return {
      status: PRESENCE_STATES.OFFLINE,
      lastSeen: null,
      lastActivity: null
    };
  }

  const status = resolveStatus(presence, referenceTime);
  return { ...presence, status };
};

/**
 * buildPresencePayload — backward-compatible wrapper matching the old API
 * in realtime.js: (userId, presence, realtimePreferences) → DTO.
 */
const buildPresencePayload = (userId, presence, preferencesInput = {}) => {
  const dto = buildPresenceDTO(userId, presence, { preferences: preferencesInput });
  // Strip lastActivity for backward compatibility (old callers didn't expect it)
  return {
    userId: dto.userId,
    status: dto.status,
    lastSeen: dto.lastSeen
  };
};

// ── Exports ─────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  PRESENCE_STATES,
  VALID_STATES,
  INACTIVE_WINDOW_MS,
  HEARTBEAT_STALE_MS,

  // State derivation (authoritative)
  resolveStatus,

  // DTO builders
  buildPresenceDTO,
  buildPresencePayload,

  // Read
  getPresence,
  getPresenceMap,

  // Write
  updateConnection,
  recordHeartbeat,
  sweepStalePresences,

  // Backward-compatible
  normalizePresenceRecord,

  // Cache management (for testing / admin)
  cacheClear,
  cacheDelete
};
