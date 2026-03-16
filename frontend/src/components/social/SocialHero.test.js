import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SocialHero from './SocialHero';
import { notificationAPI } from '../../utils/api';

jest.mock('../../utils/api', () => ({
  notificationAPI: {
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn()
  }
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SocialHero mobile navigation', () => {
  let container;
  let root;

  const renderHero = async (props = {}) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SocialHero
            isMobile
            activeTab="main"
            onTabChange={jest.fn()}
            profile={{ name: 'Avery Stone', location: 'Portland, OR' }}
            heroConfig={{ showNavigation: true }}
            {...props}
          />
        </MemoryRouter>
      );
    });
  };

  beforeEach(() => {
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

  it('opens and closes the circular mobile section launcher', async () => {
    await renderHero();

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');
    expect(launcher).not.toBeNull();
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('button[aria-label="Close social section menu"]')).toBeNull();

    await act(async () => {
      launcher.click();
    });

    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('button[aria-label="Close social section menu"]')).not.toBeNull();

    await act(async () => {
      launcher.click();
    });

    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('button[aria-label="Close social section menu"]')).toBeNull();
  });

  it('selects a section from the radial menu and collapses afterward', async () => {
    const onTabChange = jest.fn();
    await renderHero({ onTabChange });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
    });

    const newsButton = container.querySelector('button[aria-label="Open Chat section"]');
    expect(newsButton).not.toBeNull();

    await act(async () => {
      newsButton.click();
    });

    expect(onTabChange).toHaveBeenCalledWith('chat');
    expect(container.querySelector('button[aria-label="Close social section menu"]')).toBeNull();
  });

  it('closes the radial menu when escape is pressed', async () => {
    await renderHero();

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
    });

    expect(container.querySelector('button[aria-label="Close social section menu"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(container.querySelector('button[aria-label="Close social section menu"]')).toBeNull();
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the restored site links from the right-side launcher', async () => {
    await renderHero();

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');
    expect(launcher).not.toBeNull();

    await act(async () => {
      launcher.click();
    });

    expect(container.textContent).toContain('Chat');
    expect(container.textContent).toContain('News');
    expect(container.textContent).toContain('Market');
    expect(container.textContent).toContain('Discover');
  });

  it('shows activity cards when the social launcher is open', async () => {
    await renderHero({
      activitySummary: {
        unreadNotificationCount: 2,
        unreadMessageCount: 1,
        notifications: [
          { _id: 'n1', title: 'Friend request accepted', createdAt: new Date().toISOString() }
        ],
        messages: [
          { id: 'm1', title: 'Nora', summary: '1 unread messages', timestamp: new Date().toISOString() }
        ]
      }
    });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
    });

    expect(container.textContent).toContain('Notifications');
    expect(container.textContent).toContain('Friend request accepted');
    expect(container.textContent).toContain('Messages');
    expect(container.textContent).toContain('Nora');
  });

  it('shows direct messages quick action in activity rail', async () => {
    await renderHero({
      activitySummary: {
        unreadNotificationCount: 0,
        unreadMessageCount: 3,
        notifications: [],
        messages: [
          { id: 'm1', title: 'Nora', summary: '3 unread messages', timestamp: new Date().toISOString() }
        ]
      }
    });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
    });

    expect(container.querySelector('button[aria-label="Open direct messages"]')).not.toBeNull();
    expect(container.textContent).toContain('Direct Messages');
  });

  it('fades acknowledged alerts in recent activity', async () => {
    await renderHero({
      activitySummary: {
        unreadNotificationCount: 0,
        unreadMessageCount: 0,
        notifications: [
          { _id: 'n1', title: 'Seen alert', isRead: true, createdAt: new Date(Date.now() - 172800000).toISOString() }
        ],
        messages: []
      }
    });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
    });

    const expandLatestUpdates = container.querySelector('button[aria-label="Expand latest updates"]');
    expect(expandLatestUpdates).not.toBeNull();

    await act(async () => {
      expandLatestUpdates.click();
    });

    const seenAlertCard = Array.from(container.querySelectorAll('div')).find(
      (node) => typeof node.className === 'string'
        && node.className.includes('rounded-2xl')
        && node.textContent.includes('Seen alert')
    );
    expect(seenAlertCard).toBeDefined();
    expect(seenAlertCard.className).toContain('opacity-55');
  });

  it('renders follow requester details and acknowledge actions in latest updates', async () => {
    await renderHero({
      activitySummary: {
        unreadNotificationCount: 2,
        unreadMessageCount: 0,
        notifications: [
          {
            _id: 'n1',
            title: 'New follow request',
            body: 'Casey sent you a follow request',
            createdAt: new Date().toISOString()
          },
          {
            _id: 'n2',
            title: 'Another alert',
            createdAt: new Date().toISOString()
          }
        ],
        messages: []
      }
    });

    const launcher = container.querySelector('button[aria-label="Expand social section menu"]');

    await act(async () => {
      launcher.click();
    });

    expect(container.textContent).toContain('Casey sent you a follow request');

    const acknowledgeButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === 'Acknowledge');
    expect(acknowledgeButtons.length).toBeGreaterThan(0);

    await act(async () => {
      acknowledgeButtons[0].click();
    });

    expect(notificationAPI.markAsRead).toHaveBeenCalledWith('n1');

    const markAll = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Mark all as read');
    expect(markAll).toBeTruthy();

    await act(async () => {
      markAll.click();
    });

    expect(notificationAPI.markAllAsRead).toHaveBeenCalled();
  });
});
