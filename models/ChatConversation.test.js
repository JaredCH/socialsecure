const ChatConversation = require('./ChatConversation');

describe('ChatConversation model', () => {
  it('loads with default profileThreadAccess roles', () => {
    const conversation = new ChatConversation({ type: 'profile-thread' });

    expect(conversation.profileThreadAccess).toMatchObject({
      readRoles: ['friends', 'circles'],
      writeRoles: ['friends', 'circles']
    });
  });
});
