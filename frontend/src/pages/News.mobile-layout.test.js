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
  }
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('News mobile persistent header layout', () => {
  let container;
  let root;
  let originalIntersectionObserver;

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

  beforeEach(() => {
    newsAPI.getPreferences.mockResolvedValue({ data: { preferences: { rssSources: [], followedSportsTeams: [] } } });
    newsAPI.getLocationTaxonomy.mockResolvedValue({ data: { taxonomy: { country: { code: 'US', name: 'United States' }, states: [], citiesByState: {} } } });
    newsAPI.getSources.mockResolvedValue({ data: { sources: [] } });
    newsAPI.getSportsTeams.mockResolvedValue({ data: { leagues: [] } });
    newsAPI.getFeed.mockResolvedValue({
      data: {
        sections: {},
        feed: [{ _id: 'article-1', title: 'Test article', source: 'Example', publishedAt: '2026-03-01T00:00:00.000Z' }]
      }
    });
    newsAPI.getWeather.mockResolvedValue({ data: { locations: [] } });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps top controls outside the feed scroll container on mobile', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <News />
        </MemoryRouter>
      );
    });
    await act(async () => Promise.resolve());

    const mobileLayout = container.querySelector('[data-testid="news-mobile-layout"]');
    const mobileFeed = container.querySelector('[data-testid="news-mobile-feed"]');

    expect(mobileLayout).not.toBeNull();
    expect(mobileLayout.className).toContain('overflow-hidden');
    expect(mobileFeed).not.toBeNull();
    expect(mobileFeed.className).toContain('overflow-y-auto');
  });

  it('uses the updated floating settings launcher style and right alignment on mobile', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <News />
        </MemoryRouter>
      );
    });
    await act(async () => Promise.resolve());

    const openSettingsButton = container.querySelector('button[aria-label="Open news settings"]');
    expect(openSettingsButton).not.toBeNull();
    expect(openSettingsButton.className).toContain('right-2');
    expect(openSettingsButton.className).toContain('bg-slate-950/75');
    expect(openSettingsButton.className).toContain('backdrop-blur-xl');
  });

  it('keeps the mobile filter shell above the feed for dropdown layering', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <News />
        </MemoryRouter>
      );
    });
    await act(async () => Promise.resolve());

    const mobileFilterShell = container.querySelector('[data-testid="news-mobile-filter-bar-shell"]');
    expect(mobileFilterShell).not.toBeNull();
    expect(mobileFilterShell.className).toContain('relative');
    expect(mobileFilterShell.className).toContain('z-40');
  });
});
