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
    geocodeWeatherLocations: jest.fn(),
    reportImpressions: jest.fn(),
  }
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('News desktop search', () => {
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
        feed: [
          { _id: 'article-1', title: 'Austin technology update', description: 'Latest tech headlines', source: 'Example', publishedAt: '2026-03-01T00:00:00.000Z' },
          { _id: 'article-2', title: 'Sports roundup', description: 'Daily sports recap', source: 'Example', publishedAt: '2026-03-01T00:00:00.000Z' }
        ]
      }
    });
    newsAPI.getWeather.mockResolvedValue({ data: { locations: [] } });
    newsAPI.geocodeWeatherLocations.mockResolvedValue({ data: { suggestions: [] } });
    newsAPI.reportImpressions.mockResolvedValue({});

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

  it('keeps the desktop search text while filtering results', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <News />
        </MemoryRouter>
      );
    });
    await act(async () => Promise.resolve());

    const desktopShell = Array.from(container.querySelectorAll('div')).find((el) => (
      typeof el.className === 'string'
      && el.className.includes('hidden lg:flex')
      && el.className.includes('overflow-hidden')
    ));
    const desktopFilterBar = Array.from(desktopShell.querySelectorAll('div')).find((el) => (
      typeof el.className === 'string'
      && el.className.includes('bg-white/95')
      && el.className.includes('backdrop-blur')
    ));
    const searchInput = desktopFilterBar.querySelector('input[type="search"]');
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;

    await act(async () => {
      nativeInputValueSetter.call(searchInput, 'tech');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(searchInput.value).toBe('tech');
    expect(container.textContent).toContain('1 result for "tech"');
    expect(container.textContent).toContain('Austin technology update');
    expect(container.textContent).not.toContain('2 results for "tech"');
  });
});
