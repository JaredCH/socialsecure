import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SocialLoadingOverlay from './SocialLoadingOverlay';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SocialLoadingOverlay', () => {
  let container;
  let root;

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

  const renderOverlay = async (initialPath = '/social') => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <SocialLoadingOverlay>
            <div data-testid="real-content">Real Content</div>
          </SocialLoadingOverlay>
        </MemoryRouter>
      );
    });
  };

  it('renders the loading overlay on mount', async () => {
    await renderOverlay();
    const overlay = container.querySelector('[data-testid="loading-overlay"]');
    expect(overlay).toBeTruthy();
    expect(overlay.id).toBe('loading-overlay');
  });

  it('renders two split-reveal panels', async () => {
    await renderOverlay();
    const left = container.querySelector('.po-panel-left');
    const right = container.querySelector('.po-panel-right');
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
  });

  it('displays the username when ?user= query param is present', async () => {
    await renderOverlay('/social?user=testuser');
    const name = container.querySelector('[data-testid="overlay-username"]');
    expect(name).toBeTruthy();
    expect(name.textContent).toBe('testuser');
  });

  it('does not display username when no ?user= param', async () => {
    await renderOverlay('/social');
    const name = container.querySelector('[data-testid="overlay-username"]');
    expect(name).toBeFalsy();
  });

  it('renders skeleton shimmer placeholders with profile details', async () => {
    await renderOverlay();
    const skeleton = container.querySelector('[data-testid="social-skeleton"]');
    expect(skeleton).toBeTruthy();
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    // Hero avatar, name and city/location placeholders
    expect(container.querySelector('[data-testid="skeleton-hero-avatar"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="skeleton-name"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="skeleton-city"]')).toBeTruthy();
    // Hero tab bar
    expect(container.querySelector('[data-testid="skeleton-tabs"]')).toBeTruthy();
    // Sidebar panels
    expect(container.querySelector('[data-testid="skeleton-about-panel"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="skeleton-details-panel"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="skeleton-friends-panel"]')).toBeTruthy();
    // Detail rows (location, website, pronouns, joined)
    expect(container.querySelectorAll('[data-testid="skeleton-detail-row"]').length).toBe(4);
    // Stat squares and feed cards
    expect(container.querySelectorAll('.skeleton-square').length).toBe(3);
    expect(container.querySelectorAll('.skeleton-card').length).toBeGreaterThanOrEqual(3);
    // Friend avatars
    expect(container.querySelectorAll('.skeleton-friend-avatar').length).toBe(5);
  });

  it('renders real content alongside skeleton and overlay', async () => {
    await renderOverlay();
    const real = container.querySelector('[data-testid="real-content"]');
    expect(real).toBeTruthy();
    expect(real.textContent).toBe('Real Content');
  });

  it('adds .open class at 250ms to split panels', async () => {
    await renderOverlay();
    const overlay = container.querySelector('[data-testid="loading-overlay"]');
    expect(overlay.classList.contains('open')).toBe(false);

    await act(async () => { jest.advanceTimersByTime(250); });

    const overlayAfter = container.querySelector('[data-testid="loading-overlay"]');
    expect(overlayAfter).toBeTruthy();
    expect(overlayAfter.classList.contains('open')).toBe(true);
  });

  it('begins fade-out at 800ms', async () => {
    await renderOverlay();
    const overlay = container.querySelector('[data-testid="loading-overlay"]');
    expect(overlay.classList.contains('fade-out')).toBe(false);

    await act(async () => { jest.advanceTimersByTime(800); });

    const overlayAfter = container.querySelector('[data-testid="loading-overlay"]');
    expect(overlayAfter).toBeTruthy();
    expect(overlayAfter.classList.contains('fade-out')).toBe(true);
  });

  it('removes overlay from DOM at 1100ms', async () => {
    await renderOverlay();
    expect(container.querySelector('[data-testid="loading-overlay"]')).toBeTruthy();

    await act(async () => { jest.advanceTimersByTime(1100); });

    expect(container.querySelector('[data-testid="loading-overlay"]')).toBeFalsy();
  });

  it('removes skeleton after timeout', async () => {
    await renderOverlay();
    expect(container.querySelector('[data-testid="social-skeleton"]')).toBeTruthy();

    await act(async () => { jest.advanceTimersByTime(2000); });

    expect(container.querySelector('[data-testid="social-skeleton"]')).toBeFalsy();
  });
});
