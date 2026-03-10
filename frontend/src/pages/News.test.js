import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import News from './News';
import { newsAPI } from '../utils/api';

jest.mock('../utils/api', () => ({
  newsAPI: {
    getPreferences: jest.fn(),
    getTopics: jest.fn(),
    getPromoted: jest.fn(),
    getFeed: jest.fn(),
    getSources: jest.fn(),
    updatePreferences: jest.fn(),
    addLocation: jest.fn(),
    removeLocation: jest.fn(),
    addKeyword: jest.fn(),
    removeKeyword: jest.fn(),
    updateHiddenCategories: jest.fn(),
    addSource: jest.fn(),
    refreshSourceHealth: jest.fn(),
    getWeather: jest.fn(),
    getArticle: jest.fn(),
    addWeatherLocation: jest.fn(),
    removeWeatherLocation: jest.fn(),
    updateWeatherLocations: jest.fn(),
    setWeatherLocationPrimary: jest.fn()
  }
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('News inline preferences updates', () => {
  let container;
  let root;

  const basePreferences = {
    defaultScope: 'global',
    googleNewsEnabled: true,
    gdletEnabled: true,
    rssSources: [],
    locations: [{ _id: 'loc-1', city: 'Austin', state: 'TX', country: 'US', isPrimary: true }],
    followedKeywords: [],
    hiddenCategories: []
  };

  const setupApiMocks = () => {
    newsAPI.getPreferences.mockResolvedValue({ data: { preferences: basePreferences } });
    newsAPI.getTopics.mockResolvedValue({ data: { topics: ['technology'] } });
    newsAPI.getPromoted.mockResolvedValue({ data: { items: [] } });
    newsAPI.getFeed.mockResolvedValue({
      data: {
        articles: [
          {
            _id: 'article-1',
            title: 'Austin technology update',
            description: 'Desc',
            source: 'Yahoo News',
            sourceType: 'rss',
            sourceId: 'yahoo-news',
            publishedAt: '2026-03-01T00:00:00.000Z'
          }
        ],
        pagination: { page: 1, pages: 1, total: 1 },
        personalization: { activeScope: 'global', fallbackApplied: false }
      }
    });
    newsAPI.getSources.mockResolvedValue({
      data: {
        sources: [
          {
            id: 'google-news',
            _id: null,
            name: 'Google News',
            url: 'https://news.google.com/rss',
            providerId: 'google-news',
            type: 'googleNews',
            category: 'general',
            categories: ['Top Stories'],
            wired: false,
            wiringState: 'catalog_only',
            enabled: false,
            health: 'yellow',
            healthReason: 'not_wired'
          },
          {
            id: 'yahoo-src',
            _id: 'src-1',
            name: 'Yahoo News',
            url: 'https://news.yahoo.com/rss',
            providerId: 'custom-rss',
            type: 'rss',
            category: 'general',
            categories: ['general'],
            wired: true,
            wiringState: 'wired',
            enabled: true,
            health: 'green',
            healthReason: 'last_fetch_success_recent'
          },
          {
            id: 'reuters',
            _id: null,
            name: 'Reuters',
            url: 'https://www.reuters.com',
            providerId: 'reuters',
            type: 'rss',
            category: 'general',
            categories: ['World'],
            wired: true,
            wiringState: 'wired',
            enabled: true,
            health: 'yellow',
            healthReason: 'never_fetched'
          }
        ],
        topUsedSources: [],
        catalogVersion: 1
      }
    });
    newsAPI.updatePreferences.mockResolvedValue({ data: { preferences: basePreferences } });
    newsAPI.addLocation.mockResolvedValue({ data: { preferences: basePreferences } });
    newsAPI.removeLocation.mockResolvedValue({ data: { preferences: basePreferences } });
    newsAPI.addKeyword.mockResolvedValue({ data: { preferences: basePreferences } });
    newsAPI.removeKeyword.mockResolvedValue({ data: { preferences: basePreferences } });
    newsAPI.updateHiddenCategories.mockResolvedValue({ data: { preferences: basePreferences } });
    newsAPI.addSource.mockResolvedValue({ data: {} });
    newsAPI.getWeather.mockResolvedValue({ data: { locations: [] } });
    newsAPI.getArticle.mockResolvedValue({ data: { article: { _id: 'article-1', title: 'Test', source: 'Test', publishedAt: '2026-03-01T00:00:00.000Z', url: 'https://example.com' } } });
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
    await act(async () => Promise.resolve());
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupApiMocks();
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

  it('refreshes feed after toggling a source', async () => {
    await renderNews();

    // Open the Sources accordion in the sidebar
    const sourcesAccordion = Array.from(container.querySelectorAll('button'))
      .find((btn) => btn.textContent.includes('Sources'));
    await act(async () => {
      sourcesAccordion.click();
    });

    const sourceToggle = container.querySelector('button[aria-label="Toggle Yahoo News"]');
    await act(async () => {
      sourceToggle.click();
    });

    expect(newsAPI.updatePreferences).toHaveBeenCalledWith(expect.objectContaining({
      rssSources: [expect.objectContaining({ sourceId: 'src-1', enabled: false })]
    }));
    expect(newsAPI.getFeed).toHaveBeenCalledTimes(2);
  });

  it('toggles a catalog source without DB id using provider identifier', async () => {
    await renderNews();

    const openSettingsButton = container.querySelector('button[aria-label="Configure news preferences"]');
    await act(async () => {
      openSettingsButton.click();
    });

    const sourceToggle = container.querySelector('button[aria-label="Toggle Reuters"]');
    await act(async () => {
      sourceToggle.click();
    });

    expect(newsAPI.updatePreferences).toHaveBeenCalledWith(expect.objectContaining({
      rssSources: [expect.objectContaining({ sourceId: 'reuters', enabled: false })]
    }));
  });

  it('submits primary location selection and refreshes feed', async () => {
    await renderNews();

    const openSettingsButton = container.querySelector('button[aria-label="Configure news preferences"]');
    await act(async () => {
      openSettingsButton.click();
    });

    // Click the Locations tab in the control panel
    const locationsTab = Array.from(container.querySelectorAll('button[role="tab"]'))
      .find((btn) => btn.textContent.includes('Locations'));
    await act(async () => {
      locationsTab.click();
    });

    const cityInput = container.querySelector('input[placeholder="City"]');
    const zipInput = container.querySelector('input[placeholder="ZIP"]');
    const primaryCheckbox = Array.from(container.querySelectorAll('input[type="checkbox"]'))
      .find((input) => input.closest('label')?.textContent?.includes('Make this my primary location'));
    const submitButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add Location');

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;

    await act(async () => {
      nativeInputValueSetter.call(cityInput, 'Dallas');
      cityInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeInputValueSetter.call(zipInput, '75201');
      zipInput.dispatchEvent(new Event('input', { bubbles: true }));
      primaryCheckbox.click();
    });

    await act(async () => {
      submitButton.click();
    });

    expect(newsAPI.addLocation).toHaveBeenCalledWith(expect.objectContaining({
      city: 'Dallas',
      zipCode: '75201',
      isPrimary: true
    }));
    expect(newsAPI.getFeed).toHaveBeenCalledTimes(2);
  });

  it('renders control panel with tabs when settings opened', async () => {
    await renderNews();

    const openSettingsButton = container.querySelector('button[aria-label="Configure news preferences"]');
    await act(async () => {
      openSettingsButton.click();
    });

    // Verify control panel header
    expect(container.textContent).toContain('News Control Panel');

    // Verify tab pills are rendered
    const tabs = container.querySelectorAll('button[role="tab"]');
    expect(tabs.length).toBe(5);
    const tabLabels = Array.from(tabs).map(t => t.textContent);
    expect(tabLabels).toEqual(expect.arrayContaining([
      expect.stringContaining('Sources'),
      expect.stringContaining('Keywords'),
      expect.stringContaining('Locations'),
      expect.stringContaining('Schedule'),
      expect.stringContaining('Export')
    ]));
  });

  it('renders source cards with health dots for wired and unwired sources', async () => {
    await renderNews();

    const openSettingsButton = container.querySelector('button[aria-label="Configure news preferences"]');
    await act(async () => {
      openSettingsButton.click();
    });

    // Sources tab is active by default – both Google News and Yahoo News should render
    expect(container.textContent).toContain('Google News');
    expect(container.textContent).toContain('Yahoo News');

    // Health dots should be present with aria-labels
    const healthDots = container.querySelectorAll('[aria-label="Connected"], [aria-label="Not wired"], [aria-label="Failing"]');
    expect(healthDots.length).toBeGreaterThan(0);
  });

  it('switches tabs in control panel', async () => {
    await renderNews();

    const openSettingsButton = container.querySelector('button[aria-label="Configure news preferences"]');
    await act(async () => {
      openSettingsButton.click();
    });

    // Click Keywords tab
    const keywordsTab = Array.from(container.querySelectorAll('button[role="tab"]'))
      .find((btn) => btn.textContent.includes('Keywords'));
    await act(async () => {
      keywordsTab.click();
    });

    expect(container.textContent).toContain('Tracked Keywords');

    // Click Locations tab
    const locationsTab = Array.from(container.querySelectorAll('button[role="tab"]'))
      .find((btn) => btn.textContent.includes('Locations'));
    await act(async () => {
      locationsTab.click();
    });

    expect(container.textContent).toContain('Location Preferences');
  });

  it('sidebar shows sources with health dots', async () => {
    await renderNews();

    // Open the Sources accordion in the sidebar
    const sourcesAccordion = Array.from(container.querySelectorAll('button'))
      .find((btn) => btn.textContent.includes('Sources'));
    await act(async () => {
      sourcesAccordion.click();
    });

    // Both merged sources should be visible in sidebar
    expect(container.textContent).toContain('Yahoo News');
    expect(container.textContent).toContain('Google News');

    // Health dots should exist in the sidebar
    const healthDots = container.querySelectorAll('[aria-label="Connected"], [aria-label="Not wired"]');
    expect(healthDots.length).toBeGreaterThan(0);
  });

  it('renders right sidebar with sources status card showing health dots', async () => {
    newsAPI.getSources.mockResolvedValue({
      data: {
        sources: [
          { _id: 'src-1', name: 'Yahoo News', type: 'rss', category: 'general', health: 'green', healthReason: 'Healthy' },
          { _id: 'src-2', name: 'CNN', type: 'rss', category: 'general', health: 'red', healthReason: 'Last fetch failed' }
        ],
        topUsedSources: []
      }
    });

    await renderNews();

    // Sources status card should be in right sidebar
    const sourceHealthDots = container.querySelectorAll('[aria-label*="Source"][aria-label*="health"]');
    expect(sourceHealthDots.length).toBeGreaterThanOrEqual(1);
  });

  it('renders weather widget section in the right sidebar', async () => {
    await renderNews();

    // Weather widget should be rendered (empty state when no locations)
    const weatherHeader = Array.from(container.querySelectorAll('h2'))
      .find(h => h.textContent.includes('Weather'));
    expect(weatherHeader).toBeTruthy();
  });

  it('uses full-width layout containers for news content area', async () => {
    await renderNews();
    expect(container.querySelector('.max-w-7xl')).toBeNull();
  });

  it('renders list/grid view toggle buttons', async () => {
    await renderNews();

    const listViewBtn = container.querySelector('button[aria-label="List view"]');
    const gridViewBtn = container.querySelector('button[aria-label="Grid view"]');
    expect(listViewBtn).toBeTruthy();
    expect(gridViewBtn).toBeTruthy();
  });

  it('switches to grid view when grid button is clicked', async () => {
    await renderNews();

    const gridViewBtn = container.querySelector('button[aria-label="Grid view"]');
    await act(async () => {
      gridViewBtn.click();
    });

    // In grid view, articles should be in a grid container
    const gridContainer = container.querySelector('.grid');
    expect(gridContainer).toBeTruthy();
  });

  it('renders keyword hits card when keywords are tracked', async () => {
    newsAPI.getPreferences.mockResolvedValue({
      data: {
        preferences: {
          ...basePreferences,
          followedKeywords: [{ keyword: 'bitcoin' }, { keyword: 'ai' }]
        }
      }
    });

    await renderNews();

    const keywordHitsHeader = Array.from(container.querySelectorAll('h2'))
      .find(h => h.textContent.includes('Keyword Hits'));
    expect(keywordHitsHeader).toBeTruthy();
  });

  it('renders local news card in the right sidebar', async () => {
    await renderNews();

    const localNewsHeader = Array.from(container.querySelectorAll('h2'))
      .find(h => h.textContent.includes('Local News'));
    expect(localNewsHeader).toBeTruthy();
  });
});
