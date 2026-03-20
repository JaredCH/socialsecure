import { settingsAPI } from '../utils/api';
import usePreferencesResource from './usePreferencesResource';

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
  const resource = usePreferencesResource(
    settingsAPI.getPreferences,
    settingsAPI.updatePreferences,
    {
      extractData: (res) => res.data || null,
      extractSaved: (res) => {
        if (!res.data) return null;
        const { success, ...prefs } = res.data;
        return prefs;
      },
      loadError: 'Failed to load preferences',
      saveError: 'Failed to save preferences',
    },
  );

  return {
    preferences: resource.data,
    loading: resource.loading,
    saving: resource.saving,
    error: resource.error,
    save: resource.save,
    refresh: resource.refresh,
  };
}
