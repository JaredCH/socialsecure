import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import News from './News';
import { newsAPI } from '../utils/api';

jest.mock('../utils/api', () => ({
  newsAPI: {
    getPreferences: jest.fn(),
    getLocationTaxonomy: jest.fn(),
    getFeed: jest.fn(),
    getSources: jest.fn(),
    getSportsTeams: jest.fn(),
    geocodeWeatherLocations: jest.fn(),
    updatePreferences: jest.fn(),
    addLocation: jest.fn(),
    removeLocation: jest.fn(),
    addKeyword: jest.fn(),
    removeKeyword: jest.fn(),
    updateHiddenCategories: jest.fn(),
    refreshSourceHealth: jest.fn(),
    addWeatherLocation: jest.fn(),
    removeWeatherLocation: jest.fn(),
    updateWeatherLocations: jest.fn(),
    setWeatherLocationPrimary: jest.fn(),
    getWeather: jest.fn(),
    reportImpressions: jest.fn(),
  }
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('News desktop article popup', () => {
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
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const preferences = {
      defaultScope: 'global',
      googleNewsEnabled: true,
      rssSources: [],
      locations: [{ _id: 'loc-1', city: 'Austin', state: 'TX', country: 'US', isPrimary: true }],
      followedKeywords: [],
      hiddenCategories: [],
      followedSportsTeams: [],
      weatherLocations: [],
    };

    newsAPI.getPreferences.mockResolvedValue({ data: { preferences } });
    newsAPI.getLocationTaxonomy.mockResolvedValue({
      data: {
        taxonomy: {
          country: { code: 'US', name: 'United States' },
          states: [],
          citiesByState: {},
        }
      }
    });
    newsAPI.getFeed.mockResolvedValue({
      data: {
        articles: [
          {
            _id: 'article-1',
            title: 'Austin technology update',
            description: 'Desc',
            source: 'Yahoo News',
            category: 'technology',
            publishedAt: '2026-03-01T00:00:00.000Z',
            url: 'https://example.com/news'
          }
        ],
        sections: {},
        pagination: { page: 1, pages: 1, total: 1 }
      }
    });
    newsAPI.getSources.mockResolvedValue({ data: { sources: [], topUsedSources: [] } });
    newsAPI.getSportsTeams.mockResolvedValue({ data: { leagues: [] } });
    newsAPI.getWeather.mockResolvedValue({ data: { locations: [] } });
    newsAPI.geocodeWeatherLocations.mockResolvedValue({ data: { suggestions: [] } });
    newsAPI.updatePreferences.mockResolvedValue({ data: { preferences } });
    newsAPI.addLocation.mockResolvedValue({ data: { preferences } });
    newsAPI.removeLocation.mockResolvedValue({ data: { preferences } });
    newsAPI.addKeyword.mockResolvedValue({ data: { preferences } });
    newsAPI.removeKeyword.mockResolvedValue({ data: { preferences } });
    newsAPI.updateHiddenCategories.mockResolvedValue({ data: { preferences } });
    newsAPI.refreshSourceHealth.mockResolvedValue({ data: { sources: [] } });
    newsAPI.addWeatherLocation.mockResolvedValue({ data: { preferences } });
    newsAPI.removeWeatherLocation.mockResolvedValue({ data: { preferences } });
    newsAPI.updateWeatherLocations.mockResolvedValue({ data: { preferences } });
    newsAPI.setWeatherLocationPrimary.mockResolvedValue({ data: { preferences } });
    newsAPI.reportImpressions.mockResolvedValue({ data: { ok: true } });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it('opens a desktop popup preview instead of the side drawer when an article is clicked', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <News />
        </MemoryRouter>
      );
    });
    await act(async () => Promise.resolve());

    const articleRows = Array.from(container.querySelectorAll('article'));
    expect(articleRows.length).toBeGreaterThan(0);

    await act(async () => {
      articleRows[articleRows.length - 1].dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: 240,
        clientY: 180,
      }));
    });

    const popup = document.body.querySelector('[data-testid="article-popup-preview"]');
    expect(popup).toBeTruthy();
    expect(document.body.querySelector('[data-testid="article-drawer-panel"]')).toBeNull();
    expect(popup.textContent).toContain('Austin technology update');
    expect(popup.textContent).toContain('Desc');
    expect(popup.textContent).toContain('Open Original Article');
    expect(popup.textContent).toContain('Close');
  });
});
