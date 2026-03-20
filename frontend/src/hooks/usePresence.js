import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { onFriendPresence, onPresenceUpdate } from '../utils/realtime';
import { getPresenceMeta } from '../utils/presence';

// ── Presence client singleton ───────────────────────────────────────────

const presenceStore = new Map();
const listeners = new Map();

const notifyListeners = (userId) => {
  const id = String(userId || '');
  const cbs = listeners.get(id);
  if (cbs) {
    for (const cb of cbs) cb(presenceStore.get(id) || null);
  }
};

const setPresenceRecord = (userId, record) => {
  const id = String(userId || '');
  if (!id) return;
  presenceStore.set(id, record);
  notifyListeners(id);
};

const subscribe = (userId, callback) => {
  const id = String(userId || '');
  if (!id || typeof callback !== 'function') return () => {};

  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id).add(callback);

  return () => {
    const cbs = listeners.get(id);
    if (cbs) {
      cbs.delete(callback);
      if (cbs.size === 0) listeners.delete(id);
    }
  };
};

// ── Wire up realtime events to the store (once) ────────────────────────

let realtimeInitialized = false;

const initRealtimeListeners = () => {
  if (realtimeInitialized) return;
  realtimeInitialized = true;

  onFriendPresence((payload) => {
    if (payload?.userId) {
      setPresenceRecord(payload.userId, payload);
    }
  });

  onPresenceUpdate((payload) => {
    if (payload?.userId) {
      setPresenceRecord(payload.userId, payload);
    }
  });
};

// ── Public API: presenceClient ──────────────────────────────────────────

export const presenceClient = {
  /**
   * Subscribe to presence updates for a list of user IDs.
   * Returns an unsubscribe function.
   */
  subscribeUsers(userIds, callback) {
    initRealtimeListeners();
    const unsubs = (Array.isArray(userIds) ? userIds : []).map((id) => subscribe(id, callback));
    return () => unsubs.forEach((fn) => fn());
  },

  /** Get the current cached presence for a user (may be null). */
  getPresence(userId) {
    return presenceStore.get(String(userId || '')) || null;
  },

  /** Manually inject a presence record (e.g. from API response). */
  setPresence(userId, record) {
    setPresenceRecord(userId, record);
  }
};

// ── Hooks ───────────────────────────────────────────────────────────────

/**
 * usePresence(userId) — subscribe to a single user's presence.
 * Returns the presence record or null.
 */
export const usePresence = (userId) => {
  const id = String(userId || '');
  const [presence, setPresence] = useState(() => presenceStore.get(id) || null);

  useEffect(() => {
    initRealtimeListeners();
    if (!id) return;
    setPresence(presenceStore.get(id) || null);
    return subscribe(id, setPresence);
  }, [id]);

  return presence;
};

/**
 * usePresenceMap(userIds) — subscribe to multiple users' presence.
 * Returns a Map<userId, presenceRecord>.
 */
export const usePresenceMap = (userIds) => {
  const ids = useMemo(
    () => [...new Set((Array.isArray(userIds) ? userIds : []).map((v) => String(v || '')).filter(Boolean))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(userIds)]
  );

  const buildMap = useCallback(() => {
    const map = new Map();
    for (const id of ids) {
      const rec = presenceStore.get(id);
      if (rec) map.set(id, rec);
    }
    return map;
  }, [ids]);

  const [presenceMap, setPresenceMap] = useState(buildMap);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    initRealtimeListeners();
    setPresenceMap(buildMap());

    const unsubs = ids.map((id) =>
      subscribe(id, () => {
        setPresenceMap(() => {
          const map = new Map();
          for (const uid of idsRef.current) {
            const rec = presenceStore.get(uid);
            if (rec) map.set(uid, rec);
          }
          return map;
        });
      })
    );

    return () => unsubs.forEach((fn) => fn());
  }, [ids, buildMap]);

  return presenceMap;
};

/**
 * useMyPresence() — subscribe to the authenticated user's own presence.
 * Pass the current userId from your auth context.
 */
export const useMyPresence = (myUserId) => {
  const presence = usePresence(myUserId);
  return presence;
};

/**
 * usePresenceMeta(userId) — convenience hook returning getPresenceMeta output.
 * Combines usePresence with periodic reference-time refresh.
 */
export const usePresenceMeta = (userId) => {
  const presence = usePresence(userId);
  const [referenceTime, setReferenceTime] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setReferenceTime(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  return useMemo(
    () => getPresenceMeta(presence, referenceTime),
    [presence, referenceTime]
  );
};
