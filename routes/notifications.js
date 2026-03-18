const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const { getUserNotificationPreferences, toPayload } = require('../services/notifications');
const { normalizeRealtimePreferences } = require('../utils/realtimePreferences');

const User = require('../models/User');
const Session = require('../models/Session');
const Notification = require('../models/Notification');

const router = express.Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const hashToken = (token = '') => require('crypto').createHash('sha256').update(token).digest('hex');

const decrementUnreadCount = async (userId) => {
  await User.updateOne({ _id: userId }, { $inc: { unreadNotificationCount: -1 } });
  await User.updateOne(
    { _id: userId, unreadNotificationCount: { $lt: 0 } },
    { $set: { unreadNotificationCount: 0 } }
  );
};

const getUserFromBearerToken = async (req, select = '') => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return { error: 'No token provided', status: 401 };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');

    const tokenHash = hashToken(token);
    const session = await Session.findOne({ userId: decoded.userId, tokenHash, isRevoked: false });
    if (!session) {
      return { error: 'Session expired or revoked', status: 401 };
    }

    session.lastActivity = new Date();
    await session.save();

    const user = await User.findById(decoded.userId).select(select);
    if (!user) {
      return { error: 'User not found', status: 404 };
    }

    return { user };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
};

const authenticateToken = async (req, res, next) => {
  const auth = await getUserFromBearerToken(req, 'notificationPreferences realtimePreferences unreadNotificationCount');
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  req.user = auth.user;
  next();
};

router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const skip = (page - 1) * limit;

    const filter = { recipientId: req.user._id, status: 'active' };
    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter)
    ]);

    const hasMore = skip + notifications.length < total;

    return res.json({
      notifications,
      pagination: {
        page,
        limit,
        hasMore,
        total
      }
    });
  } catch (error) {
    console.error('Notifications list error:', error);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.get('/unread-count', authenticateToken, async (req, res) => {
  return res.json({ count: req.user.unreadNotificationCount || 0 });
});

router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipientId: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();

      await decrementUnreadCount(req.user._id);
    }

    return res.json({ success: true, notification: toPayload(notification) });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const result = await Notification.updateMany(
      { recipientId: req.user._id, isRead: false },
      { $set: { isRead: true, readAt: now } }
    );

    await User.updateOne(
      { _id: req.user._id },
      { $set: { unreadNotificationCount: 0 } }
    );

    return res.json({
      success: true,
      updatedCount: result.modifiedCount || 0
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipientId: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const wasUnread = !notification.isRead;
    await notification.deleteOne();

    if (wasUnread) {
      await decrementUnreadCount(req.user._id);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete notification error:', error);
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
});

router.put('/:id/acknowledge', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipientId: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const wasUnread = !notification.isRead;
    notification.status = 'acknowledged';
    notification.acknowledgedAt = new Date();
    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
    }
    await notification.save();

    if (wasUnread) {
      await decrementUnreadCount(req.user._id);
    }

    return res.json({ success: true, notification: toPayload(notification) });
  } catch (error) {
    console.error('Acknowledge notification error:', error);
    return res.status(500).json({ error: 'Failed to acknowledge notification' });
  }
});

router.put('/:id/dismiss', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipientId: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const wasUnread = !notification.isRead;
    notification.status = 'dismissed';
    notification.dismissedAt = new Date();
    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
    }
    await notification.save();

    if (wasUnread) {
      await decrementUnreadCount(req.user._id);
    }

    return res.json({ success: true, notification: toPayload(notification) });
  } catch (error) {
    console.error('Dismiss notification error:', error);
    return res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const skip = (page - 1) * limit;

    const filter = {
      recipientId: req.user._id,
      status: { $in: ['acknowledged', 'dismissed'] }
    };

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter)
    ]);

    const hasMore = skip + notifications.length < total;

    return res.json({
      notifications,
      pagination: {
        page,
        limit,
        hasMore,
        total
      }
    });
  } catch (error) {
    console.error('Notification history error:', error);
    return res.status(500).json({ error: 'Failed to load notification history' });
  }
});

router.get('/preferences', authenticateToken, async (req, res) => {
  return res.json({
    preferences: getUserNotificationPreferences(req.user),
    realtimePreferences: normalizeRealtimePreferences(req.user.realtimePreferences)
  });
});

router.put('/preferences', [
  authenticateToken,
  body('likes').optional().isObject(),
  body('comments').optional().isObject(),
  body('mentions').optional().isObject(),
  body('follows').optional().isObject(),
  body('messages').optional().isObject(),
  body('system').optional().isObject(),
  body('securityAlerts').optional().isObject(),
  body('friendPosts').optional().isObject(),
  body('top5').optional().isObject(),
  body('partnerRequests').optional().isObject(),
  body('realtime').optional().isObject()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const existing = getUserNotificationPreferences(req.user);
    const input = req.body || {};

    const mergePreference = (key) => {
      const incoming = input[key];
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return existing[key];
      }

      return {
        inApp: typeof incoming.inApp === 'boolean' ? incoming.inApp : existing[key].inApp,
        email: typeof incoming.email === 'boolean' ? incoming.email : existing[key].email,
        push: typeof incoming.push === 'boolean' ? incoming.push : existing[key].push
      };
    };

    const updatedPreferences = {
      likes: mergePreference('likes'),
      comments: mergePreference('comments'),
      mentions: mergePreference('mentions'),
      follows: mergePreference('follows'),
      messages: mergePreference('messages'),
      system: mergePreference('system'),
      securityAlerts: mergePreference('securityAlerts'),
      friendPosts: mergePreference('friendPosts'),
      top5: mergePreference('top5'),
      partnerRequests: mergePreference('partnerRequests'),
      realtime: {
        enabled: typeof input?.realtime?.enabled === 'boolean'
          ? input.realtime.enabled
          : Boolean(existing?.realtime?.enabled ?? true),
        typingIndicators: typeof input?.realtime?.typingIndicators === 'boolean'
          ? input.realtime.typingIndicators
          : Boolean(existing?.realtime?.typingIndicators ?? true),
        presence: typeof input?.realtime?.presence === 'boolean'
          ? input.realtime.presence
          : Boolean(existing?.realtime?.presence ?? true)
      }
    };

    const updatedRealtimePreferences = normalizeRealtimePreferences(req.body?.realtime || req.user.realtimePreferences);

    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          notificationPreferences: updatedPreferences,
          realtimePreferences: updatedRealtimePreferences
        }
      }
    );

    return res.json({
      success: true,
      preferences: updatedPreferences,
      realtimePreferences: updatedRealtimePreferences
    });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    return res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

module.exports = router;
