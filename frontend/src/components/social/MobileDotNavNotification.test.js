import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MobileDotNavNotification from './MobileDotNavNotification';

// Mock the notification API
jest.mock('../../utils/api', () => ({
  notificationAPI: {
    getNotifications: jest.fn(),
    acknowledgeNotification: jest.fn(),
    dismissNotification: jest.fn(),
  },
}));

const { notificationAPI } = require('../../utils/api');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MobileDotNavNotification', () => {
  let container;
  let root;

  const renderPanel = async (props = {}) => {
    await act(async () => {
      root.render(<MobileDotNavNotification {...props} />);
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    notificationAPI.getNotifications.mockResolvedValue({ data: { notifications: [] } });
    notificationAPI.acknowledgeNotification.mockResolvedValue({ data: { success: true } });
    notificationAPI.dismissNotification.mockResolvedValue({ data: { success: true } });
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    container = null;
    root = null;
    jest.useRealTimers();
  });

  it('does not render when isOpen is false', async () => {
    await renderPanel({ isOpen: false });
    const el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el).toBeNull();
  });

  it('renders panel with header when isOpen is true', async () => {
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    const el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el).not.toBeNull();
    const header = document.querySelector('[data-testid="mobile-dotnav-notification-header"]');
    expect(header).not.toBeNull();
    expect(header.textContent).toContain('Notifications');
  });

  it('renders red Logout button in the header', async () => {
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    const logoutBtn = document.querySelector('[data-testid="mobile-dotnav-notification-logout"]');
    expect(logoutBtn).not.toBeNull();
    expect(logoutBtn.textContent).toBe('Logout');
    expect(logoutBtn.getAttribute('aria-label')).toBe('Logout');
  });

  it('calls onLogout when Logout button is clicked', async () => {
    const onLogout = jest.fn();
    await renderPanel({ isOpen: true, onLogout });
    await act(async () => { jest.advanceTimersByTime(50); });
    const logoutBtn = document.querySelector('[data-testid="mobile-dotnav-notification-logout"]');
    await act(async () => { logoutBtn.click(); });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('shows "No new notifications" when no notifications exist', async () => {
    notificationAPI.getNotifications.mockResolvedValue({ data: { notifications: [] } });
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    // Wait for API promise to resolve
    await act(async () => { await Promise.resolve(); });
    const emptyMsg = document.querySelector('[data-testid="mobile-dotnav-notification-empty"]');
    expect(emptyMsg).not.toBeNull();
    expect(emptyMsg.textContent).toBe('No new notifications');
  });

  it('renders notification pills when notifications exist', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [
          { _id: 'n1', title: 'New follower', body: 'Alice followed you', type: 'follow', createdAt: new Date().toISOString() },
          { _id: 'n2', title: 'New like', body: 'Bob liked your post', type: 'like', createdAt: new Date().toISOString() },
        ],
      },
    });
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    await act(async () => { await Promise.resolve(); });
    const pills = document.querySelectorAll('[data-testid="mobile-dotnav-notification-pill"]');
    expect(pills.length).toBe(2);
  });

  it('groups matching notifications with badge count', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [
          { _id: 'n1', title: 'New like', body: 'Alice liked', type: 'like', createdAt: new Date().toISOString() },
          { _id: 'n2', title: 'New like', body: 'Bob liked', type: 'like', createdAt: new Date().toISOString() },
          { _id: 'n3', title: 'New like', body: 'Charlie liked', type: 'like', createdAt: new Date().toISOString() },
        ],
      },
    });
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    await act(async () => { await Promise.resolve(); });
    const pills = document.querySelectorAll('[data-testid="mobile-dotnav-notification-pill"]');
    expect(pills.length).toBe(1); // All three grouped into one
    const badge = pills[0].querySelector('.dotnav-mobile-notif-pill-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('3');
  });

  it('renders quick action buttons on each pill', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [
          { _id: 'n1', title: 'Test', body: 'Body', type: 'system', createdAt: new Date().toISOString() },
        ],
      },
    });
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    await act(async () => { await Promise.resolve(); });
    const markRead = document.querySelector('[data-testid="mobile-dotnav-notification-markread"]');
    const dismiss = document.querySelector('[data-testid="mobile-dotnav-notification-dismiss"]');
    const view = document.querySelector('[data-testid="mobile-dotnav-notification-view"]');
    expect(markRead).not.toBeNull();
    expect(markRead.textContent).toBe('Mark Read');
    expect(dismiss).not.toBeNull();
    expect(dismiss.textContent).toBe('Dismiss');
    expect(view).not.toBeNull();
    expect(view.textContent).toBe('View');
  });

  it('calls onAcknowledge when Mark Read action is clicked', async () => {
    const onAck = jest.fn();
    const notif = { _id: 'n1', title: 'Test', body: 'B', type: 'system', createdAt: new Date().toISOString() };
    notificationAPI.getNotifications.mockResolvedValue({ data: { notifications: [notif] } });
    await renderPanel({ isOpen: true, onAcknowledge: onAck });
    await act(async () => { jest.advanceTimersByTime(50); });
    await act(async () => { await Promise.resolve(); });
    const markReadBtn = document.querySelector('[data-testid="mobile-dotnav-notification-markread"]');
    await act(async () => { markReadBtn.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(notificationAPI.acknowledgeNotification).toHaveBeenCalledWith('n1');
    expect(onAck).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when Dismiss action is clicked', async () => {
    const onDismiss = jest.fn();
    const notif = { _id: 'n1', title: 'Test', body: 'B', type: 'system', createdAt: new Date().toISOString() };
    notificationAPI.getNotifications.mockResolvedValue({ data: { notifications: [notif] } });
    await renderPanel({ isOpen: true, onDismiss });
    await act(async () => { jest.advanceTimersByTime(50); });
    await act(async () => { await Promise.resolve(); });
    const dismissBtn = document.querySelector('[data-testid="mobile-dotnav-notification-dismiss"]');
    await act(async () => { dismissBtn.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(notificationAPI.dismissNotification).toHaveBeenCalledWith('n1');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('acknowledges all IDs in a grouped notification on Mark Read', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [
          { _id: 'n1', title: 'New like', body: 'A', type: 'like', createdAt: new Date().toISOString() },
          { _id: 'n2', title: 'New like', body: 'B', type: 'like', createdAt: new Date().toISOString() },
        ],
      },
    });
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    await act(async () => { await Promise.resolve(); });
    const markReadBtn = document.querySelector('[data-testid="mobile-dotnav-notification-markread"]');
    await act(async () => { markReadBtn.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(notificationAPI.acknowledgeNotification).toHaveBeenCalledWith('n1');
    expect(notificationAPI.acknowledgeNotification).toHaveBeenCalledWith('n2');
  });

  it('dismisses all IDs in a grouped notification on Dismiss', async () => {
    notificationAPI.getNotifications.mockResolvedValue({
      data: {
        notifications: [
          { _id: 'n1', title: 'New like', body: 'A', type: 'like', createdAt: new Date().toISOString() },
          { _id: 'n2', title: 'New like', body: 'B', type: 'like', createdAt: new Date().toISOString() },
        ],
      },
    });
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    await act(async () => { await Promise.resolve(); });
    const dismissBtn = document.querySelector('[data-testid="mobile-dotnav-notification-dismiss"]');
    await act(async () => { dismissBtn.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(notificationAPI.dismissNotification).toHaveBeenCalledWith('n1');
    expect(notificationAPI.dismissNotification).toHaveBeenCalledWith('n2');
  });

  it('keeps notification visible when API call fails on Mark Read', async () => {
    notificationAPI.acknowledgeNotification.mockRejectedValue(new Error('Network error'));
    const notif = { _id: 'n1', title: 'Test', body: 'B', type: 'system', createdAt: new Date().toISOString() };
    notificationAPI.getNotifications.mockResolvedValue({ data: { notifications: [notif] } });
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    await act(async () => { await Promise.resolve(); });
    const markReadBtn = document.querySelector('[data-testid="mobile-dotnav-notification-markread"]');
    await act(async () => { markReadBtn.click(); });
    await act(async () => { await Promise.resolve(); });
    const pills = document.querySelectorAll('[data-testid="mobile-dotnav-notification-pill"]');
    expect(pills.length).toBe(1);
  });

  it('keeps notification visible when API call fails on Dismiss', async () => {
    notificationAPI.dismissNotification.mockRejectedValue(new Error('Network error'));
    const notif = { _id: 'n1', title: 'Test', body: 'B', type: 'system', createdAt: new Date().toISOString() };
    notificationAPI.getNotifications.mockResolvedValue({ data: { notifications: [notif] } });
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    await act(async () => { await Promise.resolve(); });
    const dismissBtn = document.querySelector('[data-testid="mobile-dotnav-notification-dismiss"]');
    await act(async () => { dismissBtn.click(); });
    await act(async () => { await Promise.resolve(); });
    const pills = document.querySelectorAll('[data-testid="mobile-dotnav-notification-pill"]');
    expect(pills.length).toBe(1);
  });

  it('applies visible class when open', async () => {
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    const el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el.classList.contains('dotnav-mobile-notif-panel-visible')).toBe(true);
  });

  it('navigates to /notifications when View action is clicked', async () => {
    const onNavigate = jest.fn();
    const notif = { _id: 'n1', title: 'Test', body: 'B', type: 'system', createdAt: new Date().toISOString() };
    notificationAPI.getNotifications.mockResolvedValue({ data: { notifications: [notif] } });
    await renderPanel({ isOpen: true, onNavigate });
    await act(async () => { jest.advanceTimersByTime(50); });
    await act(async () => { await Promise.resolve(); });
    const viewBtn = document.querySelector('[data-testid="mobile-dotnav-notification-view"]');
    await act(async () => { viewBtn.click(); });
    expect(onNavigate).toHaveBeenCalledWith('/notifications');
  });

  it('navigates to /chat?tab=dm when View is clicked on a message notification', async () => {
    const onNavigate = jest.fn();
    const notif = { _id: 'n1', title: 'New message', body: 'B', type: 'message', createdAt: new Date().toISOString() };
    notificationAPI.getNotifications.mockResolvedValue({ data: { notifications: [notif] } });
    await renderPanel({ isOpen: true, onNavigate });
    await act(async () => { jest.advanceTimersByTime(50); });
    await act(async () => { await Promise.resolve(); });
    const viewBtn = document.querySelector('[data-testid="mobile-dotnav-notification-view"]');
    await act(async () => { viewBtn.click(); });
    expect(onNavigate).toHaveBeenCalledWith('/chat?tab=dm');
  });

  it('hides panel when isOpen changes to false', async () => {
    await renderPanel({ isOpen: true });
    await act(async () => { jest.advanceTimersByTime(50); });
    let el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el).not.toBeNull();

    await renderPanel({ isOpen: false });
    el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    // Still in DOM but animating out
    expect(el.classList.contains('dotnav-mobile-notif-panel-visible')).toBe(false);

    // After animation completes
    await act(async () => { jest.advanceTimersByTime(350); });
    el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el).toBeNull();
  });
});
