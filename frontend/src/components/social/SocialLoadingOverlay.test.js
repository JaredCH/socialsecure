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
    const left = container.querySelector('.rp-left');
    const right = container.querySelector('.rp-right');
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(left.classList.contains('animate-reveal')).toBe(true);
    expect(right.classList.contains('animate-reveal')).toBe(true);
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

  it('renders skeleton shimmer placeholders', async () => {
    await renderOverlay();
    const skeleton = container.querySelector('[data-testid="social-skeleton"]');
    expect(skeleton).toBeTruthy();
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    // Check specific skeleton elements
    expect(container.querySelector('.skeleton-avatar')).toBeTruthy();
    expect(container.querySelectorAll('.skeleton-line').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('.skeleton-card').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('.skeleton-square').length).toBe(3);
  });

  it('renders real content alongside skeleton and overlay', async () => {
    await renderOverlay();
    const real = container.querySelector('[data-testid="real-content"]');
    expect(real).toBeTruthy();
    expect(real.textContent).toBe('Real Content');
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
