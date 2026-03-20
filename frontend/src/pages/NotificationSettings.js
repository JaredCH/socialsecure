import React, { useEffect, useState } from 'react';
import { settingsAPI, notificationAPI } from '../utils/api';
import {
  getBrowserNotificationPermission,
  isBrowserNotificationSupported,
  requestBrowserNotificationPermission
} from '../utils/browserNotifications';

const CHANNELS = ['inApp', 'email', 'push'];

const TYPE_LABELS = {
  likes: 'Likes',
  comments: 'Comments',
  mentions: 'Mentions',
  follows: 'Follows',
  messages: 'Messages',
  friendPosts: 'Friend posts',
  top5: 'Top 5 changes',
  partnerRequests: 'Partner/spouse requests',
  system: 'System announcements',
  securityAlerts: 'Security alerts'
};

const NotificationSettings = () => {
  const [preferences, setPreferences] = useState(null);
  const [realtimePreferences, setRealtimePreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [browserPermission, setBrowserPermission] = useState(getBrowserNotificationPermission());

  useEffect(() => {
    const loadPreferences = async () => {
      setLoading(true);
      setError('');
      try {
        // Use the unified settings endpoint – backend returns fully-normalized
        // defaults so the frontend never needs its own copy.
        const response = await settingsAPI.getPreferences();
        const data = response.data;
        if (data?.notifications && typeof data.notifications === 'object') {
          setPreferences(data.notifications);
        }
        if (data?.realtime && typeof data.realtime === 'object') {
          setRealtimePreferences(data.realtime);
        }
      } catch (requestError) {
        setError(requestError.response?.data?.error || 'Failed to load preferences');
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, []);

  const handleToggle = (type, channel) => {
    setPreferences((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [channel]: !prev[type]?.[channel]
      }
    }));
  };

  const handleRealtimeToggle = (field) => {
    setRealtimePreferences((prev) => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const hasPushEnabled = Object.keys(TYPE_LABELS).some((typeKey) => Boolean(preferences[typeKey]?.push));
      if (hasPushEnabled && browserPermission === 'default') {
        const permission = await requestBrowserNotificationPermission();
        setBrowserPermission(permission);
      }
      // Save through the legacy notification endpoint so that both the
      // notificationPreferences and realtimePreferences fields are updated
      // in one call (matches the existing PUT contract).
      await notificationAPI.updatePreferences({
        ...preferences,
        realtime: realtimePreferences
      });
      setSuccess('Notification preferences updated.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const enableBrowserNotifications = async () => {
    setError('');
    const permission = await requestBrowserNotificationPermission();
    setBrowserPermission(permission);
    if (permission === 'denied') {
      setError('Browser notifications are blocked. Enable notifications for this site in your browser settings.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white shadow rounded-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Notification Settings</h1>
      <p className="text-sm text-gray-600 mb-6">Choose which notifications you receive by channel.</p>

      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900">Browser notification permission</p>
            <p className="text-gray-600">
              {isBrowserNotificationSupported()
                ? `Current status: ${browserPermission}`
                : 'This browser does not support notifications.'}
            </p>
          </div>
          {isBrowserNotificationSupported() && browserPermission !== 'granted' ? (
            <button
              type="button"
              onClick={enableBrowserNotifications}
              className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Enable browser notifications
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="mb-4 p-3 rounded bg-red-50 text-red-700 border border-red-200">{error}</div> : null}
      {success ? <div className="mb-4 p-3 rounded bg-green-50 text-green-700 border border-green-200">{success}</div> : null}

      {loading || !preferences ? (
        <div className="text-gray-500">Loading preferences...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border border-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 border-b">Type</th>
                <th className="text-left px-3 py-2 border-b">In-app</th>
                <th className="text-left px-3 py-2 border-b">Email</th>
                <th className="text-left px-3 py-2 border-b">Push</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(TYPE_LABELS).map((typeKey) => (
                <tr key={typeKey}>
                  <td className="px-3 py-2 border-b font-medium text-gray-800">{TYPE_LABELS[typeKey]}</td>
                  {CHANNELS.map((channel) => (
                    <td key={`${typeKey}:${channel}`} className="px-3 py-2 border-b">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(preferences[typeKey]?.[channel])}
                          onChange={() => handleToggle(typeKey, channel)}
                        />
                        <span>{channel}</span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        {realtimePreferences ? (
          <div className="mb-6 rounded-lg border border-gray-200 p-4 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">Real-time Social Updates</h2>
            <p className="text-sm text-gray-600 mt-1">Control live feed updates, presence, and last-seen visibility.</p>

            <div className="mt-4 space-y-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span>Enable real-time updates</span>
                <input
                  type="checkbox"
                  checked={Boolean(realtimePreferences.enabled)}
                  onChange={() => handleRealtimeToggle('enabled')}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Show my online/offline presence to friends</span>
                <input
                  type="checkbox"
                  checked={Boolean(realtimePreferences.showPresence)}
                  onChange={() => handleRealtimeToggle('showPresence')}
                  disabled={!realtimePreferences.enabled}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Show my last-seen time to friends</span>
                <input
                  type="checkbox"
                  checked={Boolean(realtimePreferences.showLastSeen)}
                  onChange={() => handleRealtimeToggle('showLastSeen')}
                  disabled={!realtimePreferences.enabled || !realtimePreferences.showPresence}
                />
              </label>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
};

export default NotificationSettings;
