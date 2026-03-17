import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Friends from './Friends';
import { friendsAPI, circlesAPI, discoveryAPI } from '../utils/api';

jest.mock('../utils/api', () => ({
  friendsAPI: {
    getFriends: jest.fn(),
    getIncomingRequests: jest.fn(),
    getOutgoingRequests: jest.fn(),
    getTopFriends: jest.fn(),
    sendRequest: jest.fn(),
    removeFriend: jest.fn()
  },
  circlesAPI: {
    getCircles: jest.fn()
  },
  discoveryAPI: {
    getUsers: jest.fn()
  },
  getAuthToken: jest.fn().mockReturnValue('token')
}));

jest.mock('../utils/realtime', () => ({
  getRealtimeSocket: jest.fn(),
  onFriendPresence: jest.fn(() => () => {})
}));

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn()
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Friends page request flow', () => {
  let container;
  let root;

  const renderPage = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Friends user={{ _id: 'viewer-1', username: 'viewer' }} />
        </MemoryRouter>
      );
    });
  };

  beforeEach(() => {
    friendsAPI.getFriends.mockResolvedValue({ data: { friends: [] } });
    friendsAPI.getIncomingRequests.mockResolvedValue({ data: { requests: [] } });
    friendsAPI.getOutgoingRequests.mockResolvedValue({ data: { requests: [] } });
    friendsAPI.getTopFriends.mockResolvedValue({ data: { topFriends: [] } });
    friendsAPI.sendRequest.mockResolvedValue({ data: { success: true } });
    friendsAPI.removeFriend.mockResolvedValue({ data: { success: true } });
    circlesAPI.getCircles.mockResolvedValue({ data: { circles: [] } });
    discoveryAPI.getUsers.mockResolvedValue({ data: { users: [] } });

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

  it('allows canceling an outgoing friend request from the requests tab', async () => {
    friendsAPI.getOutgoingRequests.mockResolvedValueOnce({
      data: {
        requests: [{ _id: 'req-1', user: { _id: 'u-1', username: 'alice' } }]
      }
    });

    await renderPage();

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Requests'))?.click();
    });
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Cancel')?.click();
    });

    expect(friendsAPI.removeFriend).toHaveBeenCalledWith('req-1');
  });

  it('searches discovery users and allows requesting non-friends', async () => {
    discoveryAPI.getUsers.mockResolvedValueOnce({
      data: {
        users: [{ _id: 'u-2', username: 'bob', realName: 'Bob Doe' }]
      }
    });

    await renderPage();

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Find Friends'))?.click();
    });
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Search')?.click();
    });
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add Friend')?.click();
    });

    expect(discoveryAPI.getUsers).toHaveBeenCalledWith('', 1, 25);
    expect(friendsAPI.sendRequest).toHaveBeenCalledWith('u-2');

    const link = container.querySelector('a[href="/social?user=bob"]');
    expect(link).toBeTruthy();
  });
});
