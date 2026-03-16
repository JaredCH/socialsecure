const ConversationMessage = require('./ConversationMessage');

describe('ConversationMessage.toPublicMessageShape', () => {
  it('keeps legacy DM plaintext content available when no E2EE envelope exists', () => {
    const publicMessage = ConversationMessage.toPublicMessageShape({
      _id: 'm1',
      conversationId: 'c1',
      userId: 'u1',
      content: 'Hello'
    }, { conversationType: 'dm' });

    expect(publicMessage.content).toBe('Hello');
    expect(publicMessage.e2ee).toBeNull();
    expect(publicMessage.isE2EE).toBe(false);
  });

  it('falls back to an empty string for legacy DM messages with missing content', () => {
    const publicMessage = ConversationMessage.toPublicMessageShape({
      _id: 'm2',
      conversationId: 'c1',
      userId: 'u1',
      content: null,
      e2ee: null
    }, { conversationType: 'dm' });

    expect(publicMessage.content).toBe('');
    expect(publicMessage.e2ee).toBeNull();
  });

  it('keeps encrypted placeholder for DM messages that have E2EE envelopes', () => {
    const publicMessage = ConversationMessage.toPublicMessageShape({
      _id: 'm3',
      conversationId: 'c1',
      userId: 'u1',
      content: 'Hello',
      e2ee: { enabled: true, ciphertext: 'abc', nonce: 'nonce' }
    }, { conversationType: 'dm' });

    expect(publicMessage.content).toBe('[Encrypted message]');
    expect(publicMessage.isE2EE).toBe(true);
    expect(publicMessage.e2ee).not.toBeNull();
  });
});
