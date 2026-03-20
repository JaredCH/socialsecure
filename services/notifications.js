const Notification = require('../models/Notification');
const DeliveryAttempt = require('../models/DeliveryAttempt');
const User = require('../models/User');
const { getTemplate, resolveModelType } = require('./notificationTemplates');

let ioInstance = null;

const preferenceMap = {
  like: 'likes',
  comment: 'comments',
  mention: 'mentions',
  follow: 'follows',
  message: 'messages',
  system: 'system',
  security_alert: 'securityAlerts',
  market_transaction: 'system',
  friend_post: 'friendPosts',
  top5_added: 'top5',
  top5_removed: 'top5',
  partner_request: 'partnerRequests',
  partner_response: 'partnerRequests'
};

const clampText = (value, max) => String(value || '').trim().slice(0, max);

const toPayload = (notification) => ({
  _id: notification._id,
  recipientId: notification.recipientId,
  senderId: notification.senderId,
  type: notification.type,
  event: notification.event || null,
  category: notification.category || null,
  priority: notification.priority || 'normal',
  title: notification.title,
  body: notification.body,
  data: {
    ...(notification.data || {}),
    listingId: notification.data?.listingId || null,
    transactionId: notification.data?.transactionId || null
  },
  channels: notification.channels,
  isRead: notification.isRead,
  readAt: notification.readAt,
  status: notification.status || 'active',
  acknowledgedAt: notification.acknowledgedAt || null,
  dismissedAt: notification.dismissedAt || null,
  groupKey: notification.groupKey || null,
  createdAt: notification.createdAt
});

const getUserNotificationPreferences = (user) => {
  const defaults = {
    likes: { inApp: true, email: false, push: false },
    comments: { inApp: true, email: true, push: false },
    mentions: { inApp: true, email: true, push: false },
    follows: { inApp: true, email: false, push: false },
    messages: { inApp: true, email: false, push: false },
    system: { inApp: true, email: true, push: false },
    securityAlerts: { inApp: true, email: true, push: false },
    friendPosts: { inApp: true, email: false, push: false },
    top5: { inApp: true, email: false, push: false },
    partnerRequests: { inApp: true, email: true, push: false },
    realtime: { enabled: true, typingIndicators: true, presence: true },
    quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC' },
    digestMode: { enabled: false, frequency: 'daily' }
  };

  const candidate = user?.notificationPreferences;
  if (!candidate || typeof candidate !== 'object') {
    return defaults;
  }

  const normalized = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (!candidate[key] || typeof candidate[key] !== 'object') continue;
    if (key === 'realtime') {
      normalized[key] = {
        enabled: typeof candidate[key].enabled === 'boolean' ? candidate[key].enabled : defaults[key].enabled,
        typingIndicators: typeof candidate[key].typingIndicators === 'boolean'
          ? candidate[key].typingIndicators
          : defaults[key].typingIndicators,
        presence: typeof candidate[key].presence === 'boolean'
          ? candidate[key].presence
          : defaults[key].presence
      };
      continue;
    }
    if (key === 'quietHours') {
      normalized[key] = {
        enabled: typeof candidate[key].enabled === 'boolean' ? candidate[key].enabled : defaults[key].enabled,
        start: typeof candidate[key].start === 'string' ? candidate[key].start : defaults[key].start,
        end: typeof candidate[key].end === 'string' ? candidate[key].end : defaults[key].end,
        timezone: typeof candidate[key].timezone === 'string' ? candidate[key].timezone : defaults[key].timezone
      };
      continue;
    }
    if (key === 'digestMode') {
      normalized[key] = {
        enabled: typeof candidate[key].enabled === 'boolean' ? candidate[key].enabled : defaults[key].enabled,
        frequency: ['daily', 'weekly'].includes(candidate[key].frequency) ? candidate[key].frequency : defaults[key].frequency
      };
      continue;
    }

    normalized[key] = {
      inApp: typeof candidate[key].inApp === 'boolean' ? candidate[key].inApp : defaults[key].inApp,
      email: typeof candidate[key].email === 'boolean' ? candidate[key].email : defaults[key].email,
      push: typeof candidate[key].push === 'boolean' ? candidate[key].push : defaults[key].push
    };
  }

  return normalized;
};

const setNotificationIo = (io) => {
  ioInstance = io;
};

const emitRealtime = (recipientId, payload) => {
  if (!ioInstance) return;
  ioInstance.to(`user:${String(recipientId)}`).emit('notification', payload);
};

/**
 * Check whether the current time falls inside the user's quiet hours.
 * NOTE: Currently evaluates in UTC. The timezone field is stored for future
 * use when a timezone library (e.g. luxon) is added.
 */
const isInQuietHours = (preferences) => {
  const qh = preferences?.quietHours;
  if (!qh || !qh.enabled) return false;

  const now = new Date();
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const current = hours * 60 + minutes;

  const [startH, startM] = (qh.start || '22:00').split(':').map(Number);
  const [endH, endM] = (qh.end || '08:00').split(':').map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;

  if (start <= end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
};

/**
 * Record delivery attempts for each enabled channel.
 */
const recordDeliveryAttempts = async (notificationId, recipientId, channels) => {
  const attempts = [];
  for (const [channel, enabled] of Object.entries(channels)) {
    if (!enabled) continue;
    attempts.push({
      notificationId,
      recipientId,
      channel,
      status: channel === 'inApp' ? 'delivered' : 'pending',
      deliveredAt: channel === 'inApp' ? new Date() : null,
      attempt: 1,
      maxAttempts: channel === 'inApp' ? 1 : 3
    });
  }
  if (attempts.length > 0) {
    await DeliveryAttempt.insertMany(attempts);
  }
  return attempts;
};

/**
 * Legacy createNotification – retained for backward compatibility.
 * New code should prefer `publish()`.
 */
const createNotification = async ({
  recipientId,
  senderId = null,
  type,
  title,
  body = '',
  data = {},
  forceChannels = null
}) => {
  if (!recipientId || !type || !title) {
    return null;
  }

  if (senderId && String(senderId) === String(recipientId)) {
    return null;
  }

  const recipient = await User.findById(recipientId)
    .select('notificationPreferences unreadNotificationCount registrationStatus')
    .lean();

  if (!recipient || recipient.registrationStatus !== 'active') {
    return null;
  }

  const preferences = getUserNotificationPreferences(recipient);
  const preferenceKey = preferenceMap[type] || 'system';
  const prefChannels = preferences[preferenceKey] || { inApp: true, email: false, push: false };

  const channels = forceChannels || {
    inApp: !!prefChannels.inApp,
    email: !!prefChannels.email,
    push: !!prefChannels.push
  };

  const groupKey = `${type}:${String(senderId || 'system')}`;

  const notification = await Notification.create({
    recipientId,
    senderId,
    type,
    title: clampText(title, 100),
    body: clampText(body, 500),
    data: {
      postId: data.postId || null,
      commentId: data.commentId || null,
      messageId: data.messageId || null,
      roomId: data.roomId || null,
      url: clampText(data.url, 500),
      listingId: data.listingId || null,
      transactionId: data.transactionId || null
    },
    channels,
    isRead: channels.inApp ? false : true,
    readAt: channels.inApp ? null : new Date(),
    status: 'active',
    groupKey
  });

  if (channels.inApp) {
    await User.updateOne(
      { _id: recipientId },
      { $inc: { unreadNotificationCount: 1 } }
    );

    emitRealtime(recipientId, toPayload(notification));
  }

  return notification;
};

/**
 * Unified publish API – the primary entry-point for creating notifications.
 *
 * @param {string}  event       template key (e.g. 'like', 'comment', 'follow')
 * @param {Object}  context     data bag passed to every template builder
 * @param {Object}  [overrides] optional: { title, body, forceChannels, data }
 * @returns {Notification|null}
 */
const publish = async (event, context = {}, overrides = {}) => {
  const { recipientId, senderId = null } = context;
  if (!recipientId) return null;
  if (senderId && String(senderId) === String(recipientId)) return null;

  const template = getTemplate(event);
  const modelType = resolveModelType(event);

  const recipient = await User.findById(recipientId)
    .select('notificationPreferences unreadNotificationCount registrationStatus')
    .lean();

  if (!recipient || recipient.registrationStatus !== 'active') return null;

  const preferences = getUserNotificationPreferences(recipient);
  const preferenceKey = template.category || preferenceMap[modelType] || 'system';
  const prefChannels = preferences[preferenceKey] || template.deliveryDefaults;

  const channels = overrides.forceChannels || {
    inApp: !!prefChannels.inApp,
    email: !!prefChannels.email,
    push: !!prefChannels.push
  };

  // Quiet-hours: for non-critical notifications, suppress non-inApp channels
  if (template.priority !== 'critical' && isInQuietHours(preferences)) {
    channels.email = false;
    channels.push = false;
  }

  const title = clampText(overrides.title || template.title(context), 100);
  const body = clampText(overrides.body || template.body(context), 500);
  const groupKey = template.groupBy(context);
  const templateData = template.data(context);
  const mergedData = {
    postId: templateData.postId || null,
    commentId: templateData.commentId || null,
    messageId: templateData.messageId || null,
    roomId: templateData.roomId || null,
    url: clampText(templateData.url || template.deepLink(context), 500),
    listingId: templateData.listingId || null,
    transactionId: templateData.transactionId || null,
    ...(overrides.data || {})
  };

  const notification = await Notification.create({
    recipientId,
    senderId,
    type: modelType,
    event,
    category: template.category,
    priority: template.priority,
    title,
    body,
    data: mergedData,
    channels,
    isRead: channels.inApp ? false : true,
    readAt: channels.inApp ? null : new Date(),
    status: 'active',
    groupKey
  });

  // Record delivery attempts
  await recordDeliveryAttempts(notification._id, recipientId, channels);

  if (channels.inApp) {
    await User.updateOne(
      { _id: recipientId },
      { $inc: { unreadNotificationCount: 1 } }
    );
    emitRealtime(recipientId, toPayload(notification));
  }

  return notification;
};

module.exports = {
  setNotificationIo,
  createNotification,
  publish,
  getUserNotificationPreferences,
  toPayload,
  isInQuietHours,
  recordDeliveryAttempts
};
