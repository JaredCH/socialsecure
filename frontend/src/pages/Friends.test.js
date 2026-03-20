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
    updateTopFriends: jest.fn(),
    sendRequest: jest.fn(),
    removeFriend: jest.fn(),
    updateFriendCategory: jest.fn()
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
    const input = container.querySelector('input[placeholder="Search by username or name…"]');
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, 'bob');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Search')?.click();
    });
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add Friend')?.click();
    });

    expect(discoveryAPI.getUsers).toHaveBeenCalledWith('bob', 1, 25);
    expect(friendsAPI.sendRequest).toHaveBeenCalledWith('u-2');

    const link = container.querySelector('a[href="/social?user=bob"]');
    expect(link).toBeTruthy();
  });

  it('normalizes @username search input before requesting discovery users', async () => {
    await renderPage();

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Find Friends'))?.click();
    });
    const input = container.querySelector('input[placeholder="Search by username or name…"]');
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '@alice');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Search')?.click();
    });

    expect(discoveryAPI.getUsers).toHaveBeenCalledWith('alice', 1, 25);
  });

  it('renders the Top 5 tab with existing top friends', async () => {
    friendsAPI.getTopFriends.mockResolvedValueOnce({
      data: {
        topFriends: [
          { _id: 'tf-1', username: 'alice', realName: 'Alice A', avatarUrl: '' },
          { _id: 'tf-2', username: 'bob', realName: 'Bob B', avatarUrl: '' }
        ]
      }
    });

    await renderPage();

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Top 5'))?.click();
    });

    expect(container.textContent).toContain('@alice');
    expect(container.textContent).toContain('@bob');
    expect(container.textContent).toContain('2/5');
  });

  it('shows empty state with link to friends tab when no top friends exist', async () => {
    await renderPage();

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Top 5'))?.click();
    });

    expect(container.textContent).toContain('No top friends yet');
    expect(container.textContent).toContain('0/5');
  });

  it('adds a friend to top 5 via the star button in friends tab', async () => {
    friendsAPI.getFriends.mockResolvedValueOnce({
      data: {
        friends: [
          { _id: 'u-1', username: 'carol', realName: 'Carol C', friendshipId: 'fs-1', category: 'social' }
        ]
      }
    });
    friendsAPI.updateTopFriends.mockResolvedValue({ data: { success: true } });
    friendsAPI.getTopFriends
      .mockResolvedValueOnce({ data: { topFriends: [] } })
      .mockResolvedValueOnce({
        data: { topFriends: [{ _id: 'u-1', username: 'carol', realName: 'Carol C' }] }
      });

    await renderPage();

    const starBtn = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '⭐ Top');
    expect(starBtn).toBeTruthy();

    await act(async () => {
      starBtn.click();
    });

    expect(friendsAPI.updateTopFriends).toHaveBeenCalledWith(['u-1']);
  });

  it('removes a friend from top 5 via the remove button', async () => {
    friendsAPI.getTopFriends.mockResolvedValueOnce({
      data: {
        topFriends: [
          { _id: 'tf-1', username: 'alice', realName: 'Alice A', avatarUrl: '' }
        ]
      }
    });
    friendsAPI.updateTopFriends.mockResolvedValue({ data: { success: true } });
    friendsAPI.getTopFriends.mockResolvedValueOnce({ data: { topFriends: [] } });

    await renderPage();

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Top 5'))?.click();
    });

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === '✕')?.click();
    });

    expect(friendsAPI.updateTopFriends).toHaveBeenCalledWith([]);
  });
});
