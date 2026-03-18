import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import GlobalSocialLauncher from './GlobalSocialLauncher';
import { chatAPI, notificationAPI } from '../../utils/api';

jest.mock('../../utils/api', () => ({
  chatAPI: {
    getConversations: jest.fn()
  },
  notificationAPI: {
    getNotifications: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn()
  }
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location-display">{`${location.pathname}${location.search}`}</div>;
};

describe('GlobalSocialLauncher', () => {
  let container;
  let root;

  const renderLauncher = async ({ initialEntries = ['/'], props = {} } = {}) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={initialEntries}>
          <LocationProbe />
          <GlobalSocialLauncher
            currentUsername="owner"
            unreadNotificationCount={0}
            enabled
            {...props}
          />
        </MemoryRouter>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    chatAPI.getConversations.mockResolvedValue({
      data: { conversations: { zip: { current: null, nearby: [] }, dm: [], profile: [] } }
    });
    notificationAPI.getNotifications.mockResolvedValue({
      data: { notifications: [] }
    });
    notificationAPI.markAsRead.mockResolvedValue({ data: { success: true } });
    notificationAPI.markAllAsRead.mockResolvedValue({ data: { success: true } });

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

  it('does not render when disabled', async () => {
    await renderLauncher({ props: { enabled: false } });

    expect(container.querySelector('[data-testid="global-social-launcher"]')).toBeNull();
  });

  it('preserves the viewed user when opening social sections from another profile context', async () => {
    await renderLauncher({ initialEntries: ['/social?user=friend'] });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');
    expect(launcher).not.toBeNull();

    await act(async () => {
      launcher.click();
    });

    const chatButton = container.querySelector('button[aria-label="Open Chat section"]');
    expect(chatButton).not.toBeNull();

    await act(async () => {
      chatButton.click();
    });

    expect(container.querySelector('[data-testid="location-display"]').textContent).toBe('/social?user=friend&tab=chat');
  });

  it('falls back to the signed-in user outside another profile context', async () => {
    await renderLauncher({ initialEntries: ['/chat'] });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
    });

    const calendarButton = container.querySelector('button[aria-label="Open Calendar section"]');
    expect(calendarButton).not.toBeNull();

    await act(async () => {
      calendarButton.click();
    });

    expect(container.querySelector('[data-testid="location-display"]').textContent).toBe('/social?user=owner&tab=calendar');
  });

  it('uses alternate social chit color styling when viewing another user context', async () => {
    await renderLauncher({ initialEntries: ['/social?user=friend'] });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
    });

    const friendsButton = container.querySelector('button[aria-label="Open Friends section"]');
    expect(friendsButton).not.toBeNull();
    expect(friendsButton.className).toContain('bg-violet-500/18');
  });

  it('navigates to direct messages from the activity quick action', async () => {
    chatAPI.getConversations.mockResolvedValue({
      data: {
        conversations: {
          zip: { current: null, nearby: [] },
          dm: [{ _id: 'dm-1', type: 'dm', unreadCount: 4, lastMessageAt: new Date().toISOString(), peer: { username: 'nora' } }],
          profile: []
        }
      }
    });

    await renderLauncher({ initialEntries: ['/news'] });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
      await Promise.resolve();
    });

    const dmShortcut = container.querySelector('button[aria-label="Open direct messages"]');
    expect(dmShortcut).not.toBeNull();

    await act(async () => {
      dmShortcut.click();
    });

    expect(container.querySelector('[data-testid="location-display"]').textContent).toBe('/chat?tab=dm');
  });

  it('fades acknowledged notifications in recent activity', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [
          { _id: 'n-older', title: 'Older acknowledged alert', isRead: true, createdAt: new Date(Date.now() - 172800000).toISOString() },
          { _id: 'n-new', title: 'Fresh alert', isRead: false, createdAt: new Date().toISOString() }
        ]
      }
    });

    await renderLauncher({ initialEntries: ['/find-friends'] });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
      await Promise.resolve();
    });

    const olderAlertCard = Array.from(container.querySelectorAll('div')).find(
      (node) => typeof node.className === 'string'
        && node.className.includes('rounded-2xl')
        && node.textContent.includes('Older acknowledged alert')
    );
    expect(olderAlertCard).toBeDefined();
    expect(olderAlertCard.className).toContain('opacity-55');
  });

  it('keeps latest updates collapsed by default when notifications are already acknowledged', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [
          { _id: 'n-read', title: 'Seen follow request', isRead: true, createdAt: new Date(Date.now() - 3600000).toISOString() }
        ]
      }
    });

    await renderLauncher({ initialEntries: ['/find-friends'] });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Seen follow request');

    const toggle = container.querySelector('button[aria-label="Expand latest updates"]');
    expect(toggle).not.toBeNull();

    await act(async () => {
      toggle.click();
    });

    expect(container.textContent).toContain('Seen follow request');
  });

  it('shows requester name text and supports acknowledging notifications', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [
          {
            _id: 'n-follow',
            title: 'New follow request',
            body: 'Taylor sent you a follow request',
            isRead: false,
            createdAt: new Date().toISOString()
          },
          {
            _id: 'n-market',
            title: 'Market update',
            isRead: false,
            createdAt: new Date().toISOString()
          }
        ]
      }
    });

    await renderLauncher({ initialEntries: ['/news'], props: { unreadNotificationCount: 2 } });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Taylor sent you a follow request');

    const acknowledgeButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === 'Acknowledge');
    expect(acknowledgeButtons.length).toBeGreaterThan(0);

    await act(async () => {
      acknowledgeButtons[0].click();
    });

    expect(notificationAPI.markAsRead).toHaveBeenCalledWith('n-follow');

    const markAll = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Mark all as read');
    expect(markAll).not.toBeUndefined();

    await act(async () => {
      markAll.click();
    });

    expect(notificationAPI.markAllAsRead).toHaveBeenCalled();
  });
});
