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
    userAPI.search.mockResolvedValue({
      data: {
        users: [],
        unsupportedCriteria: []
      }
    });
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

  it('shows default results on initial load without filters', async () => {
    userAPI.search.mockResolvedValue({
      data: {
        users: [
          {
            _id: 'u-1',
            username: 'mostfriends',
            realName: 'Most Friends',
            city: 'Seattle',
            state: 'WA'
          },
          {
            _id: 'u-2',
            username: 'leastfriends',
            realName: 'Least Friends',
            city: 'Boise',
            state: 'ID'
          }
        ],
        unsupportedCriteria: []
      }
    });

    await renderHome({ isAuthenticated: false });
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(userAPI.search).toHaveBeenCalledWith(expect.objectContaining({
      firstName: '',
      lastName: ''
    }));
    expect(container.textContent).toContain('2 shown');
    expect(container.textContent).toContain('Most Friends');
    expect(container.textContent).toContain('Least Friends');
  });

  it('uses compact advanced controls with dropdowns, slider, and autosuggest wiring', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.querySelector('select[name="state"]')).not.toBeNull();
    expect(container.querySelector('select[name="sex"]')).not.toBeNull();
    expect(container.querySelector('select[name="race"]')).not.toBeNull();
    expect(container.querySelector('input[name="ageFilters"][type="range"]')).not.toBeNull();
    expect(container.querySelector('input[name="city"]')?.getAttribute('list')).toBe('home-city-suggestions');
    expect(container.querySelector('input[name="county"]')?.getAttribute('list')).toBe('home-county-suggestions');
    expect(container.querySelector('input[name="zip"]')?.getAttribute('list')).toBe('home-zip-suggestions');

    const stateSelect = container.querySelector('select[name="state"]');
    const sexSelect = container.querySelector('select[name="sex"]');
    const raceSelect = container.querySelector('select[name="race"]');
    const ageToggle = container.querySelector('input[name="ageFiltersEnabled"]');
    const ageRange = container.querySelector('input[name="ageFilters"][type="range"]');
    expect(ageRange.disabled).toBe(true);
    const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value'
    ).set;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;

    await act(async () => {
      nativeSelectValueSetter.call(stateSelect, 'TX');
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
      nativeSelectValueSetter.call(sexSelect, 'Female');
      sexSelect.dispatchEvent(new Event('change', { bubbles: true }));
      nativeSelectValueSetter.call(raceSelect, 'Asian');
      raceSelect.dispatchEvent(new Event('change', { bubbles: true }));
      ageToggle.checked = true;
      ageToggle.dispatchEvent(new Event('change', { bubbles: true }));
      nativeInputValueSetter.call(ageRange, '42');
      ageRange.dispatchEvent(new Event('input', { bubbles: true }));
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 50);
    });
    expect(ageRange.disabled).toBe(false);

    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(userAPI.search).toHaveBeenLastCalledWith(expect.objectContaining({
      state: 'TX',
      sex: 'Female',
      race: 'Asian',
      ageFilters: '42'
    }));
  });
});
