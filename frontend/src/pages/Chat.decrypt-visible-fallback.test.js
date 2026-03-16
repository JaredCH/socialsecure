import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Chat from './Chat';
import { authAPI, chatAPI, friendsAPI } from '../utils/api';
import { decryptEnvelope, unlockOrCreateVault } from '../utils/e2ee';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../components/chat/ChatMessageList', () => (props) => (
  <div data-testid="mock-chat-message-list">
    {(Array.isArray(props.messages) ? props.messages : []).map((message) => (
      <p key={String(message._id)}>{message.content}</p>
    ))}
  </div>
));

jest.mock('../utils/api', () => ({
  authAPI: {
    getProfile: jest.fn(),
    verifyEncryptionPassword: jest.fn()
  },
  chatAPI: {
    getConversations: jest.fn(),
    getConversationMessages: jest.fn(),
    getConversationUsers: jest.fn(),
    syncConversationKeyPackages: jest.fn(),
    registerDeviceKeys: jest.fn()
  },
  friendsAPI: {
    getFriends: jest.fn().mockResolvedValue({ data: { friends: [] } })
  },
  moderationAPI: {
    blockUser: jest.fn()
  },
  userAPI: {
    search: jest.fn()
  }
}));

jest.mock('../utils/e2ee', () => ({
  unlockOrCreateVault: jest.fn(),
  encryptEnvelope: jest.fn(),
  decryptEnvelope: jest.fn(),
  createWrappedRoomKeyPackage: jest.fn(),
  ingestWrappedRoomKeyPackage: jest.fn()
}));

jest.mock('../utils/realtime', () => ({
  joinRealtimeRoom: jest.fn(),
  leaveRealtimeRoom: jest.fn(),
  onChatMessage: jest.fn(() => () => {})
}));

describe('Chat DM decrypt fallback when visible ids are unavailable', () => {
  let container;
  let root;

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const setInputValue = (input, value) => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    document.cookie = 'socialsecure_dm_unlock_v1=; Max-Age=0; Path=/';

    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    authAPI.verifyEncryptionPassword.mockResolvedValue({ data: { success: true } });

    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({
      data: {
        messages: [{
          _id: 'dm-message-1',
          content: '[Encrypted message]',
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: new Date().toISOString(),
          e2ee: {
            ciphertext: 'cipher',
            nonce: 'nonce',
            aad: '',
            keyVersion: 1,
            senderDeviceId: 'device-2',
            clientMessageId: 'client-1',
            signature: 'sig',
            ciphertextHash: 'h'.repeat(64)
          }
        }],
        hasMore: false
      }
    });
    chatAPI.getConversationUsers.mockResolvedValue({ data: { users: [] } });
    chatAPI.syncConversationKeyPackages.mockResolvedValue({ data: { packages: [] } });
    chatAPI.registerDeviceKeys.mockResolvedValue({ data: { success: true } });
    friendsAPI.getFriends.mockResolvedValue({ data: { friends: [] } });

    unlockOrCreateVault.mockResolvedValue({
      session: {
        deviceId: 'device-1',
        getRegisterPayload: jest.fn().mockResolvedValue({
          deviceId: 'device-1',
          keyVersion: 1,
          publicEncryptionKey: '{}',
          publicSigningKey: '{}',
          algorithms: { encryption: 'ECDH-P256', signing: 'ECDSA-P256-SHA256' }
        }),
        persist: jest.fn().mockResolvedValue(undefined)
      }
    });
    decryptEnvelope.mockResolvedValue('decrypted via fallback');

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('decrypts and replaces encrypted placeholder after unlock even without visible id callbacks', async () => {
    await act(async () => {
      root.render(<Chat />);
      await flush();
      await flush();
    });

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const passwordInput = container.querySelector('input[aria-label="Encryption password"]');
    await act(async () => {
      setInputValue(passwordInput, 'secret-password');
      await flush();
    });

    const unlockButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Unlock');
    await act(async () => {
      unlockButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      await flush();
    });

    expect(decryptEnvelope).toHaveBeenCalled();
    expect(container.textContent).toContain('decrypted via fallback');
    expect(container.textContent).not.toContain('[Encrypted message]');
  });
});
