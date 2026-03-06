import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Home landing page CTA behavior', () => {
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

  it('shows registration/login CTAs for logged-out visitors', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.textContent).toContain('Sign Up Free');
    expect(container.textContent).toContain('Register');
    expect(container.textContent).toContain('Login');
  });

  it('hides registration/login CTAs and shows member actions for logged-in users', async () => {
    await renderHome({ isAuthenticated: true });

    expect(container.textContent).not.toContain('Sign Up Free');
    expect(container.textContent).not.toContain('Register');
    expect(container.textContent).toContain('Open Social Feed');
    expect(container.textContent).toContain('Explore Maps');
    expect(container.textContent).toContain('Go to Social');
    expect(container.textContent).toContain('Open Calendar');
    expect(container.textContent).toContain('Interactive maps with population density heatmaps');
  });
});
