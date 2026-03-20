const {
  PREFERENCES_SCHEMA_VERSION,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_REALTIME_PREFERENCES,
  DEFAULT_SECURITY_PREFERENCES,
  DEFAULT_PRIVACY_PREFERENCES,
  DEFAULT_UI_PREFERENCES,
  normalizeNotificationPreferences,
  normalizeRealtimePreferences,
  normalizeSecurityPreferences,
  normalizePrivacyPreferences,
  normalizeUiPreferences,
  buildUnifiedPreferences,
  getDefaults
} = require('./unifiedPreferences');

describe('unifiedPreferences', () => {
  describe('PREFERENCES_SCHEMA_VERSION', () => {
    it('is a positive integer', () => {
      expect(Number.isInteger(PREFERENCES_SCHEMA_VERSION)).toBe(true);
      expect(PREFERENCES_SCHEMA_VERSION).toBeGreaterThan(0);
    });
  });

  // ── normalizeNotificationPreferences ──────────────────────────────────

  describe('normalizeNotificationPreferences', () => {
    it('returns defaults when input is null/undefined', () => {
      expect(normalizeNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
      expect(normalizeNotificationPreferences(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it('returns defaults when input is a non-object', () => {
      expect(normalizeNotificationPreferences('bad')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it('merges partial channel preferences over defaults', () => {
      const result = normalizeNotificationPreferences({
        likes: { inApp: false }
      });
      expect(result.likes).toEqual({ inApp: false, email: false, push: false });
      // Other keys should still be defaults
      expect(result.comments).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.comments);
    });

    it('normalizes realtime sub-object', () => {
      const result = normalizeNotificationPreferences({
        realtime: { enabled: false }
      });
      expect(result.realtime).toEqual({
        enabled: false,
        typingIndicators: true,
        presence: true
      });
    });

    it('normalizes quietHours', () => {
      const result = normalizeNotificationPreferences({
        quietHours: { enabled: true, start: '23:00' }
      });
      expect(result.quietHours).toEqual({
        enabled: true,
        start: '23:00',
        end: '08:00',
        timezone: 'UTC'
      });
    });

    it('rejects invalid digest frequency', () => {
      const result = normalizeNotificationPreferences({
        digestMode: { enabled: true, frequency: 'monthly' }
      });
      expect(result.digestMode.frequency).toBe('daily');
    });

    it('accepts valid digest frequency', () => {
      const result = normalizeNotificationPreferences({
        digestMode: { enabled: true, frequency: 'weekly' }
      });
      expect(result.digestMode.frequency).toBe('weekly');
    });
  });

  // ── normalizeRealtimePreferences ──────────────────────────────────────

  describe('normalizeRealtimePreferences', () => {
    it('returns defaults when input is null', () => {
      expect(normalizeRealtimePreferences(null)).toEqual(DEFAULT_REALTIME_PREFERENCES);
    });

    it('merges partial input', () => {
      const result = normalizeRealtimePreferences({ enabled: false });
      expect(result).toEqual({
        enabled: false,
        showPresence: true,
        showLastSeen: true
      });
    });

    it('ignores non-boolean values', () => {
      const result = normalizeRealtimePreferences({
        enabled: 'yes',
        showPresence: 0,
        showLastSeen: null
      });
      expect(result).toEqual(DEFAULT_REALTIME_PREFERENCES);
    });
  });

  // ── normalizeSecurityPreferences ──────────────────────────────────────

  describe('normalizeSecurityPreferences', () => {
    it('returns defaults when input is null', () => {
      expect(normalizeSecurityPreferences(null)).toEqual(DEFAULT_SECURITY_PREFERENCES);
    });

    it('returns defaults when input is an array', () => {
      expect(normalizeSecurityPreferences([1, 2])).toEqual(DEFAULT_SECURITY_PREFERENCES);
    });

    it('clamps session timeout to valid range', () => {
      expect(normalizeSecurityPreferences({ sessionTimeout: 2 }).sessionTimeout).toBe(5);
      expect(normalizeSecurityPreferences({ sessionTimeout: 9999 }).sessionTimeout).toBe(1440);
      expect(normalizeSecurityPreferences({ sessionTimeout: 120 }).sessionTimeout).toBe(120);
    });

    it('uses default for non-integer session timeout', () => {
      expect(normalizeSecurityPreferences({ sessionTimeout: 'abc' }).sessionTimeout).toBe(60);
    });

    it('normalizes boolean fields', () => {
      const result = normalizeSecurityPreferences({
        loginNotifications: false,
        requirePasswordForSensitive: false
      });
      expect(result.loginNotifications).toBe(false);
      expect(result.requirePasswordForSensitive).toBe(false);
    });
  });

  // ── normalizePrivacyPreferences ───────────────────────────────────────

  describe('normalizePrivacyPreferences', () => {
    it('returns defaults when user is null', () => {
      const result = normalizePrivacyPreferences(null);
      expect(result.friendListPrivacy).toBe('friends');
      expect(result.topFriendsPrivacy).toBe('public');
      expect(result.profileFieldVisibility.firstName).toBe('public');
      expect(result.locationSharing.shareWithFriends).toBe(true);
    });

    it('uses user values when valid', () => {
      const result = normalizePrivacyPreferences({
        profileFieldVisibility: { phone: 'secure', email: 'public' },
        friendListPrivacy: 'private',
        topFriendsPrivacy: 'friends'
      });
      expect(result.profileFieldVisibility.phone).toBe('secure');
      expect(result.profileFieldVisibility.email).toBe('public');
      expect(result.friendListPrivacy).toBe('private');
      expect(result.topFriendsPrivacy).toBe('friends');
    });

    it('rejects invalid visibility values', () => {
      const result = normalizePrivacyPreferences({
        profileFieldVisibility: { phone: 'invalid' },
        friendListPrivacy: 'invalid'
      });
      expect(result.profileFieldVisibility.phone).toBe('social');
      expect(result.friendListPrivacy).toBe('friends');
    });
  });

  // ── normalizeUiPreferences ────────────────────────────────────────────

  describe('normalizeUiPreferences', () => {
    it('returns defaults when user is null', () => {
      expect(normalizeUiPreferences(null)).toEqual(DEFAULT_UI_PREFERENCES);
    });

    it('normalizes theme to valid value', () => {
      expect(normalizeUiPreferences({ profileTheme: 'dark' }).profileTheme).toBe('dark');
      expect(normalizeUiPreferences({ profileTheme: 'invalid' }).profileTheme).toBe('default');
    });
  });

  // ── buildUnifiedPreferences ───────────────────────────────────────────

  describe('buildUnifiedPreferences', () => {
    it('includes _version and all domains', () => {
      const result = buildUnifiedPreferences(null);
      expect(result._version).toBe(PREFERENCES_SCHEMA_VERSION);
      expect(result).toHaveProperty('notifications');
      expect(result).toHaveProperty('realtime');
      expect(result).toHaveProperty('security');
      expect(result).toHaveProperty('privacy');
      expect(result).toHaveProperty('ui');
    });

    it('normalizes a realistic user object', () => {
      const user = {
        notificationPreferences: {
          likes: { inApp: false, email: true, push: false }
        },
        realtimePreferences: { enabled: false, showPresence: false, showLastSeen: true },
        securityPreferences: { sessionTimeout: 30 },
        profileFieldVisibility: { phone: 'secure' },
        friendListPrivacy: 'private',
        topFriendsPrivacy: 'friends',
        profileTheme: 'sunset',
        stripImageMetadataOnUpload: true,
        enableMaturityWordCensor: false
      };

      const result = buildUnifiedPreferences(user);
      expect(result.notifications.likes).toEqual({ inApp: false, email: true, push: false });
      expect(result.realtime.enabled).toBe(false);
      expect(result.security.sessionTimeout).toBe(30);
      expect(result.privacy.profileFieldVisibility.phone).toBe('secure');
      expect(result.privacy.friendListPrivacy).toBe('private');
      expect(result.ui.profileTheme).toBe('sunset');
      expect(result.ui.stripImageMetadataOnUpload).toBe(true);
      expect(result.ui.enableMaturityWordCensor).toBe(false);
    });
  });

  // ── getDefaults ───────────────────────────────────────────────────────

  describe('getDefaults', () => {
    it('returns all domains with schema version', () => {
      const result = getDefaults();
      expect(result._version).toBe(PREFERENCES_SCHEMA_VERSION);
      expect(result.notifications).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
      expect(result.realtime).toEqual(DEFAULT_REALTIME_PREFERENCES);
      expect(result.security).toEqual(DEFAULT_SECURITY_PREFERENCES);
      expect(result.ui).toEqual(DEFAULT_UI_PREFERENCES);
    });

    it('returns a deep copy (mutating the result does not affect defaults)', () => {
      const a = getDefaults();
      a.notifications.likes.inApp = false;
      const b = getDefaults();
      expect(b.notifications.likes.inApp).toBe(true);
    });
  });
});
