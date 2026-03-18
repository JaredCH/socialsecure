const Notification = require('../models/Notification');
const User = require('../models/User');

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
    realtime: { enabled: true, typingIndicators: true, presence: true }
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

module.exports = {
  setNotificationIo,
  createNotification,
  getUserNotificationPreferences,
  toPayload
};
