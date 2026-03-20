import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationAPI } from '../utils/api';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Infinite‑scroll notifications hook with deduplication, real‑time push,
 * and mutation helpers (mark‑read, acknowledge, dismiss, delete).
 *
 * @param {Object}  [options]
 * @param {boolean} [options.history=false]          – fetch history instead of active
 * @param {Object}  [options.incomingNotification]   – latest real‑time notification
 * @param {number}  [options.pageSize=20]            – items per page
 *
 * @returns {{
 *   notifications: any[],
 *   loading: boolean,
 *   error: string|null,
 *   hasMore: boolean,
 *   loadMore: () => void,
 *   markRead: (id: string) => Promise<boolean>,
 *   markAllRead: () => Promise<boolean>,
 *   acknowledge: (id: string) => Promise<boolean>,
 *   dismiss: (id: string) => Promise<boolean>,
 *   remove: (id: string) => Promise<boolean>,
 *   refresh: () => void
 * }}
 */
export default function useInfiniteNotifications({
  history = false,
  incomingNotification = null,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const seenIdsRef = useRef(new Set());

  const fetchPage = useCallback(
    async (p) => {
      setLoading(true);
      setError(null);
      try {
        const fetcher = history
          ? notificationAPI.getHistory
          : notificationAPI.getNotifications;
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
        setError(
          err?.response?.data?.error || 'Failed to load notifications',
        );
      } finally {
        setLoading(false);
      }
    },
    [history, pageSize],
  );

  // Auto‑load page 1
  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  // Prepend incoming real‑time notification
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

  /* ── Mutation helpers ────────────────────────────────────────────── */

  const markRead = useCallback(async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          String(n._id) === String(id)
            ? { ...n, isRead: true, readAt: new Date().toISOString() }
            : n,
        ),
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
        prev.map((n) => ({
          ...n,
          isRead: true,
          readAt: n.readAt || new Date().toISOString(),
        })),
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const acknowledge = useCallback(async (id) => {
    try {
      await notificationAPI.acknowledgeNotification(id);
      setNotifications((prev) =>
        prev.filter((n) => String(n._id) !== String(id)),
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const dismiss = useCallback(async (id) => {
    try {
      await notificationAPI.dismissNotification(id);
      setNotifications((prev) =>
        prev.filter((n) => String(n._id) !== String(id)),
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const remove = useCallback(async (id) => {
    try {
      await notificationAPI.deleteNotification(id);
      setNotifications((prev) =>
        prev.filter((n) => String(n._id) !== String(id)),
      );
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
    refresh,
  };
}
