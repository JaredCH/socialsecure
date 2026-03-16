import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import News from './News';
import { newsAPI } from '../utils/api';

jest.mock('../utils/api', () => ({
  newsAPI: {
    getPreferences: jest.fn(),
    getLocationTaxonomy: jest.fn(),
    getSources: jest.fn(),
    getSportsTeams: jest.fn(),
    getFeed: jest.fn(),
    getWeather: jest.fn(),
    updateHiddenCategories: jest.fn(),
    reportImpressions: jest.fn(),
  }
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('News category controls', () => {
  let container;
  let root;
  let originalIntersectionObserver;

  const basePreferences = {
    rssSources: [],
    followedSportsTeams: [],
    hiddenCategories: []
  };

  const setupApiMocks = () => {
    newsAPI.getPreferences.mockResolvedValue({ data: { preferences: basePreferences } });
    newsAPI.getLocationTaxonomy.mockResolvedValue({ data: { taxonomy: { country: { code: 'US', name: 'United States' }, states: [], citiesByState: {} } } });
    newsAPI.getSources.mockResolvedValue({ data: { sources: [] } });
    newsAPI.getSportsTeams.mockResolvedValue({ data: { leagues: [] } });
    newsAPI.getFeed.mockResolvedValue({
      data: {
        sections: {},
        feed: [{ _id: 'article-1', title: 'Tech news', source: 'Example', publishedAt: '2026-03-01T00:00:00.000Z' }]
      }
    });
    newsAPI.getWeather.mockResolvedValue({ data: { locations: [] } });
    newsAPI.updateHiddenCategories.mockResolvedValue({ data: { preferences: { ...basePreferences, hiddenCategories: ['sports'] } } });
    newsAPI.reportImpressions.mockResolvedValue({ data: { ok: true } });
  };

  const renderNews = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <News />
        </MemoryRouter>
      );
    });
    await act(async () => Promise.resolve());
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupApiMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  beforeAll(() => {
    originalIntersectionObserver = global.IntersectionObserver;
    global.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  });

  afterAll(() => {
    global.IntersectionObserver = originalIntersectionObserver;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('sorts category list as enabled A-Z followed by disabled A-Z', async () => {
    newsAPI.getPreferences.mockResolvedValueOnce({
      data: {
        preferences: {
          ...basePreferences,
          hiddenCategories: ['business', 'ai']
        }
      }
    });

    await renderNews();

    const categoryRows = Array.from(container.querySelectorAll('[data-category-key]'));
    const firstDisabledIndex = categoryRows.findIndex((row) => row.getAttribute('data-disabled') === 'true');
    expect(firstDisabledIndex).toBeGreaterThan(0);

    const disabledRows = categoryRows.slice(firstDisabledIndex);
    expect(disabledRows.every((row) => row.getAttribute('data-disabled') === 'true')).toBe(true);

    const disabledKeys = disabledRows.map((row) => row.getAttribute('data-category-key'));
    expect(disabledKeys.slice(0, 2)).toEqual(['ai', 'business']);
  });

  it('persists category toggle changes through updateHiddenCategories', async () => {
    await renderNews();

    const toggleButton = container.querySelector('button[aria-label="Disable category Sports"]');
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton.click();
    });

    expect(newsAPI.updateHiddenCategories).toHaveBeenCalledWith(expect.arrayContaining(['sports']));
  });

  it('keeps closed settings drawer non-interactive', async () => {
    await renderNews();

    const settingsDrawer = container.querySelector('[aria-label="News Settings"]');
    expect(settingsDrawer).toBeTruthy();
    expect(settingsDrawer.className).toContain('pointer-events-none');
  });
});
