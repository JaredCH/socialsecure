import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import FilterBar from './FilterBar';

jest.mock('../../utils/api', () => ({
  newsAPI: {
    geocodeWeatherLocations: jest.fn(),
  },
}));

describe('FilterBar', () => {
  let container;
  let root;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

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

  it('renders with default labels and search input', async () => {
    await act(async () => {
      root.render(
        <FilterBar
          onCategoryChange={() => {}}
          onSearch={() => {}}
          onRegionChange={() => {}}
          onDateChange={() => {}}
        />
      );
    });

    expect(container.querySelector('input[type="search"]')).not.toBeNull();
    expect(container.textContent).toContain('All');
    expect(container.textContent).toContain('Any time');
  });

  it('uses elevated z-index classes so dropdown menus render above feed content', async () => {
    await act(async () => {
      root.render(
        <FilterBar
          categories={[{ key: 'sports', label: 'Sports' }]}
          onCategoryChange={() => {}}
          onSearch={() => {}}
          onRegionChange={() => {}}
          onDateChange={() => {}}
        />
      );
    });

    const shell = container.querySelector('.bg-white\\/95');
    expect(shell).not.toBeNull();
    expect(shell.className).toContain('relative');
    expect(shell.className).toContain('z-30');

    const categoryTrigger = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.includes('All')
    );
    expect(categoryTrigger).toBeTruthy();

    await act(async () => {
      categoryTrigger.click();
    });

    const openMenu = container.querySelector('[data-testid="filter-dropdown-menu"]');
    expect(openMenu).not.toBeNull();
    expect(openMenu.className).toContain('z-[70]');
  });
});
