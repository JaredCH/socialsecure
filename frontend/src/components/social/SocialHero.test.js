import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SocialHero from './SocialHero';

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
});