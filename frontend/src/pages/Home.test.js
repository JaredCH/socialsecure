import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Home landing page', () => {
  let container;
  let root;

  const renderHome = async (props = {}) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Home {...props} />
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

  it('shows the new landing page messaging and logged-out CTAs', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.textContent).toContain('One secure home for your people, plans, and private conversations.');
    expect(container.textContent).toContain('Manage friends with the Social v Secure system');
    expect(container.textContent).toContain('Direct messages are completely encrypted');
    expect(container.textContent).toContain('bring your own PGP');
    expect(container.textContent).toContain('Sign Up Free');
    expect(container.textContent).toContain('Register');
    expect(container.textContent).toContain('Login');
    expect(container.textContent).not.toContain('Start a Search Session');
    expect(container.textContent).not.toContain('Search Results');
  });

  it('shows authenticated member actions instead of signup prompts', async () => {
    await renderHome({ isAuthenticated: true });

    expect(container.textContent).toContain('Open Social Feed');
    expect(container.textContent).toContain('Open Chat');
    expect(container.textContent).toContain('Go to Social');
    expect(container.textContent).toContain('Open Calendar');
    expect(container.textContent).not.toContain('Sign Up Free');
    expect(container.querySelector('a[href="/chat"]')).not.toBeNull();
    expect(container.querySelector('a[href="/calendar"]')).not.toBeNull();
  });

  it('highlights friend-management examples and the full platform feature set', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.textContent).toContain('Inner circle planning');
    expect(container.textContent).toContain('Social vs. secure conversations');
    expect(container.textContent).toContain('Projects, family, and local groups');
    expect(container.textContent).toContain('Maps and heatmaps');
    expect(container.textContent).toContain('Profiles, resumes, and blogs');
    expect(container.querySelector('a[href="#platform-overview"]')).not.toBeNull();
  });

  it('renders the animated hero map system and encrypted direct messaging showcase', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.querySelector('[data-testid="hero-map-system"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="hero-map-dot"]')).toHaveLength(180);
    expect(container.textContent).toContain('Community density map');
    expect(container.textContent).toContain('Hundreds of users • Center glow');
    expect(container.textContent).toContain('Converging user density');
    expect(container.textContent).toContain('Transparent heat overlay');
    expect(container.querySelector('[data-testid="encrypted-dm-showcase"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="dm-flow-stage"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="dm-cipher-row"]')).toHaveLength(6);
    expect(container.textContent).toContain('Encrypted direct messaging, presented as a living conversation');
    expect(container.textContent).toContain('End-to-end encrypted');
    expect(container.textContent).toContain('Matrix-style ciphering');
    expect(container.textContent).toContain('New message');
    expect(container.textContent).toContain('Encryption password required');
    expect(container.textContent).toContain('Plain readable text');
  });
});
