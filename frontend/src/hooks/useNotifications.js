import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationAPI } from '../utils/api';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Shared hook for the notification inbox (active or history).
 *
 * @param {Object}  options
 * @param {boolean} options.history  – when true, fetches history instead of active
 * @param {Object}  options.incomingNotification – latest incoming real-time notification
 * @param {number}  options.pageSize – items per page (default: 20)
 */
export function useNotificationInbox({ history = false, incomingNotification = null, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const seenIdsRef = useRef(new Set());

  const fetchPage = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const fetcher = history ? notificationAPI.getHistory : notificationAPI.getNotifications;
      const res = await fetcher(p, pageSize);
      const data = res.data;
      const items = data.notifications || [];

      setNotifications((prev) => {
        const combined = p === 1 ? items : [...prev, ...items];
        const unique = [];
        const ids = new Set();
        for (const n of combined) {
          const id = String(n._id);
          if (!ids.has(id)) {
            ids.add(id);
            unique.push(n);
          }
        }
        seenIdsRef.current = ids;
        return unique;
      });
      setHasMore(data.pagination?.hasMore ?? false);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [history]);

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  useEffect(() => {
    if (!incomingNotification || history) return;
    const id = String(incomingNotification._id);
    if (seenIdsRef.current.has(id)) return;
    seenIdsRef.current.add(id);
    setNotifications((prev) => [incomingNotification, ...prev]);
  }, [incomingNotification, history]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage);
  }, [loading, hasMore, page, fetchPage]);

  const markRead = useCallback(async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (String(n._id) === String(id) ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt || new Date().toISOString() }))
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const acknowledge = useCallback(async (id) => {
    try {
      await notificationAPI.acknowledgeNotification(id);
      setNotifications((prev) => prev.filter((n) => String(n._id) !== String(id)));
      return true;
    } catch {
      return false;
    }
  }, []);

  const dismiss = useCallback(async (id) => {
    try {
      await notificationAPI.dismissNotification(id);
      setNotifications((prev) => prev.filter((n) => String(n._id) !== String(id)));
      return true;
    } catch {
      return false;
    }
  }, []);

  const remove = useCallback(async (id) => {
    try {
      await notificationAPI.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => String(n._id) !== String(id)));
      return true;
    } catch {
      return false;
    }
  }, []);

  const refresh = useCallback(() => {
    setPage(1);
    fetchPage(1);
  }, [fetchPage]);

  return {
    notifications,
    loading,
    error,
    hasMore,
    loadMore,
    markRead,
    markAllRead,
    acknowledge,
    dismiss,
    remove,
    refresh
  };
}

/**
 * Shared hook for unread notification count.
 *
 * @param {number} initialCount – bootstrap count from user profile
 */
export function useUnreadCount(initialCount = 0) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  const refresh = useCallback(async () => {
    try {
      const res = await notificationAPI.getUnreadCount();
      setCount(res.data?.count ?? 0);
    } catch {
      /* swallow */
    }
  }, []);

  const increment = useCallback((n = 1) => setCount((prev) => prev + n), []);
  const decrement = useCallback((n = 1) => setCount((prev) => Math.max(0, prev - n)), []);
  const reset = useCallback(() => setCount(0), []);

  return { count, setCount, refresh, increment, decrement, reset };
}

/**
 * Shared hook for notification preferences (incl. quiet hours & digest).
 */
export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState(null);
  const [realtimePreferences, setRealtimePreferences] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await notificationAPI.getPreferences();
      setPreferences(res.data?.preferences || null);
      setRealtimePreferences(res.data?.realtimePreferences || null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const save = useCallback(async (data) => {
    setSaving(true);
    setError(null);
    try {
      const res = await notificationAPI.updatePreferences(data);
      if (res.data?.preferences) setPreferences(res.data.preferences);
      if (res.data?.realtimePreferences) setRealtimePreferences(res.data.realtimePreferences);
      return true;
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save preferences');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { preferences, realtimePreferences, loading, saving, error, save, refresh: fetch };
}
