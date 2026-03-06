import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Chat from './Chat';
import { authAPI, chatAPI } from '../utils/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../utils/api', () => ({
  authAPI: {
    getProfile: jest.fn()
  },
  chatAPI: {
    getConversations: jest.fn(),
    getConversationMessages: jest.fn(),
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

  const renderChat = async () => {
    await act(async () => {
      root.render(<Chat />);
      await flush();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    chatAPI.getConversationMessages.mockResolvedValue({ data: { messages: [] } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
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
    expect(container.textContent).not.toContain('Add a zip code in your profile to enable default zip-room chat.');
  });

  it('shows add-zip warning when neither profile nor hub has zip information', async () => {
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

    expect(container.textContent).toContain('Add a zip code in your profile to enable default zip-room chat.');
  });
});
