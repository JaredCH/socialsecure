import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MobileDotNavNotification from './MobileDotNavNotification';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MobileDotNavNotification', () => {
  let container;
  let root;

  const renderNotification = async (props = {}) => {
    await act(async () => {
      root.render(<MobileDotNavNotification {...props} />);
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    container = null;
    root = null;
    jest.useRealTimers();
  });

  it('does not render when notification is null', async () => {
    await renderNotification({ notification: null });
    const el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el).toBeNull();
  });

  it('does not render when notification has no _id', async () => {
    await renderNotification({ notification: { title: 'Hello' } });
    const el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el).toBeNull();
  });

  it('renders notification with title and body', async () => {
    await renderNotification({
      notification: { _id: 'n1', title: 'New follower', body: 'Alice followed you' },
    });
    // Advance one animation frame so visible class is applied
    await act(async () => { jest.advanceTimersByTime(50); });
    const el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el).not.toBeNull();
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.querySelector('[data-testid="mobile-dotnav-notification-title"]').textContent).toBe('New follower');
    expect(el.querySelector('[data-testid="mobile-dotnav-notification-body"]').textContent).toBe('Alice followed you');
  });

  it('applies visible class after render', async () => {
    await renderNotification({
      notification: { _id: 'n2', title: 'Test', body: 'Body' },
    });
    await act(async () => { jest.advanceTimersByTime(50); });
    const el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el.classList.contains('dotnav-mobile-notification-visible')).toBe(true);
  });

  it('sets bottom offset from dotnavHeight prop', async () => {
    await renderNotification({
      notification: { _id: 'n3', title: 'T', body: 'B' },
      dotnavHeight: 80,
    });
    await act(async () => { jest.advanceTimersByTime(50); });
    const el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el.style.bottom).toBe('96px'); // 80 + 16
  });

  it('auto-dismisses after timeout', async () => {
    await renderNotification({
      notification: { _id: 'n4', title: 'Timed', body: 'Auto' },
    });
    await act(async () => { jest.advanceTimersByTime(50); });
    let el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el).not.toBeNull();

    // Advance past auto-dismiss (6000ms) + animation (350ms)
    await act(async () => { jest.advanceTimersByTime(6000); });
    el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el.classList.contains('dotnav-mobile-notification-visible')).toBe(false);

    await act(async () => { jest.advanceTimersByTime(350); });
    el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el).toBeNull();
  });

  it('calls onAcknowledge when ack button is clicked', async () => {
    const onAck = jest.fn();
    const notif = { _id: 'n5', title: 'Ack', body: 'me' };
    await renderNotification({ notification: notif, onAcknowledge: onAck });
    await act(async () => { jest.advanceTimersByTime(50); });

    const ackBtn = document.querySelector('[data-testid="mobile-dotnav-notification-ack"]');
    expect(ackBtn).not.toBeNull();
    await act(async () => { ackBtn.click(); });

    expect(onAck).toHaveBeenCalledTimes(1);
    expect(onAck).toHaveBeenCalledWith(notif);
  });

  it('calls onDismiss when dismiss button is clicked', async () => {
    const onDismiss = jest.fn();
    const notif = { _id: 'n6', title: 'Dismiss', body: 'me' };
    await renderNotification({ notification: notif, onDismiss });
    await act(async () => { jest.advanceTimersByTime(50); });

    const dismissBtn = document.querySelector('[data-testid="mobile-dotnav-notification-dismiss"]');
    expect(dismissBtn).not.toBeNull();
    await act(async () => { dismissBtn.click(); });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(notif);
  });

  it('removes notification from DOM after dismiss animation', async () => {
    const notif = { _id: 'n7', title: 'Go away', body: '...' };
    await renderNotification({ notification: notif });
    await act(async () => { jest.advanceTimersByTime(50); });

    const dismissBtn = document.querySelector('[data-testid="mobile-dotnav-notification-dismiss"]');
    await act(async () => { dismissBtn.click(); });

    // Still in DOM but animating out
    let el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el).not.toBeNull();
    expect(el.classList.contains('dotnav-mobile-notification-visible')).toBe(false);

    // After animation completes
    await act(async () => { jest.advanceTimersByTime(350); });
    el = document.querySelector('[data-testid="mobile-dotnav-notification"]');
    expect(el).toBeNull();
  });

  it('renders ack and dismiss buttons with proper aria labels', async () => {
    await renderNotification({
      notification: { _id: 'n8', title: 'T', body: 'B' },
    });
    await act(async () => { jest.advanceTimersByTime(50); });

    const ackBtn = document.querySelector('[data-testid="mobile-dotnav-notification-ack"]');
    const dismissBtn = document.querySelector('[data-testid="mobile-dotnav-notification-dismiss"]');
    expect(ackBtn.getAttribute('aria-label')).toBe('Acknowledge notification');
    expect(dismissBtn.getAttribute('aria-label')).toBe('Dismiss notification');
  });

  it('replaces current notification when a new one arrives', async () => {
    const notif1 = { _id: 'n9', title: 'First', body: 'one' };
    const notif2 = { _id: 'n10', title: 'Second', body: 'two' };

    await renderNotification({ notification: notif1 });
    await act(async () => { jest.advanceTimersByTime(50); });
    let el = document.querySelector('[data-testid="mobile-dotnav-notification-title"]');
    expect(el.textContent).toBe('First');

    await renderNotification({ notification: notif2 });
    await act(async () => { jest.advanceTimersByTime(50); });
    el = document.querySelector('[data-testid="mobile-dotnav-notification-title"]');
    expect(el.textContent).toBe('Second');
  });
});
