import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Home, { SEARCH_DEBOUNCE_MS } from './Home';
import { userAPI } from '../utils/api';

jest.mock('../utils/api', () => ({
  userAPI: {
    search: jest.fn()
  }
}));

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
    jest.useFakeTimers();
    userAPI.search.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  it('shows registration/login CTAs for logged-out visitors', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.textContent).toContain('Start a Search Session');
    expect(container.textContent).toContain('Name First');
    expect(container.textContent).toContain('Name Last');
    expect(container.textContent).toContain('Friends of User');
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

  it('streams search results while typing and renders profile/hero images', async () => {
    userAPI.search.mockResolvedValue({
      data: {
        users: [
          {
            _id: 'u-1',
            username: 'alice',
            realName: 'Alice Johnson',
            city: 'Austin',
            state: 'TX',
            avatarUrl: 'https://cdn.example.com/alice-avatar.jpg',
            bannerUrl: 'https://cdn.example.com/alice-banner.jpg'
          }
        ],
        unsupportedCriteria: []
      }
    });

    await renderHome({ isAuthenticated: false });

    const firstNameInput = container.querySelector('input[name="firstName"]');
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    await act(async () => {
      nativeInputValueSetter.call(firstNameInput, 'Ali');
      firstNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 50);
    });

    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(userAPI.search).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Ali' }));
    expect(container.textContent).toContain('Alice Johnson');
    expect(container.querySelector('img[alt="Alice Johnson hero"]')).not.toBeNull();
    expect(container.querySelector('img[alt="Alice Johnson profile"]')).not.toBeNull();
  });
});
