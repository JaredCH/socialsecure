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
    getNotifications: jest.fn()
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
});