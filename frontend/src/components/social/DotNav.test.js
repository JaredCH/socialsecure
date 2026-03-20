import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// Mock the notification API used by MobileDotNavNotification
jest.mock('../../utils/api', () => ({
  notificationAPI: {
    getNotifications: jest.fn(),
  },
}));

const { notificationAPI } = require('../../utils/api');

import DotNav, { CATALOG, resolveRoute, DEFAULT_ASSIGNED } from './DotNav';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DotNav navigation system', () => {
  let container;
  let root;
  let originalWidth;
  let originalHeight;
  let originalUserAgent;
  let originalMaxTouchPoints;

  const setViewport = (width, height = 844) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
    window.dispatchEvent(new Event('resize'));
  };

  const renderNav = async (props = {}, initialPath = '/') => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <DotNav
            loggedInUser="testuser"
            enabled
            {...props}
          />
        </MemoryRouter>
      );
    });
  };

  beforeEach(() => {
    localStorage.clear();
    notificationAPI.getNotifications.mockResolvedValue({ data: { notifications: [] } });
    originalWidth = window.innerWidth;
    originalHeight = window.innerHeight;
    originalUserAgent = navigator.userAgent;
    originalMaxTouchPoints = navigator.maxTouchPoints;
    setViewport(390, 844);
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
    setViewport(originalWidth, originalHeight);
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent
    });
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: originalMaxTouchPoints
    });
  });

  it('renders the main dot button', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    expect(dot).not.toBeNull();
    expect(dot.getAttribute('aria-expanded')).toBe('false');
    expect(dot.getAttribute('aria-label')).toBe('Open navigation menu');
  });

  it('does not render when disabled', async () => {
    await renderNav({ enabled: false });

    const dot = document.getElementById('dotnav-dot');
    expect(dot).toBeNull();
  });

  it('does not render on desktop viewport', async () => {
    setViewport(1200, 900);
    await renderNav();
    const dot = document.getElementById('dotnav-dot');
    expect(dot).toBeNull();
  });

  it('renders for touch mobile user agents on tablet-sized widths', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    });
    setViewport(820, 900);
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    expect(dot).not.toBeNull();
  });

  it('renders for iPad desktop user agent with touch points on tablet-sized widths', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
    });
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5
    });
    setViewport(900, 1200);
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    expect(dot).not.toBeNull();
  });

  it('does not render for touch-enabled desktop user agents on tablet-sized widths', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36'
    });
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: 10
    });
    setViewport(900, 1200);
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    expect(dot).toBeNull();
  });

  it('opens and closes the navigation menu', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');

    await act(async () => { dot.click(); });
    expect(dot.getAttribute('aria-expanded')).toBe('true');
    expect(dot.getAttribute('aria-label')).toBe('Close navigation menu');

    await act(async () => { dot.click(); });
    expect(dot.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows navigation slots when open', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    const slots = document.querySelectorAll('.dotnav-slot');
    expect(slots.length).toBe(16);
    // At least some should be visible
    const visibleSlots = document.querySelectorAll('.dotnav-slot.dotnav-visible');
    expect(visibleSlots.length).toBe(16);
  });

  it('shows the settings cog when menu is open', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    const cog = document.getElementById('dotnav-cog');

    expect(cog.classList.contains('dotnav-visible')).toBe(false);

    await act(async () => { dot.click(); });
    expect(cog.classList.contains('dotnav-visible')).toBe(true);
  });

  it('closes on Escape key', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });
    expect(dot.getAttribute('aria-expanded')).toBe('true');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dot.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders Power Button slots with blue styling', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    // Power buttons are in slots 12-15
    const powerBtns = document.querySelectorAll('.dotnav-slot .dotnav-nbtn[style*="background"]');
    const blueButtons = Array.from(powerBtns).filter(btn => btn.style.background === 'rgb(37, 99, 235)');
    expect(blueButtons.length).toBeGreaterThanOrEqual(4);
  });

  it('opens settings panel from cog button', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    const cog = document.getElementById('dotnav-cog');
    await act(async () => { cog.click(); });

    const panel = document.getElementById('dotnav-settings-panel');
    expect(panel.classList.contains('dotnav-visible')).toBe(true);
    expect(panel.textContent).toContain('Dock Position');
  });

  it('renders nav label when open and not editing', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    const label = document.getElementById('dotnav-nav-label');
    expect(label.classList.contains('dotnav-visible')).toBe(true);
    expect(label.textContent).toBe('navigate');
  });

  it('renders all default assigned buttons', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    // Check that buttons have aria-labels from their catalog entries
    const btns = document.querySelectorAll('.dotnav-nbtn');
    const labels = Array.from(btns).map(b => b.getAttribute('aria-label')).filter(Boolean);
    expect(labels.length).toBeGreaterThanOrEqual(DEFAULT_ASSIGNED.length);
  });

  it('renders compact labels below each button', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    const labels = document.querySelectorAll('.dotnav-slot-label');
    // The last radial slot is empty so only 15 labels render
    expect(labels.length).toBe(DEFAULT_ASSIGNED.filter(Boolean).length);
    expect(Array.from(labels).some(l => l.textContent === 'Find')).toBe(true);
  });

  it('rearranges button slots during edit mode drag and drop', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    const cog = document.getElementById('dotnav-cog');
    await act(async () => { cog.click(); });

    const editBtn = Array.from(document.querySelectorAll('#dotnav-settings-panel button'))
      .find(btn => btn.textContent.includes('Edit Buttons'));
    expect(editBtn).not.toBeUndefined();

    await act(async () => { editBtn.click(); });

    const sourceSlotBtn = document.querySelector('[data-slot-index="0"] .dotnav-nbtn');
    const targetSlot = document.querySelector('[data-slot-index="1"]');
    expect(sourceSlotBtn).not.toBeNull();
    expect(targetSlot).not.toBeNull();
    expect(sourceSlotBtn.getAttribute('aria-label')).toContain('Main');

    await act(async () => {
      sourceSlotBtn.dispatchEvent(new Event('dragstart', { bubbles: true }));
      targetSlot.dispatchEvent(new Event('dragenter', { bubbles: true }));
      targetSlot.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
      targetSlot.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
      sourceSlotBtn.dispatchEvent(new Event('dragend', { bubbles: true }));
    });

    const slot0After = document.querySelector('[data-slot-index="0"] .dotnav-nbtn');
    const slot1After = document.querySelector('[data-slot-index="1"] .dotnav-nbtn');
    expect(slot0After.getAttribute('aria-label')).toContain('Gallery');
    expect(slot1After.getAttribute('aria-label')).toContain('Main');
  });

  it('rearranges button slots during edit mode touch drag', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    const cog = document.getElementById('dotnav-cog');
    await act(async () => { cog.click(); });

    const editBtn = Array.from(document.querySelectorAll('#dotnav-settings-panel button'))
      .find(btn => btn.textContent.includes('Edit Buttons'));
    await act(async () => { editBtn.click(); });

    const sourceSlotBtn = document.querySelector('[data-slot-index="0"] .dotnav-nbtn');
    const targetSlot = document.querySelector('[data-slot-index="1"]');
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = jest.fn(() => targetSlot);

    const touchStartEvent = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(touchStartEvent, 'touches', { value: [{ clientX: 10, clientY: 10 }] });
    const touchMoveEvent = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(touchMoveEvent, 'touches', { value: [{ clientX: 20, clientY: 20 }] });
    const touchEndEvent = new Event('touchend', { bubbles: true, cancelable: true });

    await act(async () => {
      sourceSlotBtn.dispatchEvent(touchStartEvent);
      sourceSlotBtn.dispatchEvent(touchMoveEvent);
      sourceSlotBtn.dispatchEvent(touchEndEvent);
    });

    const slot0After = document.querySelector('[data-slot-index="0"] .dotnav-nbtn');
    const slot1After = document.querySelector('[data-slot-index="1"] .dotnav-nbtn');
    expect(slot0After.getAttribute('aria-label')).toContain('Gallery');
    expect(slot1After.getAttribute('aria-label')).toContain('Main');

    document.elementFromPoint = originalElementFromPoint;
  });

  it('does not cancel touchend on nav buttons when not editing', async () => {
    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    const mainBtn = document.querySelector('.dotnav-nbtn[aria-label="Main"]');
    expect(mainBtn).not.toBeNull();

    const touchEndEvent = new Event('touchend', { bubbles: true, cancelable: true });
    const notCancelled = mainBtn.dispatchEvent(touchEndEvent);
    expect(notCancelled).toBe(true);
    expect(touchEndEvent.defaultPrevented).toBe(false);
  });

  it('dispatches VoidNavTrigger event on nav button click', async () => {
    const events = [];
    const handler = (e) => events.push(e.detail);
    window.addEventListener('VoidNavTrigger', handler);

    await renderNav();

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    // Click the first nav button (Main/Feed)
    const mainBtn = document.querySelector('.dotnav-nbtn[aria-label="Main"]');
    expect(mainBtn).not.toBeNull();
    await act(async () => { mainBtn.click(); });
    expect(events.length).toBe(1);
    expect(events[0].key).toBe('main');
    expect(events[0].route).toBe('/social');

    window.removeEventListener('VoidNavTrigger', handler);
  });

  it('shows notification badge on dot when unread count is provided', async () => {
    await renderNav({ unreadNotificationCount: 5 });

    const badge = document.querySelector('[data-testid="dotnav-dot-badge"]');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('5');
  });

  it('does not show notification badge when unread count is zero', async () => {
    await renderNav({ unreadNotificationCount: 0 });

    const badge = document.querySelector('[data-testid="dotnav-dot-badge"]');
    expect(badge).toBeNull();
  });

  it('caps notification badge at 99+', async () => {
    await renderNav({ unreadNotificationCount: 150 });

    const badge = document.querySelector('[data-testid="dotnav-dot-badge"]');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('99+');
  });

  it('hides notification badge when menu is open', async () => {
    await renderNav({ unreadNotificationCount: 3 });

    // Badge visible when closed
    let badge = document.querySelector('[data-testid="dotnav-dot-badge"]');
    expect(badge).not.toBeNull();

    // Open the menu
    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    // Badge hidden when open (MobileDotNavNotification takes over)
    badge = document.querySelector('[data-testid="dotnav-dot-badge"]');
    expect(badge).toBeNull();
  });

  it('includes unread count in aria-label when notifications exist', async () => {
    await renderNav({ unreadNotificationCount: 7 });

    const dot = document.getElementById('dotnav-dot');
    expect(dot.getAttribute('aria-label')).toBe('Open navigation menu (7 unread notifications)');
  });

  it('does not render the bell button or notification panel', async () => {
    await renderNav({ unreadNotificationCount: 5 });

    expect(document.getElementById('dotnav-bell')).toBeNull();
    expect(document.getElementById('dotnav-notification-panel')).toBeNull();
  });

  it('shows guest CTA when menu is open and user is not logged in', async () => {
    await renderNav({ loggedInUser: '' });

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    const cta = document.querySelector('[data-testid="dotnav-guest-cta"]');
    expect(cta).not.toBeNull();
    expect(cta.textContent).toBe('Register / Login');
  });

  it('does not show guest CTA when user is logged in', async () => {
    await renderNav({ loggedInUser: 'testuser' });

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    const cta = document.querySelector('[data-testid="dotnav-guest-cta"]');
    expect(cta).toBeNull();
  });

  it('does not show guest CTA when menu is closed', async () => {
    await renderNav({ loggedInUser: '' });

    const cta = document.querySelector('[data-testid="dotnav-guest-cta"]');
    expect(cta).toBeNull();
  });

  it('navigates Main to /login for guest not viewing another user', async () => {
    const events = [];
    const handler = (e) => events.push(e.detail);
    window.addEventListener('VoidNavTrigger', handler);

    await renderNav({ loggedInUser: '' });

    const dot = document.getElementById('dotnav-dot');
    await act(async () => { dot.click(); });

    const mainBtn = document.querySelector('.dotnav-nbtn[aria-label="Main"]');
    expect(mainBtn).not.toBeNull();
    await act(async () => { mainBtn.click(); });
    expect(events.length).toBe(1);
    expect(events[0].key).toBe('main');
    expect(events[0].route).toBe('/login');

    window.removeEventListener('VoidNavTrigger', handler);
  });
});

describe('resolveRoute', () => {
  const findCatalogEntry = (key) => CATALOG.find(c => c.key === key);

  it('resolves power button routes to their fixed paths', () => {
    expect(resolveRoute(findCatalogEntry('chat-power'), 'me', 'other')).toBe('/chat');
    expect(resolveRoute(findCatalogEntry('news-power'), 'me', 'other')).toBe('/news');
    expect(resolveRoute(findCatalogEntry('market-power'), 'me', 'other')).toBe('/market');
    expect(resolveRoute(findCatalogEntry('discover-power'), 'me', 'other')).toBe('/discover');
  });

  it('resolves global routes', () => {
    expect(resolveRoute(findCatalogEntry('main'), 'me', '')).toBe('/social');
  });

  it('resolves absolute routes to logged-in user', () => {
    expect(resolveRoute(findCatalogEntry('my-gallery'), 'me', 'other')).toBe('/social?tab=gallery');
    expect(resolveRoute(findCatalogEntry('my-calendar'), 'me', 'other')).toBe('/social?tab=calendar');
  });

  it('resolves contextual routes to the viewed user when different from logged-in user', () => {
    expect(resolveRoute(findCatalogEntry('gallery'), 'me', 'other')).toBe('/social?user=other&tab=gallery');
    expect(resolveRoute(findCatalogEntry('calendar'), 'me', 'other')).toBe('/social?user=other&tab=calendar');
    expect(resolveRoute(findCatalogEntry('chat'), 'me', 'other')).toBe('/social?user=other&tab=chat');
    expect(resolveRoute(findCatalogEntry('friends'), 'me', 'other')).toBe('/social?user=other&tab=friends');
  });

  it('resolves contextual routes to own profile when viewing self', () => {
    expect(resolveRoute(findCatalogEntry('gallery'), 'me', 'me')).toBe('/social?tab=gallery');
    expect(resolveRoute(findCatalogEntry('calendar'), 'me', 'me')).toBe('/social?tab=calendar');
    expect(resolveRoute(findCatalogEntry('gallery'), 'me', '')).toBe('/social?tab=gallery');
  });

  it('resolves about to aboutme tab', () => {
    expect(resolveRoute(findCatalogEntry('about'), 'me', 'other')).toBe('/social?user=other&tab=aboutme');
    expect(resolveRoute(findCatalogEntry('my-about'), 'me', 'other')).toBe('/social?tab=aboutme');
  });

  it('resolves main to /login for guest not viewing another user', () => {
    expect(resolveRoute(findCatalogEntry('main'), '', '')).toBe('/login');
  });

  it('resolves main to /social for guest viewing another user profile', () => {
    expect(resolveRoute(findCatalogEntry('main'), '', 'someone')).toBe('/social');
  });

  it('returns null for null entry', () => {
    expect(resolveRoute(null, 'me', '')).toBeNull();
  });
});
