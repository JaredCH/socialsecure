import { useState, useEffect, useCallback } from 'react';
import { notificationAPI } from '../utils/api';
import useInfiniteNotifications from './useInfiniteNotifications';
import usePreferencesResource from './usePreferencesResource';

/**
 * Shared hook for the notification inbox (active or history).
 * Now delegates to useInfiniteNotifications for all pagination, dedup,
 * and mutation logic.
 *
 * @param {Object}  options
 * @param {boolean} options.history  – when true, fetches history instead of active
 * @param {Object}  options.incomingNotification – latest incoming real-time notification
 * @param {number}  options.pageSize – items per page (default: 20)
 */
export function useNotificationInbox({ history = false, incomingNotification = null, pageSize = 20 } = {}) {
  return useInfiniteNotifications({ history, incomingNotification, pageSize });
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
 * Now delegates to usePreferencesResource for load/save lifecycle.
 */
export function useNotificationPreferences() {
  const resource = usePreferencesResource(
    notificationAPI.getPreferences,
    notificationAPI.updatePreferences,
    {
      extractData: (res) => ({
        preferences: res.data?.preferences || null,
        realtimePreferences: res.data?.realtimePreferences || null,
      }),
      extractSaved: (res) => ({
        preferences: res.data?.preferences || null,
        realtimePreferences: res.data?.realtimePreferences || null,
      }),
      loadError: 'Failed to load preferences',
      saveError: 'Failed to save preferences',
    },
  );

  return {
    preferences: resource.data?.preferences ?? null,
    realtimePreferences: resource.data?.realtimePreferences ?? null,
    loading: resource.loading,
    saving: resource.saving,
    error: resource.error,
    save: resource.save,
    refresh: resource.refresh,
  };
}
