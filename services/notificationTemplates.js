/**
 * Notification Template Registry
 *
 * Centralises every domain-event → notification mapping in one place.
 * Each template defines:
 *   - category        preference-key used for user opt-in/out
 *   - priority        'low' | 'normal' | 'high' | 'critical'
 *   - groupBy(ctx)    returns the groupKey stored on the notification
 *   - deliveryDefaults default channel flags when the user has no preference
 *   - title(ctx)      builds the notification title  (≤100 chars)
 *   - body(ctx)       builds the notification body   (≤500 chars)
 *   - deepLink(ctx)   returns a URL path for frontend navigation
 *   - data(ctx)       returns the extra data payload
 */

const TEMPLATES = {
  /* ── Feed ─────────────────────────────────────────────── */

  like: {
    category: 'likes',
    priority: 'normal',
    groupBy: (ctx) => `like:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: false, push: false },
    title: () => 'New like',
    body: (ctx) => `${ctx.senderLabel || 'Someone'} liked your post`,
    deepLink: () => '/social',
    data: (ctx) => ({ postId: ctx.postId || null, url: '/social' })
  },

  comment: {
    category: 'comments',
    priority: 'normal',
    groupBy: (ctx) => `comment:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: true, push: false },
    title: () => 'New comment',
    body: (ctx) => `${ctx.senderLabel || 'Someone'} commented on your post`,
    deepLink: () => '/social',
    data: (ctx) => ({
      postId: ctx.postId || null,
      commentId: ctx.commentId || null,
      url: '/social'
    })
  },

  mention: {
    category: 'mentions',
    priority: 'normal',
    groupBy: (ctx) => `mention:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: true, push: false },
    title: () => 'You were mentioned',
    body: (ctx) => {
      const where = ctx.roomName || ctx.conversationTitle || 'a comment';
      return `${ctx.senderLabel || 'Someone'} mentioned you in ${where}`;
    },
    deepLink: (ctx) => ctx.roomId ? '/chat' : '/social',
    data: (ctx) => ({
      postId: ctx.postId || null,
      commentId: ctx.commentId || null,
      messageId: ctx.messageId || null,
      roomId: ctx.roomId || null,
      url: ctx.roomId ? '/chat' : '/social'
    })
  },

  /* ── Friends / Social ─────────────────────────────────── */

  follow: {
    category: 'follows',
    priority: 'normal',
    groupBy: (ctx) => `follow:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: false, push: false },
    title: () => 'New follow request',
    body: (ctx) => `${ctx.senderLabel || 'Someone'} sent you a follow request`,
    deepLink: () => '/social',
    data: () => ({ url: '/social' })
  },

  friend_request_accepted: {
    category: 'system',
    priority: 'normal',
    groupBy: (ctx) => `system:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: true, push: false },
    title: () => 'Friend request accepted',
    body: (ctx) => `${ctx.senderLabel || 'Someone'} accepted your friend request`,
    deepLink: () => '/social',
    data: () => ({ url: '/social' })
  },

  friend_request_declined: {
    category: 'system',
    priority: 'low',
    groupBy: (ctx) => `system:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: true, push: false },
    title: () => 'Friend request declined',
    body: (ctx) => `${ctx.senderLabel || 'Someone'} declined your friend request`,
    deepLink: () => '/friends',
    data: () => ({ url: '/friends' })
  },

  friend_request_canceled: {
    category: 'system',
    priority: 'low',
    groupBy: (ctx) => `system:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: true, push: false },
    title: () => 'Friend request canceled',
    body: (ctx) => `${ctx.senderLabel || 'Someone'} canceled a friend request`,
    deepLink: () => '/friends',
    data: () => ({ url: '/friends' })
  },

  partner_request: {
    category: 'partnerRequests',
    priority: 'normal',
    groupBy: (ctx) => `partner_request:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: true, push: false },
    title: () => 'Partner/Spouse Request',
    body: (ctx) => `@${ctx.senderLabel || 'Someone'} sent you a partner/spouse request`,
    deepLink: () => '/friends',
    data: () => ({ url: '/friends' })
  },

  partner_response: {
    category: 'partnerRequests',
    priority: 'normal',
    groupBy: (ctx) => `partner_response:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: true, push: false },
    title: (ctx) => ctx.accepted ? 'Partner Request Accepted' : 'Partner Request Declined',
    body: (ctx) => {
      const action = ctx.accepted ? 'accepted' : 'declined';
      return `@${ctx.senderLabel || 'Someone'} ${action} your partner/spouse request`;
    },
    deepLink: () => '/friends',
    data: () => ({ url: '/friends' })
  },

  /* ── Chat ──────────────────────────────────────────────── */

  message: {
    category: 'messages',
    priority: 'normal',
    groupBy: (ctx) => `message:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: false, push: false },
    title: () => 'New message',
    body: (ctx) => `${ctx.senderLabel || 'Someone'} sent you a message`,
    deepLink: () => '/chat',
    data: (ctx) => ({
      messageId: ctx.messageId || null,
      roomId: ctx.roomId || null,
      url: '/chat'
    })
  },

  conversation_deleted: {
    category: 'system',
    priority: 'low',
    groupBy: (ctx) => `system:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: true, push: false },
    title: () => 'Conversation deleted',
    body: (ctx) => `@${ctx.senderLabel || 'Someone'} deleted a direct message conversation with you.`,
    deepLink: () => '/chat',
    data: () => ({ url: '/chat' })
  },

  /* ── Marketplace ───────────────────────────────────────── */

  market_transaction: {
    category: 'system',
    priority: 'normal',
    groupBy: (ctx) => `market_transaction:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: true, push: false },
    title: (ctx) => ctx.transactionTitle || 'Transaction Update',
    body: (ctx) => ctx.transactionBody || 'You have a marketplace transaction update.',
    deepLink: (ctx) => ctx.deepLinkUrl || '/market?tab=transactions',
    data: (ctx) => ({
      listingId: ctx.listingId || null,
      transactionId: ctx.transactionId || null,
      url: ctx.deepLinkUrl || '/market?tab=transactions'
    })
  },

  /* ── System / Security ─────────────────────────────────── */

  system: {
    category: 'system',
    priority: 'normal',
    groupBy: (ctx) => `system:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: true, push: false },
    title: (ctx) => ctx.customTitle || 'System notification',
    body: (ctx) => ctx.customBody || '',
    deepLink: (ctx) => ctx.deepLinkUrl || '/',
    data: (ctx) => ({ url: ctx.deepLinkUrl || '/' })
  },

  security_alert: {
    category: 'securityAlerts',
    priority: 'critical',
    groupBy: () => 'security_alert:system',
    deliveryDefaults: { inApp: true, email: true, push: true },
    title: (ctx) => ctx.customTitle || 'Security Alert',
    body: (ctx) => ctx.customBody || 'A security event was detected on your account.',
    deepLink: () => '/settings#security',
    data: () => ({ url: '/settings#security' })
  },

  friend_post: {
    category: 'friendPosts',
    priority: 'low',
    groupBy: (ctx) => `friend_post:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: false, push: false },
    title: () => 'Friend posted',
    body: (ctx) => `${ctx.senderLabel || 'A friend'} shared a new post`,
    deepLink: () => '/social',
    data: (ctx) => ({ postId: ctx.postId || null, url: '/social' })
  },

  top5_added: {
    category: 'top5',
    priority: 'normal',
    groupBy: (ctx) => `top5_added:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: false, push: false },
    title: () => 'Added to Top 5',
    body: (ctx) => `${ctx.senderLabel || 'Someone'} added you to their Top 5 friends`,
    deepLink: () => '/social',
    data: () => ({ url: '/social' })
  },

  top5_removed: {
    category: 'top5',
    priority: 'low',
    groupBy: (ctx) => `top5_removed:${String(ctx.senderId || 'system')}`,
    deliveryDefaults: { inApp: true, email: false, push: false },
    title: () => 'Removed from Top 5',
    body: (ctx) => `${ctx.senderLabel || 'Someone'} removed you from their Top 5 friends`,
    deepLink: () => '/social',
    data: () => ({ url: '/social' })
  }
};

/**
 * Look up a template by event name.
 * Falls back to the generic 'system' template for unknown events.
 */
const getTemplate = (event) => TEMPLATES[event] || TEMPLATES.system;

/**
 * List all registered template keys.
 */
const listEvents = () => Object.keys(TEMPLATES);

/**
 * Resolve the Notification-model `type` for a given event.
 * "Sub-events" like friend_request_accepted map back to 'system'.
 */
const ALLOWED_MODEL_TYPES = new Set([
  'like', 'comment', 'mention', 'follow', 'message', 'system',
  'security_alert', 'market_transaction',
  'friend_post', 'top5_added', 'top5_removed',
  'partner_request', 'partner_response'
]);

const resolveModelType = (event) => (ALLOWED_MODEL_TYPES.has(event) ? event : 'system');

module.exports = { TEMPLATES, getTemplate, listEvents, resolveModelType };
