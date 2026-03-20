const {
  TEMPLATES,
  getTemplate,
  listEvents,
  resolveModelType
} = require('./notificationTemplates');

describe('notificationTemplates', () => {
  describe('getTemplate', () => {
    it('returns the matching template for a known event', () => {
      const t = getTemplate('like');
      expect(t).toBeDefined();
      expect(t.category).toBe('likes');
      expect(t.priority).toBe('normal');
    });

    it('falls back to the system template for an unknown event', () => {
      const t = getTemplate('nonexistent_event');
      expect(t).toBe(TEMPLATES.system);
    });
  });

  describe('listEvents', () => {
    it('returns all registered template keys', () => {
      const events = listEvents();
      expect(events).toContain('like');
      expect(events).toContain('comment');
      expect(events).toContain('mention');
      expect(events).toContain('follow');
      expect(events).toContain('message');
      expect(events).toContain('system');
      expect(events).toContain('security_alert');
      expect(events).toContain('market_transaction');
      expect(events).toContain('friend_post');
      expect(events).toContain('top5_added');
      expect(events).toContain('top5_removed');
      expect(events).toContain('partner_request');
      expect(events).toContain('partner_response');
      expect(events).toContain('friend_request_accepted');
      expect(events).toContain('friend_request_declined');
      expect(events).toContain('friend_request_canceled');
      expect(events).toContain('conversation_deleted');
    });
  });

  describe('resolveModelType', () => {
    it('returns the event itself when it is a valid model type', () => {
      expect(resolveModelType('like')).toBe('like');
      expect(resolveModelType('comment')).toBe('comment');
      expect(resolveModelType('mention')).toBe('mention');
      expect(resolveModelType('system')).toBe('system');
      expect(resolveModelType('security_alert')).toBe('security_alert');
    });

    it('returns system for sub-events that map back to system', () => {
      expect(resolveModelType('friend_request_accepted')).toBe('system');
      expect(resolveModelType('friend_request_declined')).toBe('system');
      expect(resolveModelType('friend_request_canceled')).toBe('system');
      expect(resolveModelType('conversation_deleted')).toBe('system');
    });

    it('returns system for unknown events', () => {
      expect(resolveModelType('totally_unknown')).toBe('system');
    });
  });

  describe('template builders', () => {
    const ctx = {
      senderId: 'user-1',
      senderLabel: 'alice',
      postId: 'post-1',
      commentId: 'comment-1',
      messageId: 'msg-1',
      roomId: 'room-1',
      roomName: 'General',
      conversationTitle: 'DM Chat',
      listingId: 'listing-1',
      transactionId: 'txn-1',
      transactionTitle: 'Transaction Request',
      transactionBody: 'You have a new transaction.',
      customTitle: 'Custom Title',
      customBody: 'Custom Body',
      deepLinkUrl: '/custom',
      accepted: true
    };

    it('like template produces expected title, body, data', () => {
      const t = TEMPLATES.like;
      expect(t.title(ctx)).toBe('New like');
      expect(t.body(ctx)).toBe('alice liked your post');
      expect(t.deepLink(ctx)).toBe('/social');
      expect(t.data(ctx)).toEqual({ postId: 'post-1', url: '/social' });
      expect(t.groupBy(ctx)).toBe('like:user-1');
    });

    it('comment template produces expected output', () => {
      const t = TEMPLATES.comment;
      expect(t.title(ctx)).toBe('New comment');
      expect(t.body(ctx)).toBe('alice commented on your post');
      expect(t.data(ctx)).toEqual({ postId: 'post-1', commentId: 'comment-1', url: '/social' });
    });

    it('mention template uses roomName if present', () => {
      const t = TEMPLATES.mention;
      expect(t.body(ctx)).toBe('alice mentioned you in General');
      expect(t.deepLink(ctx)).toBe('/chat');
    });

    it('mention template uses conversationTitle when no roomId', () => {
      const t = TEMPLATES.mention;
      const noRoom = { ...ctx, roomId: null, roomName: null };
      expect(t.body(noRoom)).toBe('alice mentioned you in DM Chat');
      expect(t.deepLink(noRoom)).toBe('/social');
    });

    it('follow template produces expected output', () => {
      const t = TEMPLATES.follow;
      expect(t.title(ctx)).toBe('New follow request');
      expect(t.body(ctx)).toBe('alice sent you a follow request');
    });

    it('partner_response uses accepted flag', () => {
      const t = TEMPLATES.partner_response;
      expect(t.title({ ...ctx, accepted: true })).toBe('Partner Request Accepted');
      expect(t.title({ ...ctx, accepted: false })).toBe('Partner Request Declined');
      expect(t.body({ ...ctx, accepted: true })).toBe('@alice accepted your partner/spouse request');
      expect(t.body({ ...ctx, accepted: false })).toBe('@alice declined your partner/spouse request');
    });

    it('market_transaction template uses context fields', () => {
      const t = TEMPLATES.market_transaction;
      expect(t.title(ctx)).toBe('Transaction Request');
      expect(t.body(ctx)).toBe('You have a new transaction.');
      expect(t.data(ctx).listingId).toBe('listing-1');
      expect(t.data(ctx).transactionId).toBe('txn-1');
    });

    it('system template uses customTitle and customBody', () => {
      const t = TEMPLATES.system;
      expect(t.title(ctx)).toBe('Custom Title');
      expect(t.body(ctx)).toBe('Custom Body');
      expect(t.deepLink(ctx)).toBe('/custom');
    });

    it('security_alert has critical priority', () => {
      expect(TEMPLATES.security_alert.priority).toBe('critical');
      expect(TEMPLATES.security_alert.deliveryDefaults.push).toBe(true);
    });

    it('every template has required builder functions', () => {
      for (const [key, template] of Object.entries(TEMPLATES)) {
        expect(typeof template.title).toBe('function');
        expect(typeof template.body).toBe('function');
        expect(typeof template.deepLink).toBe('function');
        expect(typeof template.data).toBe('function');
        expect(typeof template.groupBy).toBe('function');
        expect(typeof template.category).toBe('string');
        expect(typeof template.priority).toBe('string');
        expect(template.deliveryDefaults).toBeDefined();
      }
    });
  });
});
