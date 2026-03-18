import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DotNav, { CATALOG, resolveRoute, DEFAULT_ASSIGNED } from './DotNav';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DotNav navigation system', () => {
  let container;
  let root;

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
    expect(resolveRoute(findCatalogEntry('my-calendar'), 'me', 'other')).toBe('/calendar');
  });

  it('resolves contextual routes to the viewed user when different from logged-in user', () => {
    expect(resolveRoute(findCatalogEntry('gallery'), 'me', 'other')).toBe('/social?user=other&tab=gallery');
    expect(resolveRoute(findCatalogEntry('calendar'), 'me', 'other')).toBe('/calendar?user=other');
    expect(resolveRoute(findCatalogEntry('chat'), 'me', 'other')).toBe('/chat?user=other');
    expect(resolveRoute(findCatalogEntry('friends'), 'me', 'other')).toBe('/social?user=other&tab=friends');
  });

  it('resolves contextual routes to own profile when viewing self', () => {
    expect(resolveRoute(findCatalogEntry('gallery'), 'me', 'me')).toBe('/social?tab=gallery');
    expect(resolveRoute(findCatalogEntry('calendar'), 'me', 'me')).toBe('/calendar');
    expect(resolveRoute(findCatalogEntry('gallery'), 'me', '')).toBe('/social?tab=gallery');
  });

  it('resolves about to aboutme tab', () => {
    expect(resolveRoute(findCatalogEntry('about'), 'me', 'other')).toBe('/social?user=other&tab=aboutme');
    expect(resolveRoute(findCatalogEntry('my-about'), 'me', 'other')).toBe('/social?tab=aboutme');
  });

  it('returns null for null entry', () => {
    expect(resolveRoute(null, 'me', '')).toBeNull();
  });
});
