import { useState, useEffect, useCallback } from 'react';
import { settingsAPI } from '../utils/api';

/**
 * Shared hook for the unified preferences API.
 *
 * Returns all preference domains (notifications, realtime, security, privacy,
 * ui) in one call, and a save() helper that accepts partial domain updates.
 *
 * @returns {{
 *   preferences: object | null,
 *   loading: boolean,
 *   saving: boolean,
 *   error: string | null,
 *   save: (domainUpdates: object) => Promise<boolean>,
 *   refresh: () => void
 * }}
 */
export default function useUnifiedPreferences() {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await settingsAPI.getPreferences();
      setPreferences(res.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const save = useCallback(async (domainUpdates) => {
    setSaving(true);
    setError(null);
    try {
      const res = await settingsAPI.updatePreferences(domainUpdates);
      if (res.data) {
        const { success, ...prefs } = res.data;
        setPreferences(prefs);
      }
      return true;
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save preferences');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { preferences, loading, saving, error, save, refresh: fetch };
}
