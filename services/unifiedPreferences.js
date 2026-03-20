/**
 * Unified Preferences Service
 *
 * Single source of truth for all user preference domains:
 *   - notifications (channel toggles, quiet hours, digest)
 *   - realtime (presence, last-seen, typing indicators)
 *   - security (login alerts, session timeout, password prompts)
 *   - privacy (profile field visibility, friend-list visibility, location sharing)
 *   - ui (profile theme, image-metadata strip, maturity-word censor)
 *
 * Every preference default, normalizer, and schema version lives here so that
 * neither backend routes nor frontend components need to duplicate them.
 */

const PREFERENCES_SCHEMA_VERSION = 1;

// ── Notification defaults ───────────────────────────────────────────────

const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  likes:           { inApp: true,  email: false, push: false },
  comments:        { inApp: true,  email: true,  push: false },
  mentions:        { inApp: true,  email: true,  push: false },
  follows:         { inApp: true,  email: false, push: false },
  messages:        { inApp: true,  email: false, push: false },
  system:          { inApp: true,  email: true,  push: false },
  securityAlerts:  { inApp: true,  email: true,  push: false },
  friendPosts:     { inApp: true,  email: false, push: false },
  top5:            { inApp: true,  email: false, push: false },
  partnerRequests: { inApp: true,  email: true,  push: false },
  realtime:        { enabled: true, typingIndicators: true, presence: true },
  quietHours:      { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC' },
  digestMode:      { enabled: false, frequency: 'daily' }
});

// ── Realtime defaults ───────────────────────────────────────────────────

const DEFAULT_REALTIME_PREFERENCES = Object.freeze({
  enabled: true,
  showPresence: true,
  showLastSeen: true
});

// ── Security defaults ───────────────────────────────────────────────────

const DEFAULT_SECURITY_PREFERENCES = Object.freeze({
  loginNotifications: true,
  sessionTimeout: 60,
  requirePasswordForSensitive: true
});

// ── Privacy defaults ────────────────────────────────────────────────────

const VISIBILITY_LEVELS = ['public', 'social', 'secure'];
const FRIEND_PRIVACY_LEVELS = ['public', 'friends', 'private'];

const DEFAULT_PRIVACY_PREFERENCES = Object.freeze({
  profileFieldVisibility: {
    firstName:     'public',
    lastName:      'public',
    streetAddress: 'social',
    phone:         'social',
    email:         'social',
    worksAt:       'social',
    hobbies:       'social',
    ageGroup:      'social',
    sex:           'social',
    race:          'social'
  },
  friendListPrivacy: 'friends',
  topFriendsPrivacy: 'public',
  locationSharing: {
    shareWithFriends: true,
    precisionLevel: 5
  }
});

// ── UI defaults ─────────────────────────────────────────────────────────

const DEFAULT_UI_PREFERENCES = Object.freeze({
  profileTheme: 'default',
  stripImageMetadataOnUpload: false,
  enableMaturityWordCensor: true
});

// ── Normalizers ─────────────────────────────────────────────────────────

const normalizeBool = (value, fallback) =>
  typeof value === 'boolean' ? value : fallback;

const normalizeNotificationPreferences = (candidate) => {
  const defaults = DEFAULT_NOTIFICATION_PREFERENCES;
  if (!candidate || typeof candidate !== 'object') return { ...defaults };

  const normalized = {};

  // Channel-based notification types
  const channelKeys = [
    'likes', 'comments', 'mentions', 'follows', 'messages',
    'system', 'securityAlerts', 'friendPosts', 'top5', 'partnerRequests'
  ];

  for (const key of channelKeys) {
    const src = candidate[key];
    const def = defaults[key];
    if (!src || typeof src !== 'object') {
      normalized[key] = { ...def };
    } else {
      normalized[key] = {
        inApp: normalizeBool(src.inApp, def.inApp),
        email: normalizeBool(src.email, def.email),
        push:  normalizeBool(src.push,  def.push)
      };
    }
  }

  // Realtime sub-object inside notifications
  const rt = candidate.realtime;
  const rtDef = defaults.realtime;
  if (!rt || typeof rt !== 'object') {
    normalized.realtime = { ...rtDef };
  } else {
    normalized.realtime = {
      enabled:          normalizeBool(rt.enabled, rtDef.enabled),
      typingIndicators: normalizeBool(rt.typingIndicators, rtDef.typingIndicators),
      presence:         normalizeBool(rt.presence, rtDef.presence)
    };
  }

  // Quiet hours
  const qh = candidate.quietHours;
  const qhDef = defaults.quietHours;
  if (!qh || typeof qh !== 'object') {
    normalized.quietHours = { ...qhDef };
  } else {
    normalized.quietHours = {
      enabled:  normalizeBool(qh.enabled, qhDef.enabled),
      start:    typeof qh.start    === 'string' ? qh.start    : qhDef.start,
      end:      typeof qh.end      === 'string' ? qh.end      : qhDef.end,
      timezone: typeof qh.timezone === 'string' ? qh.timezone : qhDef.timezone
    };
  }

  // Digest mode
  const dm = candidate.digestMode;
  const dmDef = defaults.digestMode;
  if (!dm || typeof dm !== 'object') {
    normalized.digestMode = { ...dmDef };
  } else {
    normalized.digestMode = {
      enabled:   normalizeBool(dm.enabled, dmDef.enabled),
      frequency: ['daily', 'weekly'].includes(dm.frequency) ? dm.frequency : dmDef.frequency
    };
  }

  return normalized;
};

const normalizeRealtimePreferences = (value) => {
  const defaults = DEFAULT_REALTIME_PREFERENCES;
  if (!value || typeof value !== 'object') return { ...defaults };
  return {
    enabled:      normalizeBool(value.enabled, defaults.enabled),
    showPresence: normalizeBool(value.showPresence, defaults.showPresence),
    showLastSeen: normalizeBool(value.showLastSeen, defaults.showLastSeen)
  };
};

const normalizeSecurityPreferences = (input) => {
  const defaults = DEFAULT_SECURITY_PREFERENCES;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...defaults };
  }

  const sessionTimeout = Number.parseInt(input.sessionTimeout, 10);

  return {
    loginNotifications: normalizeBool(input.loginNotifications, defaults.loginNotifications),
    sessionTimeout: Number.isInteger(sessionTimeout)
      ? Math.min(Math.max(sessionTimeout, 5), 1440)
      : defaults.sessionTimeout,
    requirePasswordForSensitive: normalizeBool(
      input.requirePasswordForSensitive,
      defaults.requirePasswordForSensitive
    )
  };
};

const normalizePrivacyPreferences = (user) => {
  const defaults = DEFAULT_PRIVACY_PREFERENCES;

  const pfv = user?.profileFieldVisibility || {};
  const normalizedPfv = {};
  for (const [field, defaultLevel] of Object.entries(defaults.profileFieldVisibility)) {
    normalizedPfv[field] = VISIBILITY_LEVELS.includes(pfv[field]) ? pfv[field] : defaultLevel;
  }

  return {
    profileFieldVisibility: normalizedPfv,
    friendListPrivacy: FRIEND_PRIVACY_LEVELS.includes(user?.friendListPrivacy)
      ? user.friendListPrivacy
      : defaults.friendListPrivacy,
    topFriendsPrivacy: FRIEND_PRIVACY_LEVELS.includes(user?.topFriendsPrivacy)
      ? user.topFriendsPrivacy
      : defaults.topFriendsPrivacy,
    locationSharing: {
      shareWithFriends: normalizeBool(
        user?.locationSharing?.shareWithFriends,
        defaults.locationSharing.shareWithFriends
      ),
      precisionLevel: [1, 2, 3, 4, 5].includes(user?.locationSharing?.precisionLevel)
        ? user.locationSharing.precisionLevel
        : defaults.locationSharing.precisionLevel
    }
  };
};

const VALID_THEMES = ['default', 'light', 'dark', 'sunset', 'forest'];

const normalizeUiPreferences = (user) => {
  const defaults = DEFAULT_UI_PREFERENCES;
  return {
    profileTheme: VALID_THEMES.includes(user?.profileTheme) ? user.profileTheme : defaults.profileTheme,
    stripImageMetadataOnUpload: normalizeBool(
      user?.stripImageMetadataOnUpload,
      defaults.stripImageMetadataOnUpload
    ),
    enableMaturityWordCensor: normalizeBool(
      user?.enableMaturityWordCensor,
      defaults.enableMaturityWordCensor
    )
  };
};

// ── Aggregate builder ───────────────────────────────────────────────────

/**
 * Build a fully-normalized preferences object for a user, grouped by domain.
 *
 * @param {Object} user - Mongoose user document (or plain object with the
 *   same shape).
 * @returns {{ _version, notifications, realtime, security, privacy, ui }}
 */
const buildUnifiedPreferences = (user) => ({
  _version: PREFERENCES_SCHEMA_VERSION,
  notifications: normalizeNotificationPreferences(user?.notificationPreferences),
  realtime:      normalizeRealtimePreferences(user?.realtimePreferences),
  security:      normalizeSecurityPreferences(user?.securityPreferences),
  privacy:       normalizePrivacyPreferences(user),
  ui:            normalizeUiPreferences(user)
});

/**
 * Return only the default values for every domain – useful when seeding a new
 * user or providing a "factory defaults" reference to the frontend.
 */
const getDefaults = () => ({
  _version: PREFERENCES_SCHEMA_VERSION,
  notifications: JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES)),
  realtime:      { ...DEFAULT_REALTIME_PREFERENCES },
  security:      { ...DEFAULT_SECURITY_PREFERENCES },
  privacy:       JSON.parse(JSON.stringify(DEFAULT_PRIVACY_PREFERENCES)),
  ui:            { ...DEFAULT_UI_PREFERENCES }
});

module.exports = {
  PREFERENCES_SCHEMA_VERSION,

  // Domain defaults
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_REALTIME_PREFERENCES,
  DEFAULT_SECURITY_PREFERENCES,
  DEFAULT_PRIVACY_PREFERENCES,
  DEFAULT_UI_PREFERENCES,

  // Normalizers
  normalizeNotificationPreferences,
  normalizeRealtimePreferences,
  normalizeSecurityPreferences,
  normalizePrivacyPreferences,
  normalizeUiPreferences,

  // Aggregate helpers
  buildUnifiedPreferences,
  getDefaults
};
