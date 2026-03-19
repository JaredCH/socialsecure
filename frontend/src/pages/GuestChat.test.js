import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import GuestChat from './GuestChat';
import { chatAPI } from '../utils/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-hot-toast', () => ({
  error: jest.fn(),
  success: jest.fn(),
  default: {
    error: jest.fn(),
    success: jest.fn()
  }
}));

jest.mock('../utils/realtime', () => ({
  joinRealtimeRoom: jest.fn(),
  leaveRealtimeRoom: jest.fn(),
  onChatMessage: jest.fn(() => () => {}),
  onFriendPresence: jest.fn(() => () => {}),
  onPresenceUpdate: jest.fn(() => () => {}),
  onRoomViewerJoin: jest.fn(() => () => {}),
  onRoomViewerLeave: jest.fn(() => () => {})
}));

jest.mock('../utils/e2ee', () => ({
  unlockOrCreateVault: jest.fn(),
  createWrappedRoomKeyPackage: jest.fn(),
  decryptEnvelope: jest.fn(),
  encryptEnvelope: jest.fn(),
  ingestWrappedRoomKeyPackage: jest.fn()
}));

jest.mock('../utils/api', () => ({
  authAPI: {
    getProfile: jest.fn(),
    verifyEncryptionPassword: jest.fn()
  },
  chatAPI: {
    getConversations: jest.fn(),
    getAllRooms: jest.fn(),
    getQuickAccessRooms: jest.fn(),
    getMessages: jest.fn(),
    getConversationMessages: jest.fn(),
    getConversationUsers: jest.fn(),
    getRoomUsers: jest.fn()
  },
  friendsAPI: {
    getFriends: jest.fn(),
    sendRequest: jest.fn()
  },
  moderationAPI: {
    blockUser: jest.fn()
  },
  userAPI: {
    getByUsername: jest.fn()
  }
}));

describe('GuestChat', () => {
  let container;
  let root;

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const renderGuestChat = async () => {
    await act(async () => {
      root.render(<GuestChat />);
      await flush();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    chatAPI.getAllRooms.mockResolvedValue({
      data: {
        rooms: [
          { _id: 'state-tx', type: 'state', name: 'Texas', discoveryGroup: 'states', state: 'TX' },
          { _id: 'topic-ai', type: 'topic', name: 'AI', discoveryGroup: 'topics' }
        ]
      }
    });
    chatAPI.getQuickAccessRooms.mockResolvedValue({
      data: {
        rooms: {
          zip: { _id: 'state-tx', type: 'state', name: 'Texas' },
          state: null,
          county: null,
          cities: []
        }
      }
    });

    chatAPI.getMessages.mockImplementation(async (roomId) => ({
      data: {
        messages: roomId === 'state-tx'
          ? [{ _id: 'm-state', content: 'hello texas', userId: { username: 'buddy' } }]
          : [{ _id: 'm-topic', content: 'hello ai', userId: { username: 'beta' } }]
      }
    }));
    chatAPI.getConversationUsers.mockResolvedValue({ data: { users: [] } });
    chatAPI.getRoomUsers.mockResolvedValue({ data: { users: [] } });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flush();
    });
    container.remove();
  });

  it('matches chat layout while disabling DM, reactions, and composer for guests', async () => {
    await renderGuestChat();

    expect(container.querySelector('[data-testid="chat-layout-grid"]')).not.toBeNull();
    expect(chatAPI.getAllRooms).toHaveBeenCalledWith(1, 500);
    expect(chatAPI.getQuickAccessRooms).toHaveBeenCalledTimes(2);

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
    expect(dmTab).toBeDefined();
    expect(dmTab.disabled).toBe(true);

    // Expand State Rooms to find Texas
    const stateChatsToggle = Array.from(container.querySelectorAll('button'))
      .find((btn) => btn.textContent.includes('State Rooms'));
    expect(stateChatsToggle).toBeDefined();
    await act(async () => {
      stateChatsToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const texasButton = container.querySelector('[data-discovery-state-summary="Texas"]');
    expect(texasButton).not.toBeNull();
    await act(async () => {
      texasButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(chatAPI.getAllRooms).toHaveBeenCalledWith(1, 500);
    expect(chatAPI.getMessages).toHaveBeenCalledWith('state-tx', 1, 40);
    expect(container.textContent).toContain('hello texas');

    const composer = container.querySelector('textarea');
    expect(composer).not.toBeNull();
    expect(composer.disabled).toBe(true);

    const firstMessage = Array.from(container.querySelectorAll('p')).find((node) => node.textContent.includes('hello texas'));
    expect(firstMessage).toBeDefined();
    await act(async () => {
      firstMessage.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(container.querySelector('[data-testid="reaction-picker-popup"]')).toBeNull();
  });
});
