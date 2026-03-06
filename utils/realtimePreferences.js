const DEFAULT_REALTIME_PREFERENCES = Object.freeze({
  enabled: true,
  showPresence: true,
  showLastSeen: true
});

const normalizeRealtimePreferences = (value = {}) => ({
  enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_REALTIME_PREFERENCES.enabled,
  showPresence: typeof value?.showPresence === 'boolean' ? value.showPresence : DEFAULT_REALTIME_PREFERENCES.showPresence,
  showLastSeen: typeof value?.showLastSeen === 'boolean' ? value.showLastSeen : DEFAULT_REALTIME_PREFERENCES.showLastSeen
});

module.exports = {
  DEFAULT_REALTIME_PREFERENCES,
  normalizeRealtimePreferences
};
