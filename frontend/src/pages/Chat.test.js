import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Chat from './Chat';
import { authAPI, chatAPI, friendsAPI, moderationAPI } from '../utils/api';
import { createWrappedRoomKeyPackage, decryptEnvelope, encryptEnvelope, ingestWrappedRoomKeyPackage, unlockOrCreateVault } from '../utils/e2ee';
import { onChatMessage, onFriendPresence, onPresenceUpdate } from '../utils/realtime';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let mockRealtimeChatHandler = null;

jest.mock('../utils/api', () => ({
  authAPI: {
    getProfile: jest.fn(),
    verifyEncryptionPassword: jest.fn()
  },
  chatAPI: {
    getConversations: jest.fn(),
    getConversationMessages: jest.fn(),
    getConversationUsers: jest.fn(),
    getConversationDevices: jest.fn(),
    sendConversationMessage: jest.fn(),
    sendConversationE2EEMessage: jest.fn(),
    publishConversationKeyPackages: jest.fn(),
    syncConversationKeyPackages: jest.fn(),
    registerDeviceKeys: jest.fn(),
    syncLocationRooms: jest.fn(),
    getAllRooms: jest.fn(),
    joinRoom: jest.fn(),
    getMessages: jest.fn(),
    getRoomUsers: jest.fn(),
    sendMessage: jest.fn(),
    startDM: jest.fn(),
    getProfileThread: jest.fn(),
    deleteRoom: jest.fn()
  },
  friendsAPI: {
    sendRequest: jest.fn(),
    getFriends: jest.fn()
  },
  moderationAPI: {
    blockUser: jest.fn(),
    muteUserByAdmin: jest.fn(),
    unmuteUserByAdmin: jest.fn(),
    removeMessageByAdmin: jest.fn(),
    restoreMessageByAdmin: jest.fn()
  },
  userAPI: {}
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
  onFriendPresence: jest.fn(() => jest.fn()),
  onPresenceUpdate: jest.fn(() => jest.fn()),
  onChatMessage: jest.fn((handler) => {
    mockRealtimeChatHandler = handler;
    return () => {
      if (mockRealtimeChatHandler === handler) {
        mockRealtimeChatHandler = null;
      }
    };
  })
}));

describe('Chat zip room indicator', () => {
  let container;
  let root;

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // React 18 controlled inputs in this test style require invoking the native setter
  // so React sees a real input event and updates state from DOM interactions.
  const setInputValue = (input, value) => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const renderChat = async () => {
    await act(async () => {
      root.render(<Chat />);
      await flush();
    });
  };

  const unlockActiveDm = async ({ password = 'secret-password', duration = null } = {}) => {
    const passwordInput = container.querySelector('input[aria-label="Encryption password"]');
    expect(passwordInput).not.toBeNull();

    if (duration !== null) {
      const durationSelect = container.querySelector('select#password-modal-unlock-duration');
      expect(durationSelect).not.toBeNull();
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        nativeSetter.call(durationSelect, String(duration));
        durationSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await flush();
      });
    }

    await act(async () => {
      setInputValue(passwordInput, password);
      await flush();
    });

    const unlockButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Unlock');
    expect(unlockButton).not.toBeUndefined();
    await act(async () => {
      unlockButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRealtimeChatHandler = null;
    onFriendPresence.mockReturnValue(jest.fn());
    onPresenceUpdate.mockReturnValue(jest.fn());
    localStorage.clear();
    document.cookie = 'socialsecure_dm_unlock_v1=; Max-Age=0; Path=/';
    chatAPI.getConversationMessages.mockResolvedValue({ data: { messages: [] } });
    authAPI.verifyEncryptionPassword.mockResolvedValue({ data: { success: true } });
    chatAPI.getConversationUsers.mockResolvedValue({ data: { users: [] } });
    chatAPI.getConversationDevices.mockResolvedValue({ data: { devices: [] } });
    chatAPI.publishConversationKeyPackages.mockResolvedValue({ data: { success: true } });
    chatAPI.syncConversationKeyPackages.mockResolvedValue({ data: { packages: [] } });
    chatAPI.registerDeviceKeys.mockResolvedValue({ data: { success: true } });
    chatAPI.sendConversationMessage.mockResolvedValue({
      data: {
        message: {
          _id: 'm-1',
          content: 'ok',
          userId: { _id: 'u1', username: 'alpha' },
          createdAt: new Date().toISOString()
        }
      }
    });
    chatAPI.sendConversationE2EEMessage.mockResolvedValue({
      data: {
        message: {
          _id: 'dm-e2ee-1',
          content: '[Encrypted message]',
          userId: { _id: 'u1', username: 'alpha' },
          createdAt: new Date().toISOString(),
          e2ee: { ciphertext: 'abc' }
        }
      }
    });
    chatAPI.syncLocationRooms.mockResolvedValue({ data: { success: true } });
    chatAPI.getAllRooms.mockResolvedValue({ data: { rooms: [] } });
    chatAPI.joinRoom.mockResolvedValue({ data: { success: true } });
    chatAPI.deleteRoom.mockResolvedValue({ data: { success: true } });
    chatAPI.getMessages.mockResolvedValue({ data: { messages: [], pagination: { hasMore: false } } });
    chatAPI.getRoomUsers.mockResolvedValue({ data: { users: [] } });
    chatAPI.sendMessage.mockResolvedValue({
      data: {
        message: {
          _id: 'room-m-1',
          content: 'room ok',
          userId: { _id: 'u1', username: 'alpha' },
          createdAt: new Date().toISOString(),
          roomId: 'room-1'
        }
      }
    });
    const session = {
      deviceId: 'device-1',
      getRegisterPayload: jest.fn().mockResolvedValue({
        deviceId: 'device-1',
        keyVersion: 1,
        publicEncryptionKey: '{}',
        publicSigningKey: '{}',
        algorithms: { encryption: 'ECDH-P256', signing: 'ECDSA-P256-SHA256' }
      }),
      getLatestRoomKey: jest.fn().mockReturnValue({
        keyVersion: 1,
        keyBytes: new Uint8Array([1, 2, 3, 4])
      }),
      createRoomKey: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
      setRoomKey: jest.fn(),
      persist: jest.fn().mockResolvedValue(undefined)
    };
    unlockOrCreateVault.mockResolvedValue({ session, created: false });
    encryptEnvelope.mockResolvedValue({
      version: 1,
      senderDeviceId: 'device-1',
      clientMessageId: 'client-1',
      keyVersion: 1,
      nonce: 'abc',
      aad: '',
      ciphertext: 'cipher',
      signature: 'sig',
      ciphertextHash: 'a'.repeat(64),
      algorithms: { cipher: 'AES-256-GCM', signature: 'ECDSA-P256-SHA256', hash: 'SHA-256' }
    });
    decryptEnvelope.mockResolvedValue('decrypted dm');
    createWrappedRoomKeyPackage.mockResolvedValue({
      senderDeviceId: 'device-1',
      senderPublicKey: '{"kty":"EC"}',
      recipientDeviceId: 'device-2',
      recipientUserId: 'u2',
      keyVersion: 1,
      wrappedRoomKey: 'wrap',
      nonce: 'nonce',
      aad: '',
      signature: 'sig',
      wrappedKeyHash: 'hash',
      algorithms: { encryption: 'AES-256-GCM', wrapping: 'ECDH-P256-AES-256-GCM', signing: 'ECDSA', hash: 'SHA-256' }
    });
    friendsAPI.sendRequest.mockResolvedValue({ data: { success: true } });
    friendsAPI.getFriends.mockResolvedValue({ data: { friends: [] } });
    moderationAPI.blockUser.mockResolvedValue({ data: { success: true } });
    moderationAPI.muteUserByAdmin.mockResolvedValue({ data: { success: true } });
    moderationAPI.unmuteUserByAdmin.mockResolvedValue({ data: { success: true } });
    moderationAPI.removeMessageByAdmin.mockResolvedValue({
      data: {
        message: {
          _id: 'room-m-1',
          content: 'Removed by site Admin',
          moderation: { removedByAdmin: true, removedByAdminAt: new Date().toISOString() },
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: new Date().toISOString()
        }
      }
    });
    moderationAPI.restoreMessageByAdmin.mockResolvedValue({
      data: {
        message: {
          _id: 'room-m-1',
          content: 'room ok',
          moderation: { removedByAdmin: false, removedByAdminAt: null },
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: new Date().toISOString()
        }
      }
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: query === '(hover: hover) and (pointer: fine)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn()
      }))
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container) {
      container.remove();
    }
    container = null;
    root = null;
    localStorage.clear();
    document.cookie = 'socialsecure_dm_unlock_v1=; Max-Age=0; Path=/';
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  it('shows default zip room from chat hub when profile zip is missing', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: null } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();

    expect(container.textContent).toContain('Zip 02115');
  });

  it('renders the chat message panel without undefined admin moderation state errors', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();
    await act(async () => {
      await flush();
    });

    expect(container.querySelector('[data-testid="chat-message-panel"]')).not.toBeNull();
  });

  it('does not show zip banner when neither profile nor hub has zip information', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: null } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: null, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();

    expect(container.textContent).not.toContain('Your default zip room:');
  });

  it('renders compact theme menu with six readable options', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();

    const themeMenuButton = container.querySelector('button[aria-label="Open chat theme menu"]');
    expect(themeMenuButton).not.toBeNull();

    await act(async () => {
      themeMenuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const themeSelect = container.querySelector('select#chat-theme-select-fallback');
    expect(themeSelect).not.toBeNull();
    expect(themeSelect.options).toHaveLength(6);
    expect(Array.from(themeSelect.options).map((option) => option.textContent)).toEqual([
      'Classic Light',
      'Midnight',
      'Ocean',
      'Terminal',
      'Sunset',
      'Lavender'
    ]);
  });

  it('renders channel tabs, room info, and open chat tabs in one menu bar', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();

    const menuBar = container.querySelector('[data-chat-menu-bar]');
    expect(menuBar).not.toBeNull();

    const channelTabs = menuBar.querySelector('[data-chat-channel-tabs]');
    expect(channelTabs).not.toBeNull();
    expect(Array.from(channelTabs.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      'Chat',
      'Direct Messages'
    ]);

    expect(menuBar.textContent).toContain('Zip 02115');
    expect(menuBar.textContent).toContain('Live conversation');
    expect(menuBar.textContent).not.toContain('Theme-tuned accents');
    expect(menuBar.querySelector('[data-open-chat-tab="Zip 02115"]')).not.toBeNull();
    expect(menuBar.textContent).toContain('1/6');
  });

  it('renders alphabetical state chats with county rooms and a topics dropdown', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getAllRooms.mockResolvedValue({
      data: {
        rooms: [
          { _id: 'topic-tech', type: 'topic', name: 'Technology' },
          { _id: 'state-wy', type: 'state', name: 'Wyoming', state: 'WY' },
          { _id: 'county-la', type: 'county', name: 'Los Angeles County, California', state: 'CA', county: 'Los Angeles County' },
          { _id: 'topic-ai', type: 'topic', name: 'AI' },
          { _id: 'state-ca', type: 'state', name: 'California', state: 'CA' },
          { _id: 'county-orange', type: 'county', name: 'Orange County, California', state: 'CA', county: 'Orange County' },
          { _id: 'state-al', type: 'state', name: 'Alabama', state: 'AL' },
          { _id: 'county-mobile', type: 'county', name: 'Mobile County, Alabama', state: 'AL', county: 'Mobile County' }
        ]
      }
    });

    await renderChat();

    expect(container.querySelectorAll('[data-discovery-state-summary]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-discovery-county]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-topic-room]')).toHaveLength(0);

    const stateChatsToggle = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('State Chats'));
    expect(stateChatsToggle).not.toBeNull();

    await act(async () => {
      stateChatsToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const stateSummaryButtons = Array.from(container.querySelectorAll('[data-discovery-state-summary]'));
    const stateSummaries = stateSummaryButtons
      .map((node) => node.getAttribute('data-discovery-state-summary'));
    expect(stateSummaries).toEqual(['Alabama', 'California', 'Wyoming']);
    expect(stateSummaryButtons.map((node) => node.textContent)).toEqual(['Alabama+', 'California+', 'Wyoming+']);

    for (const button of stateSummaryButtons) {
      await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
      });
    }

    const countyRows = Array.from(container.querySelectorAll('[data-discovery-county]'))
      .map((node) => node.getAttribute('data-discovery-county'));
    expect(countyRows).toEqual([
      'Mobile County, Alabama',
      'Los Angeles County, California',
      'Orange County, California'
    ]);

    const topicsToggle = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Topics'));
    expect(topicsToggle).not.toBeNull();

    await act(async () => {
      topicsToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const topicRows = Array.from(container.querySelectorAll('[data-topic-room]'))
      .map((node) => node.getAttribute('data-topic-room'));
    expect(topicRows).toEqual(['AI', 'Technology']);
    expect(container.textContent).toContain('Topics');
  });

  it('only shows room search results after a query and opens a clicked room by joining it', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getAllRooms.mockResolvedValue({
      data: {
        rooms: [
          { _id: 'topic-ai', type: 'topic', name: 'AI', members: [] }
        ]
      }
    });
    chatAPI.getMessages.mockResolvedValue({
      data: {
        messages: [
          {
            _id: 'room-msg-1',
            roomId: 'topic-ai',
            content: 'Welcome to AI',
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        pagination: { hasMore: false }
      }
    });
    chatAPI.getRoomUsers.mockResolvedValue({
      data: {
        users: [{ _id: 'u2', username: 'buddy' }]
      }
    });

    await renderChat();

    expect(container.querySelectorAll('[data-room-search-result]')).toHaveLength(0);
    expect(container.textContent).toContain('Search to find a room when you need one.');

    const roomSearchInput = container.querySelector('input[placeholder="Search by room or location..."]');
    await act(async () => {
      setInputValue(roomSearchInput, 'AI');
      await flush();
    });

    const roomResult = container.querySelector('[data-room-search-result="AI"] button');
    expect(roomResult).not.toBeNull();

    await act(async () => {
      roomResult.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(chatAPI.joinRoom).toHaveBeenCalledWith('topic-ai');
    expect(chatAPI.getMessages).toHaveBeenCalledWith('topic-ai', 1, 40);
    expect(chatAPI.getRoomUsers).toHaveBeenCalledWith('topic-ai');
    expect(container.textContent).toContain('Welcome to AI');
    expect(container.querySelector('[data-open-chat-tab="AI"]')).not.toBeNull();
  });

  it('shows a delete action for deletable rooms and confirms before deleting', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getAllRooms.mockResolvedValue({
      data: {
        rooms: [
          { _id: 'topic-ai', type: 'topic', name: 'AI', createdBy: 'u1', members: [] },
          { _id: 'topic-safe', type: 'topic', name: 'Safety', stableKey: 'topic:safety', members: [] }
        ]
      }
    });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    await renderChat();

    const roomSearchInput = container.querySelector('input[placeholder="Search by room or location..."]');
    expect(roomSearchInput).not.toBeNull();
    await act(async () => {
      setInputValue(roomSearchInput, 'AI');
      await flush();
    });

    const deleteButton = container.querySelector('button[aria-label="Delete AI room"]');
    expect(deleteButton).not.toBeNull();
    expect(container.querySelector('button[aria-label="Delete Safety room"]')).toBeNull();

    await act(async () => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(confirmSpy).toHaveBeenCalledWith('Delete "AI"?');
    expect(chatAPI.deleteRoom).toHaveBeenCalledWith('topic-ai');
    expect(container.textContent).not.toContain('AI');

    confirmSpy.mockRestore();
  });

  it('limits open chat tabs to six most recent conversations', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getAllRooms.mockResolvedValue({
      data: {
        rooms: Array.from({ length: 7 }, (_, index) => ({
          _id: `topic-${index + 1}`,
          type: 'topic',
          name: `Room ${index + 1}`,
          members: []
        }))
      }
    });
    chatAPI.getMessages.mockImplementation((roomId) => Promise.resolve({
      data: {
        messages: [
          {
            _id: `msg-${roomId}`,
            roomId,
            content: `Loaded ${roomId}`,
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        pagination: { hasMore: false }
      }
    }));

    await renderChat();

    const roomSearchInput = container.querySelector('input[placeholder="Search by room or location..."]');
    await act(async () => {
      setInputValue(roomSearchInput, 'Room');
      await flush();
    });

    const openButtons = () => Array.from(container.querySelectorAll('[data-room-search-result] > div > button:first-child'));

    for (const button of openButtons()) {
      await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
      });
    }

    const openTabs = Array.from(container.querySelectorAll('[data-open-chat-tab]')).map((node) => node.getAttribute('data-open-chat-tab'));
    expect(openTabs).toHaveLength(6);
    expect(openTabs).not.toContain('Zip 02115');
    expect(openTabs).not.toContain('Room 1');
    expect(openTabs).toContain('Room 7');
    expect(container.textContent).toContain('6/6');
  });

  it('filters DM conversations and starts a new DM from the plus picker', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: {
            current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' },
            nearby: [{ _id: 'zip2', type: 'zip-room', zipCode: '02116', title: 'Zip 02116' }]
          },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });
    friendsAPI.getFriends.mockResolvedValue({
      data: { friends: [{ _id: 'u2', username: 'buddy' }, { _id: 'u3', username: 'charlie' }] }
    });
    chatAPI.startDM.mockResolvedValue({
      data: {
        conversation: { _id: 'dm1' }
      }
    });

    await renderChat();

    const searchTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      searchTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const conversationInput = container.querySelector('input[placeholder="Search conversations..."]');
    expect(conversationInput).not.toBeNull();

    await act(async () => {
      setInputValue(conversationInput, 'bud');
      await flush();
    });
    expect(container.textContent).toContain('@buddy');

    const newDmButton = container.querySelector('button[aria-label="Start a new direct message"]');
    await act(async () => {
      newDmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(container.textContent).toContain('@charlie');

    const startButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === 'Start');
    expect(startButtons.length).toBeGreaterThan(0);
    await act(async () => {
      startButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(chatAPI.startDM).toHaveBeenCalled();
  });

  it('uses full-height shell and flexible message viewport layout', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();

    const chatShell = container.firstElementChild;
    expect(chatShell).not.toBeNull();
    expect(chatShell.className).toContain('h-full');
    expect(chatShell.className).toContain('w-full');
    expect(chatShell.className).toContain('min-h-0');
    expect(chatShell.className).toContain('overflow-hidden');
    expect(chatShell.className).toContain('flex');

    const desktopGrid = container.querySelector('div.grid.flex-1.min-h-0');
    expect(desktopGrid).not.toBeNull();
    expect(desktopGrid.className).toContain('lg:grid-cols-[2.6fr_8fr_2.2fr]');
    expect(desktopGrid.className).toContain('gap-1');
    expect(desktopGrid.className).toContain('p-1');

    const pageHeader = container.querySelector('[data-testid="chat-page-header"]');
    expect(pageHeader).not.toBeNull();
    expect(pageHeader.className).toContain('px-2');
    expect(pageHeader.className).toContain('py-1.5');

    const workspacePanel = container.querySelector('[data-testid="chat-workspace-panel"]');
    expect(workspacePanel).not.toBeNull();
    expect(workspacePanel.className).toContain('px-1.5');
    expect(workspacePanel.className).toContain('pt-1');

    const emptyMessages = Array.from(container.querySelectorAll('p')).find((node) => node.textContent === 'No messages yet.');
    expect(emptyMessages).not.toBeUndefined();
    const messageViewport = emptyMessages.closest('div.overflow-y-auto');
    expect(messageViewport).not.toBeNull();
    expect(messageViewport.className).toContain('overflow-y-auto');
    expect(messageViewport.className).not.toContain('max-h-[460px]');

    const sidebars = container.querySelectorAll('aside');
    expect(sidebars.length).toBeGreaterThanOrEqual(2);
    expect(sidebars[0].querySelector('.overflow-y-auto')).not.toBeNull();
  });

  it('keeps the composer in normal flow while a locked DM overlay is visible', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const messagePanel = container.querySelector('[data-testid="chat-message-panel"]');
    expect(messagePanel).not.toBeNull();
    expect(messagePanel.className).toContain('overflow-hidden');
    expect(messagePanel.querySelector('div.overflow-y-auto')).not.toBeNull();

    const composerShell = container.querySelector('[data-testid="chat-composer-shell"]');
    expect(composerShell).not.toBeNull();
    expect(composerShell.className).toContain('shrink-0');
    expect(composerShell.className).not.toContain('sticky');

    expect(container.querySelector('[data-testid="dm-lock-overlay"]')).not.toBeNull();
    expect(container.querySelector('textarea').disabled).toBe(true);
  });

  it('persists the selected theme to localStorage', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();

    const themeSelect = container.querySelector('select');
    expect(themeSelect).not.toBeNull();
    expect(themeSelect.value).toBe('midnight');
    expect(localStorage.getItem('chatTheme')).toBeNull();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      nativeInputValueSetter.call(themeSelect, 'midnight');
      themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });

    expect(themeSelect.value).toBe('midnight');
    expect(localStorage.getItem('chatTheme')).toBe('midnight');
  });

  it('restores the theme from localStorage on mount', async () => {
    localStorage.setItem('chatTheme', 'ocean');

    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();

    const themeSelect = container.querySelector('select');
    expect(themeSelect).not.toBeNull();
    expect(themeSelect.value).toBe('ocean');
  });

  it('falls back to default theme when localStorage has invalid value', async () => {
    localStorage.setItem('chatTheme', 'nonexistent');

    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();

    const themeSelect = container.querySelector('select');
    expect(themeSelect).not.toBeNull();
    expect(themeSelect.value).toBe('midnight');
  });

  it('uses theme-driven sender accents and sends transformed slash command content', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();

    expect(container.querySelector('input[type="color"]')).toBeNull();
    expect(container.textContent).not.toContain('Theme-tuned accents');
    expect(container.querySelector('button[aria-label="Open chat theme menu"]').textContent).toContain('Midnight');

    const composer = container.querySelector('textarea[placeholder="Type your message"]');
    expect(composer).not.toBeNull();
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      valueSetter.call(composer, '/cry');
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
    });

    const sendButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Send');
    expect(sendButton).not.toBeUndefined();
    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(chatAPI.sendConversationMessage).toHaveBeenCalledWith('zip1', {
      content: 'alpha cries'
    });
  });

  it('opens a user context menu with requested actions on right click', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getConversationUsers.mockResolvedValue({
      data: {
        users: [{ _id: 'u2', username: 'buddy', realName: 'Buddy' }]
      }
    });

    await renderChat();

    const userRow = Array.from(container.querySelectorAll('li')).find((node) => node.textContent.includes('@buddy'));
    expect(userRow).not.toBeUndefined();

    await act(async () => {
      userRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 140, clientY: 120 }));
      await flush();
    });

    expect(container.textContent).toContain('Send direct message');
    expect(container.textContent).toContain('View user social');
    expect(container.textContent).toContain('Request friendship');
    expect(container.textContent).toContain('Block/ignore');
  });

  it('replaces attachment control with URL formatter and inserts a short link token', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();

    expect(container.querySelector('button[aria-label="Attach file"]')).toBeNull();
    const formatterButton = container.querySelector('button[aria-label="Open URL formatter"]');
    expect(formatterButton).not.toBeNull();

    await act(async () => {
      formatterButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const urlInput = container.querySelector('input#chat-link-url-input');
    const shortNameInput = container.querySelector('input#chat-link-short-name');
    expect(urlInput).not.toBeNull();
    expect(shortNameInput).not.toBeNull();

    await act(async () => {
      setInputValue(urlInput, 'https://example.com/some/very/long/path');
      setInputValue(shortNameInput, 'Project Docs');
      await flush();
    });

    const insertButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Insert link');
    expect(insertButton).not.toBeUndefined();
    await act(async () => {
      insertButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const composer = container.querySelector('textarea[placeholder="Type your message"]');
    expect(composer.value).toContain('[Project Docs](https://example.com/some/very/long/path)');
  });

  it('renders links as new-window anchors and warns before opening external links', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({
      data: {
        messages: [
          {
            _id: 'm-link',
            content: 'Internal https://socialsecure.test/social and external https://example.com',
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      }
    });

    const originalLocation = window.location;
    delete window.location;
    window.location = new URL('https://socialsecure.test/chat');
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    await renderChat();

    const links = container.querySelectorAll('a[target="_blank"]');
    expect(links.length).toBe(2);

    await act(async () => {
      links[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await flush();
    });
    expect(confirmSpy).not.toHaveBeenCalled();

    await act(async () => {
      links[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await flush();
    });
    expect(confirmSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
    window.location = originalLocation;
  });

  it('renders clickable avatar profile links inside messages', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({
      data: {
        messages: [
          {
            _id: 'm-avatar',
            content: 'hello',
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      }
    });

    await renderChat();

    const profileLinks = Array.from(container.querySelectorAll('a')).filter((node) =>
      (node.getAttribute('href') || '').includes('/social?user=')
    );
    expect(profileLinks.length).toBeGreaterThan(0);
    expect(profileLinks.some((link) => link.getAttribute('href') === '/social?user=buddy')).toBe(true);
    expect(profileLinks[0].className).toContain('h-9');
    expect(profileLinks[0].className).toContain('w-9');

    const messageText = Array.from(container.querySelectorAll('p')).find((node) => node.textContent === 'hello');
    expect(messageText).not.toBeUndefined();
    expect(messageText.className).toContain('leading-6');
    const messageBubble = messageText.closest('div[class*="rounded"]');
    expect(messageBubble).not.toBeNull();
    expect(messageBubble.className).toContain('px-0.5');
    expect(messageBubble.className).toContain('py-0.5');

    const messageViewport = messageText.closest('div.overflow-y-auto');
    expect(messageViewport).not.toBeNull();
    expect(messageViewport.className).toContain('py-3');
  });

  it('formats named links and opens user actions from message click', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({
      data: {
        messages: [
          {
            _id: 'm-link-name',
            content: '[Docs](https://example.com/product/guide)',
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      }
    });

    await renderChat();

    const namedLink = Array.from(container.querySelectorAll('a')).find((node) => node.textContent.startsWith('Docs ('));
    expect(namedLink).not.toBeUndefined();
    expect(namedLink.getAttribute('href')).toBe('https://example.com/product/guide');

    const authorAction = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '@buddy');
    expect(authorAction).not.toBeUndefined();
    await act(async () => {
      authorAction.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(container.textContent).toContain('Send direct message');
    expect(container.textContent).toContain('View user social');
  });

  it('links the active DM name to the other user social page', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const dmHeaderLink = container.querySelector('a[aria-label="Open @buddy social page"]');
    expect(dmHeaderLink).not.toBeNull();
    expect(dmHeaderLink.getAttribute('href')).toBe('/social?user=buddy');
  });

  it('renders sender names with theme-selected accent styling', async () => {
    localStorage.setItem('chatTheme', 'ocean');
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({
      data: {
        messages: [
          {
            _id: 'm-legibility',
            content: 'readable name',
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      }
    });

    await renderChat();

    const authorAction = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '@buddy');
    expect(authorAction).not.toBeUndefined();
    expect(authorAction.className).toContain('text-sm');
    expect(authorAction.className).toContain('font-semibold');
    expect(authorAction.className).toContain('text-cyan-200');
  });

  it('groups consecutive room messages into a Discord-like stack', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({
      data: {
        messages: [
          {
            _id: 'm-group-1',
            content: 'first',
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:00:00.000Z'
          },
          {
            _id: 'm-group-2',
            content: 'second',
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:02:00.000Z'
          },
          {
            _id: 'm-group-3',
            content: 'third',
            userId: { _id: 'u3', username: 'charlie' },
            createdAt: '2024-01-01T00:03:00.000Z'
          }
        ]
      }
    });

    await renderChat();

    const roomMessages = Array.from(container.querySelectorAll('[data-chat-message-layout="room"]'));
    expect(roomMessages).toHaveLength(3);
    expect(roomMessages[0].getAttribute('data-chat-grouped')).toBe('false');
    expect(roomMessages[1].getAttribute('data-chat-grouped')).toBe('true');
    expect(Array.from(container.querySelectorAll('button')).filter((node) => node.textContent === '@buddy')).toHaveLength(1);
  });

  it('opens a direct message when loaded with a social deep link target', async () => {
    window.history.replaceState({}, '', '/chat?dm=u2');

    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.startDM.mockResolvedValue({
      data: {
        conversation: {
          _id: 'dm-u2',
          type: 'dm',
          peer: { _id: 'u2', username: 'buddy' }
        }
      }
    });

    await renderChat();

    expect(chatAPI.startDM).toHaveBeenCalledWith('u2');
    expect(window.location.pathname).toBe('/chat');
    expect(window.location.search).toBe('');
  });

  it('shows every friend in the direct message section and starts a DM from friend list', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    friendsAPI.getFriends.mockResolvedValue({
      data: {
        friends: [
          { _id: 'u2', username: 'buddy' },
          { _id: 'u3', username: 'pal' }
        ]
      }
    });
    chatAPI.startDM.mockResolvedValue({
      data: {
        conversation: {
          _id: 'dm-u2',
          type: 'dm',
          peer: { _id: 'u2', username: 'buddy' }
        }
      }
    });

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const newDmButton = container.querySelector('button[aria-label="Start a new direct message"]');
    await act(async () => {
      newDmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(container.textContent).toContain('@buddy');
    expect(container.textContent).toContain('@pal');
    const friendMessageButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === 'Start');
    expect(friendMessageButtons.length).toBeGreaterThan(0);
    await act(async () => {
      friendMessageButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(chatAPI.startDM).toHaveBeenCalledWith('u2');
  });

  it('removes profile thread channel controls from chat sidebar', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await renderChat();

    expect(container.textContent).not.toContain('Profile Threads');
  });

  it('locks direct messages by default and unlocks after password prompt', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const composer = container.querySelector('textarea');
    expect(composer.disabled).toBe(true);
    expect(container.querySelector('[data-testid="dm-lock-overlay"]')).not.toBeNull();
    expect(container.textContent).toContain('Encrypted conversation locked');

    await unlockActiveDm();

    const lockButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Lock');
    expect(lockButton).not.toBeUndefined();
    expect(lockButton.disabled).toBe(false);
    expect(container.querySelector('[data-testid="dm-lock-overlay"]')).toBeNull();
    expect(container.querySelector('textarea').disabled).toBe(false);
  });

  it('continues DM unlock when one synced key package is invalid', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });
    chatAPI.syncConversationKeyPackages.mockResolvedValue({
      data: {
        packages: [{ _id: 'pkg-invalid' }, { _id: 'pkg-valid' }]
      }
    });
    ingestWrappedRoomKeyPackage
      .mockRejectedValueOnce(new Error('Wrapped key hash mismatch.'))
      .mockResolvedValueOnce(undefined);
    const session = {
      deviceId: 'device-1',
      getRegisterPayload: jest.fn().mockResolvedValue({
        deviceId: 'device-1',
        keyVersion: 1,
        publicEncryptionKey: '{}',
        publicSigningKey: '{}',
        algorithms: { encryption: 'ECDH-P256', signing: 'ECDSA-P256-SHA256' }
      }),
      getLatestRoomKey: jest.fn().mockReturnValue({
        keyVersion: 1,
        keyBytes: new Uint8Array([1, 2, 3, 4])
      }),
      createRoomKey: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
      setRoomKey: jest.fn(),
      persist: jest.fn().mockResolvedValue(undefined)
    };
    unlockOrCreateVault.mockResolvedValue({ session, created: false });

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    await unlockActiveDm();

    expect(ingestWrappedRoomKeyPackage).toHaveBeenCalledTimes(2);
    expect(session.persist).toHaveBeenCalledTimes(1);
    expect(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Lock')).not.toBeUndefined();
  });

  it('uses DM E2EE endpoint for direct message sends', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });
    chatAPI.getConversationDevices.mockResolvedValue({
      data: {
        devices: [
          { userId: 'u1', deviceId: 'device-1', publicEncryptionKey: '{"kty":"EC"}' },
          { userId: 'u2', deviceId: 'device-2', publicEncryptionKey: '{"kty":"EC"}' }
        ]
      }
    });

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    await unlockActiveDm();

    const composer = container.querySelector('textarea[placeholder="Type your message"]');
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      valueSetter.call(composer, 'hello dm');
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
    });

    const sendButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Send');
    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(chatAPI.sendConversationE2EEMessage).toHaveBeenCalledWith('dm1', expect.objectContaining({
      e2ee: expect.any(Object)
    }));
    expect(chatAPI.sendConversationMessage).not.toHaveBeenCalledWith('dm1', expect.anything());
  });

  it('renders decrypted direct message content after unlocking', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });
    chatAPI.getConversationMessages.mockImplementation((conversationId) => {
      if (conversationId === 'dm1') {
        return Promise.resolve({
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
            }]
          }
        });
      }
      return Promise.resolve({ data: { messages: [] } });
    });
    decryptEnvelope.mockResolvedValue('hello from dm');

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(container.textContent).toContain('🔒 Conversation locked');
    expect(container.textContent).not.toContain('hello from dm');

    await unlockActiveDm();

    expect(decryptEnvelope).toHaveBeenCalled();
    expect(container.textContent).toContain('hello from dm');
    expect(container.textContent).not.toContain('[Encrypted message]');
  });

  it('supports configurable secure unlock duration in DM flow', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    await unlockActiveDm({ duration: 60 });

    expect(chatAPI.sendConversationE2EEMessage).not.toHaveBeenCalled();
    expect(container.querySelector('textarea').disabled).toBe(false);
  });

  it('relocks a DM from the composer lock button and restores the padlock overlay', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    await unlockActiveDm();

    const lockButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Lock');
    expect(lockButton).not.toBeUndefined();
    await act(async () => {
      lockButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(container.querySelector('textarea').disabled).toBe(true);
    expect(container.querySelector('[data-testid="dm-lock-overlay"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Encryption password"]')).not.toBeNull();
  });

  it('applies incoming realtime messages to the active conversation without refresh', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({ data: { messages: [] } });

    await renderChat();
    await act(async () => {
      await flush();
      await flush();
    });

    expect(container.textContent).toContain('No messages yet.');
    const realtimeHandler = onChatMessage.mock.calls.at(-1)?.[0];
    expect(realtimeHandler).toEqual(expect.any(Function));

    await act(async () => {
      realtimeHandler?.({
        message: {
          _id: 'live-1',
          conversationId: 'zip1',
          content: 'incoming live message',
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: new Date().toISOString()
        }
      });
      await flush();
    });

    expect(container.textContent).toContain('incoming live message');
    expect(chatAPI.getConversationMessages).toHaveBeenCalledTimes(1);
  });

  it('shows a live participant list across the DM side panel', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });
    let usersCallCount = 0;
    chatAPI.getConversationUsers.mockImplementation((conversationId) => {
      if (conversationId === 'zip1') {
        return Promise.resolve({ data: { users: [] } });
      }
      usersCallCount += 1;
      return Promise.resolve({
        data: {
          users: usersCallCount > 1
            ? [
              { _id: 'u1', username: 'alpha' },
              { _id: 'u2', username: 'buddy' },
              { _id: 'u3', username: 'charlie' }
            ]
            : [
              { _id: 'u1', username: 'alpha' },
              { _id: 'u2', username: 'buddy' }
            ]
        }
      });
    });

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      await flush();
    });

    expect(container.textContent).toContain('Participants');
    expect(container.textContent).toContain('People in this DM');
    expect(container.textContent).toContain('@buddy');
    expect(container.textContent).not.toContain('Shared Media / Links');

    const realtimeHandler = onChatMessage.mock.calls.at(-1)?.[0];
    expect(realtimeHandler).toEqual(expect.any(Function));

    await act(async () => {
      realtimeHandler?.({
        message: {
          _id: 'live-dm-1',
          conversationId: 'dm1',
          content: '[Encrypted message]',
          userId: { _id: 'u3', username: 'charlie' },
          createdAt: new Date().toISOString(),
          e2ee: { ciphertext: 'cipher' }
        }
      });
      await flush();
      await flush();
    });

    expect(chatAPI.getConversationUsers).toHaveBeenCalledWith('dm1');
    expect(container.textContent).toContain('@charlie');
  });

  it('decrypts the latest DM batch first and decrypts older messages when loading earlier history', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [{ _id: 'dm1', type: 'dm', participants: ['u1', 'u2'], peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });
    const encryptedMessages = Array.from({ length: 12 }).map((_, index) => ({
      _id: `dm-message-${index + 1}`,
      content: '[Encrypted message]',
      userId: { _id: 'u2', username: 'buddy' },
      createdAt: new Date(Date.now() - ((12 - index) * 1000)).toISOString(),
      e2ee: {
        ciphertext: `cipher-${index + 1}`,
        nonce: `nonce-${index + 1}`,
        aad: '',
        keyVersion: 1,
        senderDeviceId: 'device-2',
        clientMessageId: `client-${index + 1}`,
        signature: 'sig',
        ciphertextHash: 'h'.repeat(64)
      }
    }));
    chatAPI.getConversationMessages.mockImplementation((conversationId, page) => {
      if (conversationId === 'dm1' && page === 1) {
        return Promise.resolve({ data: { messages: encryptedMessages, hasMore: false } });
      }
      return Promise.resolve({ data: { messages: [], hasMore: false } });
    });

    await renderChat();
    await act(async () => {
      await flush();
      await flush();
    });

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    await unlockActiveDm();
    await act(async () => {
      await flush();
      await flush();
      await wait(20);
    });

    expect(decryptEnvelope).toHaveBeenCalledTimes(12);

    const loadEarlierButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Load earlier messages');
    expect(loadEarlierButton).not.toBeUndefined();
    await act(async () => {
      loadEarlierButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      await flush();
      await wait(20);
    });

    expect(decryptEnvelope).toHaveBeenCalledTimes(12);
  });

  it('shows reaction picker on desktop hover and mobile tap only', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({
      data: {
        messages: [{
          _id: 'm-react-1',
          content: 'hello',
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: new Date().toISOString()
        }]
      }
    });

    await renderChat();

    expect(container.querySelector('button[aria-label="Add Like reaction"]')).toBeNull();
    await act(async () => {
      const messageBubble = Array.from(container.querySelectorAll('p')).find((node) => node.textContent === 'hello')?.closest('div.relative');
      expect(messageBubble).not.toBeNull();
      messageBubble.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: container }));
      await flush();
    });

    expect(container.querySelector('button[aria-label="Add Like reaction"]')).not.toBeNull();

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn()
      }))
    });

    await act(async () => {
      root.unmount();
      await flush();
    });
    root = createRoot(container);
    await renderChat();

    expect(container.querySelector('button[aria-label="Add Like reaction"]')).toBeNull();
    await act(async () => {
      const messageBubble = Array.from(container.querySelectorAll('p')).find((node) => node.textContent === 'hello')?.closest('div.relative');
      messageBubble.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(container.querySelector('button[aria-label="Add Like reaction"]')).not.toBeNull();
  });

  it('shows admin remove and 2 hour mute controls with undo actions in room chats', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115', isAdmin: true } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({
      data: {
        messages: [{
          _id: 'room-m-1',
          content: 'room ok',
          moderation: { removedByAdmin: false, removedByAdminAt: null },
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: '2024-01-01T13:41:25'
        }]
      }
    });
    chatAPI.getConversationUsers.mockResolvedValue({
      data: {
        users: [
          { _id: 'u1', username: 'alpha', mutedUntil: null },
          { _id: 'u2', username: 'buddy', mutedUntil: null }
        ]
      }
    });
    moderationAPI.removeMessageByAdmin.mockResolvedValue({
      data: {
        message: {
          _id: 'room-m-1',
          content: 'Removed by site Admin',
          moderation: { removedByAdmin: true, removedByAdminAt: '2024-01-01T14:00:00.000Z' },
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: '2024-01-01T13:41:25'
        }
      }
    });
    moderationAPI.restoreMessageByAdmin.mockResolvedValue({
      data: {
        message: {
          _id: 'room-m-1',
          content: 'room ok',
          moderation: { removedByAdmin: false, removedByAdminAt: null },
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: '2024-01-01T13:41:25'
        }
      }
    });

    await renderChat();
    await act(async () => {
      await flush();
    });

    const removeButton = container.querySelector('button[aria-label="Remove message"]');
    const muteButton = container.querySelector('button[aria-label="Mute user for 2 hours"]');
    expect(removeButton).not.toBeNull();
    expect(muteButton).not.toBeNull();

    await act(async () => {
      removeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(moderationAPI.removeMessageByAdmin).toHaveBeenCalledWith('room-m-1', 'conversation');
    expect(container.textContent).toContain('Removed by site Admin');
    expect(container.querySelector('button[aria-label="Undo remove message"]')).not.toBeNull();

    await act(async () => {
      muteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(moderationAPI.muteUserByAdmin).toHaveBeenCalledWith('u2', expect.objectContaining({ durationKey: '2h' }));
    expect(container.querySelector('button[aria-label="Undo 2 hour mute"]')).not.toBeNull();

    const undoRemoveButton = container.querySelector('button[aria-label="Undo remove message"]');
    const undoMuteButton = container.querySelector('button[aria-label="Undo 2 hour mute"]');

    await act(async () => {
      undoRemoveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      undoMuteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(moderationAPI.restoreMessageByAdmin).toHaveBeenCalledWith('room-m-1', 'conversation');
    expect(moderationAPI.unmuteUserByAdmin).toHaveBeenCalledWith('u2');
    expect(container.querySelector('button[aria-label="Remove message"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Mute user for 2 hours"]')).not.toBeNull();
  });

  it('renders compact timestamps for chat messages', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getConversationMessages.mockResolvedValue({
      data: {
        messages: [{
          _id: 'm-time-1',
          content: 'timestamp me',
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: '2024-01-01T13:41:25'
        }]
      }
    });

    await renderChat();

    expect(container.textContent).toContain('1/1/24 - 1:41:25pm');
  });
});
