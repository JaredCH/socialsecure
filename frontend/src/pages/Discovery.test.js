import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Discovery from './Discovery';
import { discoveryAPI, friendsAPI, hasAuthToken } from '../utils/api';

jest.mock('../utils/api', () => ({
  discoveryAPI: {
    getUsers: jest.fn(),
    getPosts: jest.fn(),
    trackEvent: jest.fn()
  },
  friendsAPI: {
    sendRequest: jest.fn()
  },
  hasAuthToken: jest.fn()
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Discovery friend requests', () => {
  let container;
  let root;

  const renderDiscovery = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Discovery />
        </MemoryRouter>
      );
    });
  };

  beforeEach(() => {
    discoveryAPI.getUsers.mockResolvedValue({
      data: {
        users: [],
        hasMore: false
      }
    });
    discoveryAPI.getPosts.mockResolvedValue({
      data: {
        posts: [],
        hasMore: false
      }
    });
    discoveryAPI.trackEvent.mockResolvedValue({ data: { success: true } });
    friendsAPI.sendRequest.mockResolvedValue({ data: { success: true } });
    hasAuthToken.mockReturnValue(true);

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
    jest.clearAllMocks();
  });

  it('sends a request using id fallback when _id is missing', async () => {
    discoveryAPI.getUsers.mockResolvedValueOnce({
      data: {
        users: [
          {
            id: 'user-123',
            username: 'alice',
            realName: 'Alice Doe'
          }
        ],
        hasMore: false
      }
    });

    await renderDiscovery();

    const addFriendButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Add Friend'));
    expect(addFriendButton).not.toBeNull();

    await act(async () => {
      addFriendButton.click();
    });

    expect(friendsAPI.sendRequest).toHaveBeenCalledWith('user-123');
  });

  it('shows pending state when backend says a request was already sent', async () => {
    discoveryAPI.getUsers.mockResolvedValueOnce({
      data: {
        users: [
          {
            _id: '507f1f77bcf86cd799439011',
            username: 'bob',
            realName: 'Bob Doe'
          }
        ],
        hasMore: false
      }
    });
    friendsAPI.sendRequest.mockRejectedValueOnce({
      response: {
        data: {
          error: 'Friend request already sent'
        }
      }
    });

    await renderDiscovery();

    const addFriendButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Add Friend'));
    expect(addFriendButton).not.toBeNull();

    await act(async () => {
      addFriendButton.click();
    });

    expect(container.textContent).toContain('Pending');
  });

  it('shows pending state for users with outgoing pending requests', async () => {
    discoveryAPI.getUsers.mockResolvedValueOnce({
      data: {
        users: [
          {
            _id: '507f1f77bcf86cd799439099',
            username: 'pending_friend',
            realName: 'Pending Friend',
            relationship: 'pending',
            requestDirection: 'outgoing'
          }
        ],
        hasMore: false
      }
    });

    await renderDiscovery();

    expect(container.textContent).toContain('Pending');
    const addFriendButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Add Friend'));
    expect(addFriendButton).toBeUndefined();
    expect(friendsAPI.sendRequest).not.toHaveBeenCalled();
  });
});
