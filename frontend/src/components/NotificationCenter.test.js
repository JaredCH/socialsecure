import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import NotificationCenter from './NotificationCenter';
import { friendsAPI, notificationAPI } from '../utils/api';

const HOVER_CLOSE_DELAY_MS = 150;
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => mockNavigate
}));

jest.mock('../utils/api', () => ({
  notificationAPI: {
    getNotifications: jest.fn(),
    markAsRead: jest.fn(),
    deleteNotification: jest.fn(),
    markAllAsRead: jest.fn(),
    acknowledgeNotification: jest.fn(),
    dismissNotification: jest.fn()
  },
  friendsAPI: {
    getRelationship: jest.fn(),
    acceptRequest: jest.fn(),
    declineRequest: jest.fn(),
    updateFriendCategory: jest.fn()
  }
}));

describe('NotificationCenter corner behavior', () => {
  let container;
  let root;

  const renderCenter = async (props = {}) => {
    await act(async () => {
      root.render(
        <NotificationCenter
          unreadCount={2}
          onUnreadCountChange={jest.fn()}
          userDisplayName="user1"
          {...props}
        />
      );
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    notificationAPI.getNotifications.mockResolvedValue({
      data: { notifications: [], pagination: { hasMore: false } }
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  it('shows the user corner and opens notifications on hover', async () => {
    await renderCenter();

    expect(container.textContent).toContain('user1');

    const rootPanel = container.querySelector('.relative');
    expect(rootPanel).not.toBeNull();

    await act(async () => {
      rootPanel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(notificationAPI.getNotifications).toHaveBeenCalledWith(1, 20);
    expect(container.textContent).toContain('Notifications');
  });

  it('keeps the dropdown open while moving pointer from pill to menu', async () => {
    jest.useFakeTimers();
    await renderCenter();

    const rootPanel = container.querySelector('.relative');
    expect(rootPanel).not.toBeNull();

    await act(async () => {
      rootPanel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Notifications');

    await act(async () => {
      rootPanel.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Notifications');

    await act(async () => {
      jest.advanceTimersByTime(HOVER_CLOSE_DELAY_MS - 1);
      rootPanel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      jest.advanceTimersByTime(10);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Notifications');

    await act(async () => {
      rootPanel.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      jest.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Notifications');
    jest.useRealTimers();
  });

  it('accepts friend request notifications with selected circle', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const onUnreadCountChange = jest.fn();

    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [{
          _id: 'notif-1',
          senderId: 'sender-1',
          type: 'follow',
          title: 'New follow request',
          body: 'Please accept',
          isRead: false,
          createdAt: '2026-01-01T00:00:00.000Z'
        }],
        pagination: { hasMore: false }
      }
    });
    friendsAPI.getRelationship.mockResolvedValue({
      data: { friendshipId: 'friendship-1', relationship: 'pending' }
    });
    friendsAPI.acceptRequest.mockResolvedValue({ data: { success: true } });
    friendsAPI.updateFriendCategory.mockResolvedValue({ data: { success: true } });
    notificationAPI.acknowledgeNotification.mockResolvedValue({ data: { success: true } });

    await renderCenter({ onUnreadCountChange });

    const toggleButton = container.querySelector('button[aria-label="Notifications"]');
    await act(async () => {
      toggleButton.click();
    });

    const circleSelect = container.querySelector('#friend-circle-notif-1');
    expect(circleSelect).not.toBeNull();

    await act(async () => {
      circleSelect.value = 'secure';
      circleSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const acceptButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent.includes('Accept'));
    expect(acceptButton).not.toBeNull();
    await act(async () => {
      acceptButton.click();
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(friendsAPI.getRelationship).toHaveBeenCalledWith('sender-1');
    expect(friendsAPI.acceptRequest).toHaveBeenCalledWith('friendship-1');
    expect(friendsAPI.updateFriendCategory).toHaveBeenCalledWith('friendship-1', 'secure');
    expect(notificationAPI.acknowledgeNotification).toHaveBeenCalledWith('notif-1');
    expect(onUnreadCountChange).toHaveBeenCalled();
    expect(container.textContent).not.toContain('New follow request');
    expect(container.textContent).not.toContain('Acknowledge');
    expect(container.textContent).not.toContain('Dismiss');

    confirmSpy.mockRestore();
  });

  it('hides previously handled follow notifications from the dropdown list', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [{
          _id: 'notif-read-follow',
          senderId: 'sender-2',
          type: 'follow',
          title: 'Old follow request',
          body: 'Already handled',
          isRead: true,
          createdAt: '2026-01-01T00:00:00.000Z'
        }],
        pagination: { hasMore: false }
      }
    });

    await renderCenter();

    const toggleButton = container.querySelector('button[aria-label="Notifications"]');
    await act(async () => {
      toggleButton.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('No notifications yet.');
    expect(container.textContent).not.toContain('Old follow request');
  });

  it('renders a logout action at the bottom of the dropdown when provided', async () => {
    const onLogout = jest.fn();
    await renderCenter({ onLogout });

    const toggleButton = container.querySelector('button[aria-label="Notifications"]');
    await act(async () => {
      toggleButton.click();
      await Promise.resolve();
    });

    const logoutButton = container.querySelector('[data-testid="notification-dropdown-logout"]');
    expect(logoutButton).not.toBeNull();
    expect(logoutButton.className).toContain('bg-red-600');

    await act(async () => {
      logoutButton.click();
      await Promise.resolve();
    });

    expect(onLogout).toHaveBeenCalled();
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows Mark Read, Dismiss, and View for direct message notifications', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [{
          _id: 'dm-notif-1',
          senderId: 'sender-dm',
          type: 'message',
          title: 'New message',
          body: 'alice sent you a message',
          isRead: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          data: { roomId: 'room-1' }
        }],
        pagination: { hasMore: false }
      }
    });
    notificationAPI.acknowledgeNotification.mockResolvedValue({ data: { success: true } });

    const onUnreadCountChange = jest.fn();
    await renderCenter({ onUnreadCountChange });

    const toggleButton = container.querySelector('button[aria-label="Notifications"]');
    await act(async () => {
      toggleButton.click();
      await Promise.resolve();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const labels = buttons.map((b) => b.textContent.trim());

    expect(labels).toContain('Mark Read');
    expect(labels).toContain('Dismiss');
    expect(labels).toContain('View');
    expect(labels).not.toContain('Acknowledge');
    expect(labels).not.toContain('Delete');
  });

  it('navigates to /chat?tab=dm when View is clicked on a DM notification', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [{
          _id: 'dm-notif-2',
          senderId: 'sender-dm',
          type: 'message',
          title: 'New message',
          body: 'bob sent you a message',
          isRead: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          data: { roomId: 'room-2' }
        }],
        pagination: { hasMore: false }
      }
    });

    await renderCenter();

    const toggleButton = container.querySelector('button[aria-label="Notifications"]');
    await act(async () => {
      toggleButton.click();
      await Promise.resolve();
    });

    const viewButton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent.trim() === 'View');
    expect(viewButton).not.toBeNull();

    await act(async () => {
      viewButton.click();
      await Promise.resolve();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/chat?tab=dm');
  });
});
