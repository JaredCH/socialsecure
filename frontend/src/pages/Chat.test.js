import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Chat from './Chat';
import { authAPI, chatAPI, friendsAPI, moderationAPI, userAPI } from '../utils/api';
import { createWrappedRoomKeyPackage, encryptEnvelope, unlockOrCreateVault } from '../utils/e2ee';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../utils/api', () => ({
  authAPI: {
    getProfile: jest.fn()
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
    startDM: jest.fn(),
    getProfileThread: jest.fn()
  },
  friendsAPI: {
    sendRequest: jest.fn()
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

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    chatAPI.getConversationMessages.mockResolvedValue({ data: { messages: [] } });
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
    createWrappedRoomKeyPackage.mockResolvedValue({
      senderDeviceId: 'device-1',
      recipientDeviceId: 'device-2',
      recipientUserId: 'u2',
      keyVersion: 1,
      wrappedRoomKey: 'wrap',
      nonce: 'nonce',
      aad: '',
      signature: 'sig',
      wrappedKeyHash: 'hash',
      algorithms: { encryption: 'AES-256-GCM', wrapping: 'PBKDF2', signing: 'ECDSA', hash: 'SHA-256' }
    });
    friendsAPI.sendRequest.mockResolvedValue({ data: { success: true } });
    moderationAPI.blockUser.mockResolvedValue({ data: { success: true } });
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

  it('provides room and user autocomplete suggestions', async () => {
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
    userAPI.search.mockResolvedValue({
      data: { users: [{ _id: 'u2', username: 'buddy' }] }
    });

    await renderChat();

    const roomInput = container.querySelector('input[placeholder="Search room names..."]');
    const userInput = container.querySelector('input[placeholder="Search username or name..."]');
    expect(roomInput).not.toBeNull();
    expect(userInput).not.toBeNull();

    await act(async () => {
      setInputValue(roomInput, '02116');
      await flush();
    });
    expect(container.textContent).toContain('Zip 02116');

    await act(async () => {
      setInputValue(userInput, 'bu');
      await flush();
    });
    expect(userAPI.search).not.toHaveBeenCalled();

    await act(async () => {
      await wait(350);
    });
    expect(userAPI.search).toHaveBeenCalledWith('bu');
    expect(container.textContent).toContain('@buddy');
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
    expect(themeSelect.value).toBe('classic');
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
    expect(themeSelect.value).toBe('classic');
  });

  it('sends transformed slash command content with selected name color', async () => {
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

    const colorInput = container.querySelector('input[type="color"]');
    expect(colorInput).not.toBeNull();
    await act(async () => {
      const colorSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      colorSetter.call(colorInput, '#ff0000');
      colorInput.dispatchEvent(new Event('input', { bubbles: true }));
      colorInput.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });

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
      content: 'alpha cries',
      senderNameColor: '#ff0000'
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
    expect(profileLinks[0].className).toContain('h-5');
    expect(profileLinks[0].className).toContain('w-5');

    const messageText = Array.from(container.querySelectorAll('p')).find((node) => node.textContent === 'hello');
    expect(messageText).not.toBeUndefined();
    expect(messageText.className).toContain('leading-4');
    const messageBubble = messageText.closest('div[class*="rounded"]');
    expect(messageBubble).not.toBeNull();
    expect(messageBubble.className).toContain('px-1.5');
    expect(messageBubble.className).toContain('py-0.5');

    const messageViewport = messageText.closest('div.overflow-y-auto');
    expect(messageViewport).not.toBeNull();
    expect(messageViewport.className).toContain('space-y-1');
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

  it('opens a profile thread when loaded with a social profile deep link target', async () => {
    window.history.replaceState({}, '', '/chat?profile=u2');

    authAPI.getProfile.mockResolvedValue({
      data: { user: { _id: 'u1', username: 'alpha', zipCode: '02115' } }
    });
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: { _id: 'zip1', type: 'zip-room', zipCode: '02115', title: 'Zip 02115' }, nearby: [] },
          dm: [],
          profile: [{ _id: 'pt-u2', type: 'profile-thread', profileUser: { _id: 'u2', username: 'buddy' } }]
        }
      }
    });
    chatAPI.getProfileThread.mockResolvedValue({
      data: {
        conversation: {
          _id: 'pt-u2',
          type: 'profile-thread'
        }
      }
    });

    await renderChat();

    expect(chatAPI.getProfileThread).toHaveBeenCalledWith('u2');
    expect(window.location.pathname).toBe('/chat');
    expect(window.location.search).toBe('');
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
          { userId: 'u1', deviceId: 'device-1' },
          { userId: 'u2', deviceId: 'device-2' }
        ]
      }
    });

    await renderChat();

    const dmTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Direct Messages');
    await act(async () => {
      dmTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

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
    const passwordInput = container.querySelector('input[aria-label="Encryption password"]');
    expect(passwordInput).not.toBeNull();
    await act(async () => {
      setInputValue(passwordInput, 'secret-password');
      await flush();
    });
    const unlockButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Unlock');
    await act(async () => {
      unlockButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(chatAPI.sendConversationE2EEMessage).toHaveBeenCalledWith('dm1', expect.objectContaining({
      e2ee: expect.any(Object)
    }));
    expect(chatAPI.sendConversationMessage).not.toHaveBeenCalledWith('dm1', expect.anything());
  });

  it('supports DM offline controls state transitions', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
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

    const goOfflineButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Go Offline');
    expect(goOfflineButton).not.toBeUndefined();
    await act(async () => {
      goOfflineButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    const passwordInput = container.querySelector('input[aria-label="Encryption password"]');
    expect(passwordInput).not.toBeNull();
    await act(async () => {
      setInputValue(passwordInput, 'secret-password');
      await flush();
    });
    const unlockButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Unlock');
    await act(async () => {
      unlockButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      await flush();
    });

    const decryptButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Decrypt Offline Messages');
    expect(decryptButton.disabled).toBe(false);

    await act(async () => {
      decryptButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    const returnOnlineButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Return Online');
    expect(returnOnlineButton.disabled).toBe(false);
  });
});
