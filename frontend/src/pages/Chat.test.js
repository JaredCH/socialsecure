import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Chat from './Chat';
import { authAPI, chatAPI, userAPI } from '../utils/api';

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
    chatAPI.getConversationMessages.mockResolvedValue({ data: { messages: [] } });
    chatAPI.getConversationUsers.mockResolvedValue({ data: { users: [] } });
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
    expect(emptyMessages.parentElement.className).toContain('flex-1');
    expect(emptyMessages.parentElement.className).toContain('overflow-y-auto');
    expect(emptyMessages.parentElement.className).not.toContain('max-h-[460px]');

    const sidebars = container.querySelectorAll('aside');
    expect(sidebars.length).toBeGreaterThanOrEqual(2);
    expect(sidebars[0].className).toContain('overflow-hidden');
  });
});
