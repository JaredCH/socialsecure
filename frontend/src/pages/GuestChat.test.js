import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import GuestChat from './GuestChat';
import { chatAPI } from '../utils/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../utils/api', () => ({
  chatAPI: {
    getAllRooms: jest.fn(),
    getMessages: jest.fn()
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

    chatAPI.getMessages.mockImplementation(async (roomId) => ({
      data: {
        messages: roomId === 'state-tx'
          ? [{ _id: 'm-state', content: 'hello texas', userId: { username: 'buddy' } }]
          : [{ _id: 'm-topic', content: 'hello ai', userId: { username: 'beta' } }]
      }
    }));
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flush();
    });
    container.remove();
  });

  it('loads discoverable rooms and allows read-only room selection', async () => {
    await renderGuestChat();

    expect(container.textContent).toContain('Guest mode: full chat browsing (read-only)');
    expect(chatAPI.getAllRooms).toHaveBeenCalledWith(1, 500);
    expect(chatAPI.getMessages).toHaveBeenCalledWith('state-tx', 1, 100);
    expect(container.textContent).toContain('hello texas');
    expect(container.textContent).toContain('Read-only mode: sign in to send messages or react.');

    const aiButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('AI'));
    expect(aiButton).toBeDefined();
    await act(async () => {
      aiButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(chatAPI.getMessages).toHaveBeenCalledWith('topic-ai', 1, 100);
    expect(container.textContent).toContain('hello ai');
  });
});
