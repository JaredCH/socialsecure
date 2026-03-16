const ConversationMessage = require('./ConversationMessage');

describe('ConversationMessage.toPublicMessageShape', () => {
  it('keeps legacy DM plaintext content available when no E2EE envelope exists', () => {
    const publicMessage = ConversationMessage.toPublicMessageShape({
      _id: 'm1',
      conversationId: 'c1',
      userId: 'u1',
      content: 'Hello',
      e2ee: { enabled: false }
    }, { conversationType: 'dm' });

    expect(publicMessage.content).toBe('Hello');
    expect(publicMessage.e2ee).toBeNull();
    expect(publicMessage.isE2EE).toBe(false);
  });
});
