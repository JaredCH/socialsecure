const express = require('express');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const Session = require('../models/Session');
const {
  PREFERENCES_SCHEMA_VERSION,
  buildUnifiedPreferences,
  getDefaults,
  normalizeNotificationPreferences,
  normalizeRealtimePreferences,
  normalizeSecurityPreferences,
  normalizePrivacyPreferences,
  normalizeUiPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_REALTIME_PREFERENCES,
  DEFAULT_SECURITY_PREFERENCES,
  DEFAULT_PRIVACY_PREFERENCES,
  DEFAULT_UI_PREFERENCES
} = require('../services/unifiedPreferences');

const router = express.Router();

const hashToken = (token = '') =>
  require('crypto').createHash('sha256').update(token).digest('hex');

const authenticateToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );
    const tokenHash = hashToken(token);
    const session = await Session.findOne({
      userId: decoded.userId,
      tokenHash,
      isRevoked: false
    });
    if (!session) return res.status(401).json({ error: 'Session expired or revoked' });

    session.lastActivity = new Date();
    await session.save();

    const user = await User.findById(decoded.userId).select(
      'notificationPreferences realtimePreferences securityPreferences ' +
      'profileFieldVisibility friendListPrivacy topFriendsPrivacy ' +
      'profileTheme stripImageMetadataOnUpload enableMaturityWordCensor'
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ── GET /api/settings/preferences ───────────────────────────────────────
router.get('/preferences', authenticateToken, (req, res) => {
  return res.json(buildUnifiedPreferences(req.user));
});

// ── GET /api/settings/defaults ──────────────────────────────────────────
router.get('/defaults', (_req, res) => {
  return res.json(getDefaults());
});

// ── PUT /api/settings/preferences ───────────────────────────────────────
// Accepts a body with one or more domain keys: notifications, realtime,
// security, privacy, ui.  Only supplied domains are updated.
router.put('/preferences', authenticateToken, async (req, res) => {
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return res.status(400).json({ error: 'Request body must be an object' });
  }

  const VALID_DOMAINS = ['notifications', 'realtime', 'security', 'privacy', 'ui'];
  const suppliedDomains = Object.keys(input).filter((k) => VALID_DOMAINS.includes(k));

  if (suppliedDomains.length === 0) {
    return res.status(400).json({
      error: 'At least one preference domain must be provided',
      validDomains: VALID_DOMAINS
    });
  }

  try {
    const $set = {};

    if (input.notifications) {
      $set.notificationPreferences = normalizeNotificationPreferences(input.notifications);
    }

    if (input.realtime) {
      $set.realtimePreferences = normalizeRealtimePreferences(input.realtime);
    }

    if (input.security) {
      $set.securityPreferences = normalizeSecurityPreferences(input.security);
    }

    if (input.privacy) {
      const p = input.privacy;
      if (p.profileFieldVisibility && typeof p.profileFieldVisibility === 'object') {
        const defaults = DEFAULT_PRIVACY_PREFERENCES.profileFieldVisibility;
        const VISIBILITY_LEVELS = ['public', 'social', 'secure'];
        for (const [field, defaultLevel] of Object.entries(defaults)) {
          const val = p.profileFieldVisibility[field];
          $set[`profileFieldVisibility.${field}`] = VISIBILITY_LEVELS.includes(val)
            ? val
            : defaultLevel;
        }
      }
      if (p.friendListPrivacy) {
        $set.friendListPrivacy = ['public', 'friends', 'private'].includes(p.friendListPrivacy)
          ? p.friendListPrivacy
          : DEFAULT_PRIVACY_PREFERENCES.friendListPrivacy;
      }
      if (p.topFriendsPrivacy) {
        $set.topFriendsPrivacy = ['public', 'friends', 'private'].includes(p.topFriendsPrivacy)
          ? p.topFriendsPrivacy
          : DEFAULT_PRIVACY_PREFERENCES.topFriendsPrivacy;
      }
    }

    if (input.ui) {
      const VALID_THEMES = ['default', 'light', 'dark', 'sunset', 'forest'];
      if (input.ui.profileTheme !== undefined) {
        $set.profileTheme = VALID_THEMES.includes(input.ui.profileTheme)
          ? input.ui.profileTheme
          : DEFAULT_UI_PREFERENCES.profileTheme;
      }
      if (typeof input.ui.stripImageMetadataOnUpload === 'boolean') {
        $set.stripImageMetadataOnUpload = input.ui.stripImageMetadataOnUpload;
      }
      if (typeof input.ui.enableMaturityWordCensor === 'boolean') {
        $set.enableMaturityWordCensor = input.ui.enableMaturityWordCensor;
      }
    }

    if (Object.keys($set).length > 0) {
      await User.updateOne({ _id: req.user._id }, { $set });
    }

    // Re-read to return the normalized aggregate
    const updated = await User.findById(req.user._id).select(
      'notificationPreferences realtimePreferences securityPreferences ' +
      'profileFieldVisibility friendListPrivacy topFriendsPrivacy ' +
      'profileTheme stripImageMetadataOnUpload enableMaturityWordCensor'
    );

    return res.json({
      success: true,
      ...buildUnifiedPreferences(updated)
    });
  } catch (error) {
    console.error('Update unified preferences error:', error);
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;
