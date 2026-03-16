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
    reportImpressions: jest.fn(),
  }
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('News region dropdown', () => {
  let container;
  let root;
  let originalIntersectionObserver;

  const renderNews = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <News />
        </MemoryRouter>
      );
    });
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());
  };

  const getMobileRegionButton = () => Array.from(
    container.querySelector('[data-testid="news-mobile-filter-bar-shell"]').querySelectorAll('button')
  ).find((button) => button.textContent.includes('location_on'));

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
    jest.clearAllMocks();
    newsAPI.getPreferences.mockResolvedValue({
      data: {
        preferences: { rssSources: [], followedSportsTeams: [], hiddenCategories: [] },
        registrationAlignment: null
      }
    });
    newsAPI.getLocationTaxonomy.mockResolvedValue({
      data: {
        taxonomy: {
          country: { code: 'US', name: 'United States' },
          states: [
            { code: 'CA', name: 'California' },
            { code: 'TX', name: 'Texas' },
            { code: 'NY', name: 'New York' },
            { code: 'PR', name: 'Puerto Rico' }
          ],
          citiesByState: {
            CA: ['Los Angeles'],
            TX: ['Austin', 'Dallas'],
            NY: ['New York'],
            PR: ['San Juan']
          },
          preferredStateCode: 'TX',
          preferredStateName: 'Texas'
        }
      }
    });
    newsAPI.getSources.mockResolvedValue({ data: { sources: [] } });
    newsAPI.getSportsTeams.mockResolvedValue({ data: { leagues: [] } });
    newsAPI.getFeed.mockResolvedValue({
      data: {
        sections: {},
        feed: [{ _id: 'article-1', title: 'Austin technology update', source: 'Example', publishedAt: '2026-03-01T00:00:00.000Z' }]
      }
    });
    newsAPI.getWeather.mockResolvedValue({ data: { locations: [] } });
    newsAPI.reportImpressions.mockResolvedValue({ data: { ok: true } });

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

  it('pins the ZIP-matched state above the alphabetical list and omits territories', async () => {
    await renderNews();

    const regionButton = getMobileRegionButton();
    await act(async () => {
      regionButton.click();
    });

    const preferredTexas = container.querySelector('[data-testid="region-state-option-TX"]');
    const california = container.querySelector('[data-testid="region-state-option-CA"]');
    const newYork = container.querySelector('[data-testid="region-state-option-NY"]');
    const divider = container.querySelector('[data-testid="region-preferred-divider"]');

    expect(preferredTexas).not.toBeNull();
    expect(divider).not.toBeNull();
    expect(california).not.toBeNull();
    expect(newYork).not.toBeNull();
    expect(container.querySelector('[data-testid="region-state-option-PR"]')).toBeNull();
    expect(preferredTexas.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divider.compareDocumentPosition(california) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(california.compareDocumentPosition(newYork) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lets users pick a state or city without manual typing and reloads the feed with region params', async () => {
    await renderNews();

    const regionButton = getMobileRegionButton();
    await act(async () => {
      regionButton.click();
    });

    const dropdownMenu = container.querySelector('[data-testid="filter-dropdown-menu"]');
    expect(dropdownMenu.querySelectorAll('input').length).toBe(0);

    const california = container.querySelector('[data-testid="region-state-option-CA"]');
    await act(async () => {
      california.click();
    });

    expect(newsAPI.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      limit: 50,
      country: 'US',
      state: 'CA'
    }));

    await act(async () => {
      getMobileRegionButton().click();
    });
    await act(async () => {
      container.querySelector('button[aria-label="Expand cities for Texas"]').click();
    });
    await act(async () => {
      container.querySelector('[data-testid="region-city-option-TX-austin"]').click();
    });

    expect(newsAPI.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      limit: 50,
      country: 'US',
      state: 'TX',
      city: 'Austin'
    }));
    expect(getMobileRegionButton().textContent).toContain('Austin, Texas');
  });
});
