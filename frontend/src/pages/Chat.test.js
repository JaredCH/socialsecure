import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Chat from './Chat';
import { authAPI, chatAPI, friendsAPI, moderationAPI, userAPI } from '../utils/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../utils/api', () => ({
  authAPI: {
    getProfile: jest.fn()
  },
  chatAPI: {
    getConversations: jest.fn(),
    getConversationMessages: jest.fn(),
    getConversationUsers: jest.fn(),
    sendConversationMessage: jest.fn(),
    startDM: jest.fn()
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

    expect(container.textContent).toContain('Your default zip room: 02115');
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

  it('renders six readable theme options', async () => {
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
});
