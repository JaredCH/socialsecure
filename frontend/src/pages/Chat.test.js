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
    getQuickAccessRooms: jest.fn(),
    createManagedRoom: jest.fn(),
    updateRoom: jest.fn(),
    moveRoom: jest.fn(),
    joinRoom: jest.fn(),
    getMessages: jest.fn(),
    getRoomUsers: jest.fn(),
    sendMessage: jest.fn(),
    startDM: jest.fn(),
    deleteConversation: jest.fn(),
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
    restoreMessageByAdmin: jest.fn(),
    deleteMessageByAdmin: jest.fn()
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
  const DM_DECRYPT_RETRY_DELAY_MS = 200;
  const DM_DECRYPT_RETRY_TEST_WAIT_MS = DM_DECRYPT_RETRY_DELAY_MS + 60;
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
    chatAPI.getAllRooms.mockResolvedValue({ data: { rooms: [
      { _id: 'topic-socialsecure', type: 'topic', name: 'SocialSecure', discoveryGroup: 'topics', defaultLanding: true, sortOrder: 0, stableKey: 'topic:socialsecure' }
    ] } });
    chatAPI.getQuickAccessRooms.mockResolvedValue({
      data: {
        rooms: {
          state: null,
          county: null,
          zip: null,
          cities: []
        }
      }
    });
    chatAPI.createManagedRoom.mockResolvedValue({ data: { success: true, room: { _id: 'room-new' } } });
    chatAPI.updateRoom.mockResolvedValue({ data: { success: true, room: { _id: 'room-edit' } } });
    chatAPI.moveRoom.mockResolvedValue({ data: { success: true } });
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
    moderationAPI.deleteMessageByAdmin.mockResolvedValue({ data: { success: true } });
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

  it('loads the SocialSecure room by default when chat opens', async () => {
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

    expect(container.textContent).toContain('SocialSecure');
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

  it('does not show zip banner in the chat menu bar', async () => {
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

    const header = container.querySelector('[data-testid="chat-page-header"]');
    expect(header.textContent).not.toContain('Zip');
    expect(header.textContent).not.toContain('📍');
  });

  it('removes the Zip Rooms panel from the chat sidebar', async () => {
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

    const sectionTitles = Array.from(container.querySelectorAll('h3')).map((node) => node.textContent);
    expect(sectionTitles).not.toContain('Zip Rooms');
  });

  it('renders channel tabs in sidebar and header in workspace panel', async () => {
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

    const workspacePanel = container.querySelector('[data-testid="chat-workspace-panel"]');
    expect(workspacePanel).not.toBeNull();
    const pageHeader = workspacePanel.querySelector('[data-testid="chat-page-header"]');
    expect(pageHeader).not.toBeNull();

    const channelTabs = container.querySelector('[data-chat-channel-tabs]');
    expect(channelTabs).not.toBeNull();
    expect(Array.from(channelTabs.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      'CHAT',
      'DIRECT MSG'
    ]);
  });

  it('renders alphabetical state chats with city rooms in discovery sections', async () => {
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
          { _id: 'topic-socialsecure', type: 'topic', name: 'SocialSecure', discoveryGroup: 'topics', defaultLanding: true, sortOrder: 0 },
          { _id: 'topic-tech', type: 'topic', name: 'Technology', discoveryGroup: 'topics', sortOrder: 2 },
          { _id: 'state-wy', type: 'state', name: 'Wyoming', state: 'WY', discoveryGroup: 'states', sortOrder: 2 },
          { _id: 'city-la', type: 'city', name: 'Los Angeles, California', state: 'CA', city: 'Los Angeles', parentRoomId: 'state-ca', discoveryGroup: 'states', sortOrder: 0 },
          { _id: 'topic-ai', type: 'topic', name: 'AI', discoveryGroup: 'topics', sortOrder: 1 },
          { _id: 'state-ca', type: 'state', name: 'California', state: 'CA', discoveryGroup: 'states', sortOrder: 1 },
          { _id: 'city-sd', type: 'city', name: 'San Diego, California', state: 'CA', city: 'San Diego', parentRoomId: 'state-ca', discoveryGroup: 'states', sortOrder: 1 },
          { _id: 'state-al', type: 'state', name: 'Alabama', state: 'AL', discoveryGroup: 'states', sortOrder: 0 },
          { _id: 'city-mobile', type: 'city', name: 'Mobile, Alabama', state: 'AL', city: 'Mobile', parentRoomId: 'state-al', discoveryGroup: 'states', sortOrder: 0 }
        ]
      }
    });
    chatAPI.getQuickAccessRooms.mockResolvedValue({
      data: {
        rooms: {
          state: { _id: 'state-ma', type: 'state', name: 'Massachusetts' },
          county: { _id: 'county-suffolk', type: 'county', name: 'Suffolk County, Massachusetts' },
          zip: null,
          cities: [
            { _id: 'city-boston', type: 'city', name: 'Boston (ZIP 02116)', distanceMiles: 2.5 },
            { _id: 'city-cambridge', type: 'city', name: 'Cambridge (ZIP 02139)', distanceMiles: 4.1 }
          ]
        }
      }
    });

    await renderChat();

    expect(container.querySelectorAll('[data-discovery-state-summary]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-discovery-city]')).toHaveLength(0);

    const stateChatsToggle = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('State Rooms'));
    expect(stateChatsToggle).not.toBeNull();

    await act(async () => {
      stateChatsToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const stateSummaryButtons = Array.from(container.querySelectorAll('[data-discovery-state-summary]'));
    const stateSummaries = stateSummaryButtons
      .map((node) => node.getAttribute('data-discovery-state-summary'));
    expect(stateSummaries).toEqual(['Alabama', 'California', 'Wyoming']);
    // Verify new room item format: # prefix, room name, and uppercase TYPE badge
    expect(stateSummaryButtons.map((node) => node.textContent)).toEqual([
      '#Alabamastate',
      '#Californiastate',
      '#Wyomingstate'
    ]);

    for (const button of stateSummaryButtons) {
      await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
      });
    }

    const cityRows = Array.from(container.querySelectorAll('[data-discovery-city]'))
      .map((node) => node.getAttribute('data-discovery-city'));
    expect(cityRows).toEqual([
      'Mobile, Alabama',
      'Los Angeles, California',
      'San Diego, California'
    ]);
  });

  it('joins a state room from the discovery section', async () => {
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
          { _id: 'state-ca', type: 'state', name: 'California', state: 'CA', discoveryGroup: 'states', members: [] },
          { _id: 'topic-ai', type: 'topic', name: 'AI', discoveryGroup: 'topics', members: [] }
        ]
      }
    });
    chatAPI.getMessages.mockResolvedValue({
      data: { messages: [], pagination: { hasMore: false } }
    });

    await renderChat();

    // Expand state chats
    const stateChatsToggle = Array.from(container.querySelectorAll('button'))
      .find((btn) => btn.textContent.includes('State Rooms'));
    await act(async () => {
      stateChatsToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    // Click on the state room to open it (rooms without children open directly)
    const stateRoomButton = container.querySelector('[data-discovery-state-summary="California"]');
    expect(stateRoomButton).not.toBeNull();

    await act(async () => {
      stateRoomButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(chatAPI.joinRoom).toHaveBeenCalledWith('state-ca');
  });

  it('loads the SocialSecure topic room by default when chat opens', async () => {
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
          { _id: 'topic-socialsecure', type: 'topic', name: 'SocialSecure', discoveryGroup: 'topics', defaultLanding: true, members: [] },
          { _id: 'state-ca', type: 'state', name: 'California', discoveryGroup: 'states', members: [] }
        ]
      }
    });
    chatAPI.getMessages.mockResolvedValue({ data: { messages: [], pagination: { hasMore: false } } });

    await renderChat();

    expect(chatAPI.getMessages).toHaveBeenCalledWith('topic-socialsecure', 1, 40);
    expect(container.textContent).toContain('SocialSecure');
  });

  it('auto-joins state/county rooms and keeps SocialSecure selected on initial chat load', async () => {
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
          { _id: 'topic-socialsecure', type: 'topic', name: 'SocialSecure', discoveryGroup: 'topics', defaultLanding: true, members: [] },
          { _id: 'state-tx', type: 'state', name: 'Texas', discoveryGroup: 'states', members: [] },
          { _id: 'county-travis', type: 'county', name: 'Travis County, Texas', discoveryGroup: 'counties', members: [] },
          { _id: 'county-fairfield', type: 'county', name: 'Fairfield County, Connecticut', discoveryGroup: 'counties', members: ['u1'] },
          { _id: 'county-montgomery', type: 'county', name: 'Montgomery County, Maryland', discoveryGroup: 'counties', members: ['u1'] }
        ]
      }
    });
    chatAPI.getQuickAccessRooms.mockResolvedValue({
      data: {
        rooms: {
          state: { _id: 'state-tx', type: 'state', name: 'Texas' },
          county: { _id: 'county-travis', type: 'county', name: 'Travis County, Texas' },
          zip: null,
          cities: []
        }
      }
    });
    chatAPI.getMessages.mockResolvedValue({ data: { messages: [], pagination: { hasMore: false } } });

    await renderChat();

    expect(chatAPI.joinRoom).toHaveBeenCalledWith('state-tx');
    expect(chatAPI.joinRoom).toHaveBeenCalledWith('county-travis');
    expect(chatAPI.joinRoom).toHaveBeenCalledWith('topic-socialsecure');
    expect(chatAPI.getMessages).toHaveBeenCalledWith('topic-socialsecure', 1, 40);
    const joinedRoomItems = Array.from(container.querySelectorAll('[data-room-tree-item]'));
    expect(joinedRoomItems.map((node) => node.getAttribute('data-room-tree-item'))).toEqual(
      expect.arrayContaining(['SocialSecure', 'Travis County, Texas'])
    );
    expect(container.querySelector('[data-testid="topic-joined-rooms"]')?.textContent).toContain('SocialSecure');
    expect(container.querySelector('[data-testid="state-joined-rooms"]')?.textContent).toContain('Texas');
    const countyJoinedText = container.querySelector('[data-testid="county-joined-rooms"]')?.textContent || '';
    expect(countyJoinedText).toContain('Travis County, Texas');
    expect(countyJoinedText).not.toContain('Fairfield County, Connecticut');
    expect(countyJoinedText).not.toContain('Montgomery County, Maryland');
  });

  it('does not auto-join county rooms flagged as default landing', async () => {
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
          { _id: 'topic-socialsecure', type: 'topic', name: 'SocialSecure', discoveryGroup: 'topics', defaultLanding: true, members: [] },
          { _id: 'state-tx', type: 'state', name: 'Texas', discoveryGroup: 'states', members: [] },
          { _id: 'county-hays', type: 'county', name: 'Hays County, Texas', discoveryGroup: 'counties', defaultLanding: true, members: [] }
        ]
      }
    });
    chatAPI.getQuickAccessRooms.mockResolvedValue({
      data: {
        rooms: {
          state: { _id: 'state-tx', type: 'state', name: 'Texas' },
          county: { _id: 'county-hays', type: 'county', name: 'Hays County, Texas' },
          zip: null,
          cities: []
        }
      }
    });
    chatAPI.getMessages.mockResolvedValue({ data: { messages: [], pagination: { hasMore: false } } });

    await renderChat();

    expect(chatAPI.joinRoom).toHaveBeenCalledWith('state-tx');
    expect(chatAPI.joinRoom).toHaveBeenCalledWith('county-hays');
    expect(chatAPI.joinRoom).toHaveBeenCalledWith('topic-socialsecure');
    const countyJoinCalls = chatAPI.joinRoom.mock.calls.filter(([roomId]) => roomId === 'county-hays');
    expect(countyJoinCalls).toHaveLength(1);
  });

  it('shows a collapsed admin control panel by default and expands it for room management', async () => {
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
    chatAPI.getAllRooms.mockResolvedValue({
      data: {
        rooms: [
          { _id: 'state-ca', type: 'state', name: 'California', state: 'CA', discoveryGroup: 'states', sortOrder: 0 },
          { _id: 'topic-socialsecure', type: 'topic', name: 'SocialSecure', discoveryGroup: 'topics', sortOrder: 0, defaultLanding: true }
        ]
      }
    });

    await renderChat();

    expect(container.querySelector('[data-testid="chat-admin-control-panel"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Admin room name"]')).toBeNull();

    const toggleAdminControls = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Admin Panel'));
    expect(toggleAdminControls).not.toBeUndefined();

    await act(async () => {
      toggleAdminControls.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const adminDialog = document.body.querySelector('[role="dialog"][aria-labelledby="chat-admin-control-panel-title"]');
    expect(adminDialog).not.toBeNull();
    const adminNameInput = document.body.querySelector('input[aria-label="Admin room name"]');
    const adminParentSelect = document.body.querySelector('select[aria-label="Admin room parent"]');
    expect(adminNameInput).not.toBeNull();
    expect(adminParentSelect).not.toBeNull();

    await act(async () => {
      setInputValue(adminNameInput, 'Los Angeles');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      nativeSetter.call(adminParentSelect, 'state-ca');
      adminParentSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });

    const addRoomButton = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent === 'Add room');
    expect(addRoomButton).not.toBeUndefined();

    await act(async () => {
      addRoomButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(chatAPI.createManagedRoom).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Los Angeles',
      parentRoomId: 'state-ca'
    }));

    const moveDownButton = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent === '↓');
    expect(moveDownButton).not.toBeUndefined();

    await act(async () => {
      moveDownButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(chatAPI.moveRoom).toHaveBeenCalled();
  });

  it('closes the admin popup on escape and backdrop click but not dialog content click', async () => {
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
    chatAPI.getAllRooms.mockResolvedValue({
      data: {
        rooms: [
          { _id: 'state-ca', type: 'state', name: 'California', state: 'CA', discoveryGroup: 'states', sortOrder: 0 },
          { _id: 'topic-socialsecure', type: 'topic', name: 'SocialSecure', discoveryGroup: 'topics', sortOrder: 0, defaultLanding: true }
        ]
      }
    });

    await renderChat();

    const toggleAdminControls = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Admin Panel'));
    await act(async () => {
      toggleAdminControls.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    let adminDialog = document.body.querySelector('[role="dialog"][aria-labelledby="chat-admin-control-panel-title"]');
    expect(adminDialog).not.toBeNull();

    const adminNameInput = document.body.querySelector('input[aria-label="Admin room name"]');
    expect(adminNameInput).not.toBeNull();
    await act(async () => {
      adminNameInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    adminDialog = document.body.querySelector('[role="dialog"][aria-labelledby="chat-admin-control-panel-title"]');
    expect(adminDialog).not.toBeNull();

    await act(async () => {
      adminDialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await flush();
    });
    expect(document.body.querySelector('[role="dialog"][aria-labelledby="chat-admin-control-panel-title"]')).toBeNull();

    await act(async () => {
      toggleAdminControls.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    adminDialog = document.body.querySelector('[role="dialog"][aria-labelledby="chat-admin-control-panel-title"]');
    expect(adminDialog).not.toBeNull();
    await act(async () => {
      adminDialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(document.body.querySelector('[role="dialog"][aria-labelledby="chat-admin-control-panel-title"]')).toBeNull();
  });

  it('uses readable light-theme category pills and compact DM conversation row sizing', async () => {
    localStorage.setItem('chatTheme', 'light');
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
    chatAPI.getAllRooms.mockResolvedValue({
      data: {
        rooms: [
          { _id: 'state-ca', type: 'state', name: 'California', discoveryGroup: 'states', members: [] }
        ]
      }
    });

    await renderChat();

    const stateChatsToggle = Array.from(container.querySelectorAll('button'))
      .find((btn) => btn.textContent.includes('State Rooms'));
    await act(async () => {
      stateChatsToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    const statePill = Array.from(container.querySelectorAll('[data-room-tree-item="California"] span'))
      .find((node) => node.textContent === 'state');
    expect(statePill?.className || '').toContain('text-sky-800');

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    const dmRowButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('@buddy') && button.className.includes('text-xs'));
    expect(dmRowButton).not.toBeUndefined();
    expect(dmRowButton.className).toContain('py-1.5');
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

    const roomSearchInput = container.querySelector('input[placeholder="Search rooms..."]');
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

    const roomSearchInput = container.querySelector('input[placeholder="Search rooms..."]');
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

  it('opens rooms from search and loads messages for the last opened room', async () => {
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

    const roomSearchInput = container.querySelector('input[placeholder="Search rooms..."]');
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

    expect(container.textContent).toContain('Loaded topic-7');
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

    const searchTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
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
          zip: { current: null, nearby: [] },
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
    expect(desktopGrid.className).toContain('lg:grid-cols-[16rem_1fr_14rem]');
    expect(desktopGrid.className).toContain('gap-0');

    const pageHeader = container.querySelector('[data-testid="chat-page-header"]');
    expect(pageHeader).not.toBeNull();
    expect(pageHeader.className).not.toContain('sticky');

    const workspacePanel = container.querySelector('[data-testid="chat-workspace-panel"]');
    expect(workspacePanel).not.toBeNull();
    expect(workspacePanel.contains(pageHeader)).toBe(true);

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

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
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

  it('uses theme-driven sender accents and sends transformed slash command content', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
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

    expect(container.querySelector('input[type="color"]')).toBeNull();
    expect(container.textContent).not.toContain('Theme-tuned accents');

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
    expect(sendButton.disabled).toBe(false);
    await act(async () => {
      sendButton.click();
      await flush();
    });

    expect(chatAPI.sendMessage).toHaveBeenCalledWith('topic-socialsecure', expect.objectContaining({
      content: 'alpha cries'
    }));
  });

  it('opens a user context menu with requested actions on right click', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
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
    chatAPI.getRoomUsers.mockResolvedValue({
      data: {
        users: [{ _id: 'u2', username: 'buddy', realName: 'Buddy' }]
      }
    });

    await renderChat();

    const userRow = Array.from(container.querySelectorAll('li')).find((node) => node.textContent.includes('buddy'));
    expect(userRow).not.toBeUndefined();

    await act(async () => {
      userRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 140, clientY: 120 }));
      await flush();
    });

    expect(container.textContent).toContain('Send direct message');
    expect(container.textContent).toContain('View user social');
    expect(container.textContent).toContain('Request friendship');
    expect(container.textContent).toContain('Block/ignore');
    expect(container.textContent).toContain('Mute user');
    expect(container.textContent).toContain('Report user');
  });

  it('replaces attachment control with URL formatter and inserts a short link token', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
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
          zip: { current: null, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getMessages.mockResolvedValue({
      data: {
        messages: [
          {
            _id: 'm-link',
            content: 'Internal https://socialsecure.test/social and external https://example.com',
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        pagination: { hasMore: false }
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
          zip: { current: null, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getMessages.mockResolvedValue({
      data: {
        messages: [
          {
            _id: 'm-avatar',
            content: 'hello',
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        pagination: { hasMore: false }
      }
    });

    await renderChat();

    const profileLinks = Array.from(container.querySelectorAll('a')).filter((node) =>
      (node.getAttribute('href') || '').includes('/social?user=')
    );
    expect(profileLinks.length).toBeGreaterThan(0);
    expect(profileLinks.some((link) => link.getAttribute('href') === '/social?user=buddy')).toBe(true);
    expect(profileLinks[0].className).toContain('h-5');
    expect(profileLinks[0].className).toContain('w-5');

    const messageText = Array.from(container.querySelectorAll('p')).find((node) => node.textContent.includes('hello'));
    expect(messageText).not.toBeUndefined();
    expect(messageText.className).toContain('leading-5');
    const messageBubble = messageText.closest('div[class*="rounded"]');
    expect(messageBubble).not.toBeNull();
    expect(messageBubble.className).toContain('px-0.5');

    const messageViewport = messageText.closest('div.overflow-y-auto');
    expect(messageViewport).not.toBeNull();
    expect(messageViewport.className).toContain('py-3');
  });

  it('shows own sender link and avatar initials in message bubbles', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', realName: 'Alice Zephyr', zipCode: '02115' } }
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
    chatAPI.getMessages.mockResolvedValue({
      data: {
        messages: [
          {
            _id: 'm-own',
            content: 'sent-by-me',
            userId: { _id: 'u1', username: 'alpha', realName: 'Alice Zephyr' },
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        pagination: { hasMore: false }
      }
    });

    await renderChat();

    const ownNameLink = Array.from(container.querySelectorAll('a')).find((node) => node.textContent === '@alpha');
    expect(ownNameLink).not.toBeUndefined();
    expect(ownNameLink.getAttribute('href')).toBe('/social?user=alpha');

    const messageArticle = ownNameLink.closest('article[data-chat-message-layout="room"]');
    expect(messageArticle).not.toBeNull();

    const avatarLink = Array.from(messageArticle.querySelectorAll('a')).find((node) => node.className.includes('h-5') && node.className.includes('w-5'));
    expect(avatarLink).not.toBeUndefined();
    expect(avatarLink.getAttribute('href')).toBe('/social?user=alpha');
    expect(avatarLink.textContent).toContain('AZ');
  });

  it('formats named links and opens user actions from message click', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
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
    chatAPI.getMessages.mockResolvedValue({
      data: {
        messages: [
          {
            _id: 'm-link-name',
            content: '[Docs](https://example.com/product/guide)',
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        pagination: { hasMore: false }
      }
    });

    await renderChat();

    const namedLink = Array.from(container.querySelectorAll('a')).find((node) => node.textContent.startsWith('Docs ('));
    expect(namedLink).not.toBeUndefined();
    expect(namedLink.getAttribute('href')).toBe('https://example.com/product/guide');

    const authorAction = Array.from(container.querySelectorAll('a')).find((node) => node.textContent === '@buddy');
    expect(authorAction).not.toBeUndefined();
    expect(authorAction.getAttribute('href')).toBe('/social?user=buddy');

    const messageArticle = authorAction.closest('article[data-chat-message-layout="room"]');
    expect(messageArticle).not.toBeNull();
    await act(async () => {
      messageArticle.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
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

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const conversationHeader = container.querySelector('[data-testid="chat-page-header"]');
    expect(conversationHeader).not.toBeNull();
    expect(conversationHeader.textContent).toContain('@buddy');
  });

  it('shows a delete button on DM conversations and removes conversation on click', async () => {
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
    chatAPI.deleteConversation.mockResolvedValue({ data: { success: true } });

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const deleteButton = container.querySelector('button[aria-label="Delete conversation with @buddy"]');
    expect(deleteButton).not.toBeNull();

    window.confirm = jest.fn(() => true);
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

    await act(async () => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(chatAPI.deleteConversation).toHaveBeenCalledWith('dm1');
  });

  it('renders sender names with theme-selected accent styling', async () => {
    localStorage.setItem('chatTheme', 'ocean');
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
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
    chatAPI.getMessages.mockResolvedValue({
      data: {
        messages: [
          {
            _id: 'm-legibility',
            content: 'readable name',
            userId: { _id: 'u2', username: 'buddy' },
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        pagination: { hasMore: false }
      }
    });

    await renderChat();

    const authorAction = Array.from(container.querySelectorAll('a')).find((node) => node.textContent === '@buddy');
    expect(authorAction).not.toBeUndefined();
    expect(authorAction.className).toContain('font-semibold');
    expect(authorAction.className).toContain('text-emerald-400');
  });

  it('groups consecutive room messages into a Discord-like stack', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
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
    chatAPI.getMessages.mockResolvedValue({
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
        ],
        pagination: { hasMore: false }
      }
    });

    await renderChat();

    const roomMessages = Array.from(container.querySelectorAll('[data-chat-message-layout="room"]'));
    expect(roomMessages).toHaveLength(3);
    expect(roomMessages[0].getAttribute('data-chat-grouped')).toBe('false');
    expect(roomMessages[1].getAttribute('data-chat-grouped')).toBe('true');
    expect(Array.from(container.querySelectorAll('a')).filter((node) => node.textContent === '@buddy')).toHaveLength(1);
  });

  it('opens a direct message when loaded with a social deep link target', async () => {
    window.history.replaceState({}, '', '/chat?dm=u2');

    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
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

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
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

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
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

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
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

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
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

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
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

  it('does not auto-unlock DM from cookie cache when local vault is still locked', async () => {
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
    const expiresAt = Date.now() + (10 * 60 * 1000);
    document.cookie = `socialsecure_dm_unlock_v1=${encodeURIComponent(JSON.stringify({
      expiresAt,
      conversationIds: ['dm1']
    }))}; Path=/`;

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(container.querySelector('[data-testid="dm-lock-overlay"]')).not.toBeNull();
    expect(container.querySelector('textarea').disabled).toBe(true);
  });

  it('retries DM message decrypt after unlock when first decrypt attempts fail', async () => {
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
    decryptEnvelope
      .mockRejectedValueOnce(new Error('Missing room key for this message version.'))
      .mockRejectedValueOnce(new Error('Missing room key for this message version.'))
      .mockResolvedValueOnce('hello after retry');

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    await unlockActiveDm();
    await act(async () => {
      await wait(DM_DECRYPT_RETRY_TEST_WAIT_MS);
      await flush();
      await flush();
    });

    expect(decryptEnvelope).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain('hello after retry');
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

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
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

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
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
          zip: { current: null, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });

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
          roomId: 'topic-socialsecure',
          content: 'incoming live message',
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: new Date().toISOString()
        }
      });
      await flush();
    });

    expect(container.textContent).toContain('incoming live message');
    expect(chatAPI.getMessages).toHaveBeenCalledTimes(1);
  });

  it('hides the right sidebar and uses a two-column grid in DM mode', async () => {
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
    chatAPI.getConversationUsers.mockImplementation((conversationId) => {
      if (conversationId === 'zip1') {
        return Promise.resolve({ data: { users: [] } });
      }
      return Promise.resolve({
        data: {
          users: [
            { _id: 'u1', username: 'alpha' },
            { _id: 'u2', username: 'buddy' }
          ]
        }
      });
    });

    await renderChat();

    // In default CHAT mode the grid has three columns including the right sidebar
    const desktopGrid = container.querySelector('[data-testid="chat-layout-grid"]');
    expect(desktopGrid.className).toContain('lg:grid-cols-[16rem_1fr_14rem]');

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      await flush();
    });

    // After switching to DM mode the grid drops to two columns
    expect(desktopGrid.className).toContain('lg:grid-cols-[16rem_1fr]');
    expect(desktopGrid.className).not.toContain('14rem');

    // Right panel content should not be rendered in DM mode
    expect(container.textContent).not.toContain('Participants');
    expect(container.textContent).not.toContain('People in this DM');
    expect(container.textContent).not.toContain('Users in Room');

    // DM conversation list still shows the peer username
    expect(container.textContent).toContain('@buddy');
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

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DIRECT MSG');
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
          zip: { current: null, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getMessages.mockResolvedValue({
      data: {
        messages: [{
          _id: 'm-react-1',
          content: 'hello',
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: new Date().toISOString()
        }],
        pagination: { hasMore: false }
      }
    });

    await renderChat();

    expect(container.querySelector('button[aria-label="Add Like reaction"]')).toBeNull();
    await act(async () => {
      const messageBubble = Array.from(container.querySelectorAll('p')).find((node) => node.textContent.includes('hello'))?.closest('div.relative');
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
      const messageBubble = Array.from(container.querySelectorAll('p')).find((node) => node.textContent.includes('hello'))?.closest('div.relative');
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
          zip: { current: null, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getMessages.mockResolvedValue({
      data: {
        messages: [{
          _id: 'room-m-1',
          content: 'room ok',
          moderation: { removedByAdmin: false, removedByAdminAt: null },
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: '2024-01-01T13:41:25'
        }],
        pagination: { hasMore: false }
      }
    });
    chatAPI.getRoomUsers.mockResolvedValue({
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

    expect(moderationAPI.removeMessageByAdmin).toHaveBeenCalledWith('room-m-1', 'room');
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

    expect(moderationAPI.restoreMessageByAdmin).toHaveBeenCalledWith('room-m-1', 'room');
    expect(moderationAPI.unmuteUserByAdmin).toHaveBeenCalledWith('u2');
    expect(container.querySelector('button[aria-label="Remove message"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Mute user for 2 hours"]')).not.toBeNull();
  });

  it('renders Topic Rooms section in chat discovery sidebar', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
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
    chatAPI.getAllRooms.mockResolvedValue({
      data: {
        rooms: [
          { _id: 'topic-socialsecure', type: 'topic', name: 'SocialSecure', discoveryGroup: 'topics', defaultLanding: true, sortOrder: 0 },
          { _id: 'topic-tech', type: 'topic', name: 'Technology', discoveryGroup: 'topics', sortOrder: 1 }
        ]
      }
    });

    await renderChat();
    expect(container.textContent).toContain('Topic Rooms');
    const topicToggle = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Topic Rooms'));
    expect(topicToggle).toBeDefined();
  });

  it('shows channel notification counters for dm unread and room ping unread', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'topic-socialsecure', type: 'topic', title: 'SocialSecure' }, nearby: [] },
          dm: [{ _id: 'dm-1', type: 'dm', lastMessageAt: '2024-01-01T00:00:00.000Z', peer: { _id: 'u2', username: 'buddy' } }],
          profile: []
        }
      }
    });
    chatAPI.getMessages.mockResolvedValue({ data: { messages: [], pagination: { hasMore: false } } });

    await renderChat();
    const dmTab = Array.from(container.querySelectorAll('[data-chat-channel-tabs] button'))
      .find((button) => button.textContent.includes('DIRECT MSG'));
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    await act(async () => {
      mockRealtimeChatHandler?.({
        message: {
          _id: 'm-ping-1',
          roomId: 'topic-socialsecure',
          content: '@alpha hi',
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: new Date().toISOString()
        }
      });
      await flush();
    });

    const directMsgTab = Array.from(container.querySelectorAll('[data-chat-channel-tabs] button'))
      .find((button) => button.textContent.includes('DIRECT MSG'));
    expect(directMsgTab?.textContent).toContain('DIRECT MSG');
  });

  it('shows unread divider label when opening a room with new messages after last seen', async () => {
    localStorage.setItem('socialsecure_chat_last_seen_ts_v1', JSON.stringify({ 'topic-socialsecure': new Date('2024-01-01T00:01:30.000Z').getTime() }));
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'topic-socialsecure', type: 'topic', title: 'SocialSecure' }, nearby: [] },
          dm: [],
          profile: []
        }
      }
    });
    chatAPI.getMessages.mockResolvedValue({
      data: {
        messages: [
          { _id: 'm1', content: 'old', roomId: 'topic-socialsecure', userId: { _id: 'u2', username: 'buddy' }, createdAt: '2024-01-01T00:01:00.000Z' },
          { _id: 'm2', content: 'new', roomId: 'topic-socialsecure', userId: { _id: 'u3', username: 'charlie' }, createdAt: '2024-01-01T00:02:00.000Z' }
        ],
        pagination: { hasMore: false }
      }
    });

    await renderChat();
    expect(container.querySelector('[data-testid="chat-unread-divider"]')).not.toBeNull();
  });

  it('renders theme selector and presence selector with dnd option', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
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
    const themeSelector = container.querySelector('select[aria-label="Chat theme selector"]');
    const presenceSelector = container.querySelector('select[aria-label="Presence status selector"]');
    expect(themeSelector).not.toBeNull();
    expect(presenceSelector).not.toBeNull();
    const themeOptions = Array.from(themeSelector.querySelectorAll('option')).map((option) => option.textContent);
    expect(themeOptions).toContain('Dark');
    expect(themeOptions).toContain('Light');
    expect(themeOptions).toContain('Medium');
    expect(Array.from(presenceSelector.querySelectorAll('option')).map((option) => option.textContent)).toEqual(['Online', 'Away', 'Do Not Disturb']);
  });

  it('admin can permanently delete a message via the delete button', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115', isAdmin: true } }
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
    chatAPI.getMessages.mockResolvedValue({
      data: {
        messages: [{
          _id: 'del-m-1',
          content: 'delete me',
          moderation: { removedByAdmin: false, removedByAdminAt: null },
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: '2024-01-01T13:41:25'
        }],
        pagination: { hasMore: false }
      }
    });
    chatAPI.getRoomUsers.mockResolvedValue({
      data: {
        users: [
          { _id: 'u1', username: 'alpha', mutedUntil: null },
          { _id: 'u2', username: 'buddy', mutedUntil: null }
        ]
      }
    });
    moderationAPI.deleteMessageByAdmin.mockResolvedValue({ data: { success: true } });

    await renderChat();
    await act(async () => { await flush(); });

    expect(container.textContent).toContain('delete me');
    const deleteButton = container.querySelector('button[aria-label="Delete message"]');
    expect(deleteButton).not.toBeNull();

    await act(async () => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(moderationAPI.deleteMessageByAdmin).toHaveBeenCalledWith('del-m-1', 'room');
    expect(container.textContent).not.toContain('delete me');
  });

  it('renders compact timestamps for chat messages', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
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
    chatAPI.getMessages.mockResolvedValue({
      data: {
        messages: [{
          _id: 'm-time-1',
          content: 'timestamp me',
          userId: { _id: 'u2', username: 'buddy' },
          createdAt: '2024-01-01T13:41:25'
        }],
        pagination: { hasMore: false }
      }
    });

    await renderChat();

    expect(container.textContent).toContain('1/1/24 - 1:41:25pm');
  });
});
