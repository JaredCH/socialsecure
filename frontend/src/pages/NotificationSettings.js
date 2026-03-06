import React, { useEffect, useState } from 'react';
import { notificationAPI } from '../utils/api';

const CHANNELS = ['inApp', 'email', 'push'];

const TYPE_LABELS = {
  likes: 'Likes',
  comments: 'Comments',
  mentions: 'Mentions',
  follows: 'Follows',
  messages: 'Messages',
  system: 'System announcements',
  securityAlerts: 'Security alerts'
};

const defaultPreferences = {
  likes: { inApp: true, email: false, push: false },
  comments: { inApp: true, email: true, push: false },
  mentions: { inApp: true, email: true, push: false },
  follows: { inApp: true, email: false, push: false },
  messages: { inApp: true, email: false, push: false },
  system: { inApp: true, email: true, push: false },
  securityAlerts: { inApp: true, email: true, push: false },
  realtime: { enabled: true, typingIndicators: true, presence: true }
};

const defaultRealtimePreferences = {
  enabled: true,
  showPresence: true,
  showLastSeen: true
};

const NotificationSettings = () => {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [realtimePreferences, setRealtimePreferences] = useState(defaultRealtimePreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadPreferences = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await notificationAPI.getPreferences();
        const incoming = response.data?.preferences;
        if (incoming && typeof incoming === 'object') {
          setPreferences({ ...defaultPreferences, ...incoming });
        }
        const realtimeIncoming = response.data?.realtimePreferences;
        if (realtimeIncoming && typeof realtimeIncoming === 'object') {
          setRealtimePreferences({ ...defaultRealtimePreferences, ...realtimeIncoming });
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

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white shadow rounded-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Notification Settings</h1>
      <p className="text-sm text-gray-600 mb-6">Choose which notifications you receive by channel.</p>

      {error ? <div className="mb-4 p-3 rounded bg-red-50 text-red-700 border border-red-200">{error}</div> : null}
      {success ? <div className="mb-4 p-3 rounded bg-green-50 text-green-700 border border-green-200">{success}</div> : null}

      {loading ? (
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
