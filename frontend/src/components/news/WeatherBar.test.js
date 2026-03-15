import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import WeatherBar from './WeatherBar';
import { newsAPI } from '../../utils/api';

jest.mock('../../utils/api', () => ({
  newsAPI: {
    getWeather: jest.fn(),
  },
}));

describe('WeatherBar', () => {
  let container;
  let root;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('falls back to the first location with usable current weather', async () => {
    newsAPI.getWeather.mockResolvedValue({
      data: {
        locations: [
          {
            _id: 'broken-primary',
            isPrimary: true,
            label: 'Broken Primary',
            error: 'Weather service temporarily unavailable',
            weather: null,
          },
          {
            _id: 'healthy-secondary',
            city: 'Austin',
            state: 'TX',
            isPrimary: false,
            weather: {
              current: {
                temperature: 72,
                shortForecast: 'Clear',
                humidity: 41,
                icon: 'sun',
              },
              high: 78,
              low: 59,
              hourly: [],
              weekly: [],
            },
          },
        ],
      },
    });

    await act(async () => {
      root.render(<WeatherBar />);
    });
    await flush();

    expect(newsAPI.getWeather).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('72°');
    expect(container.textContent).toContain('Austin, TX');
    expect(container.textContent).not.toContain('Weather unavailable');
  });

  it('renders an explicit unavailable state when no weather locations resolve', async () => {
    newsAPI.getWeather.mockResolvedValue({
      data: {
        locations: [],
      },
    });

    await act(async () => {
      root.render(<WeatherBar variant="card" />);
    });
    await flush();

    expect(container.textContent).toContain('Weather unavailable');
    expect(container.textContent).toContain('Add a weather or news location in preferences to load forecasts here.');
  });

  it('shows wind gusts in the expanded hourly forecast', async () => {
    newsAPI.getWeather.mockResolvedValue({
      data: {
        locations: [
          {
            _id: 'gusty-primary',
            city: 'Austin',
            state: 'TX',
            isPrimary: true,
            weather: {
              current: {
                temperature: 72,
                shortForecast: 'Windy',
                humidity: 41,
                icon: 'cloud-sun',
                windSpeed: 14,
                windGust: 24,
              },
              high: 78,
              low: 59,
              hourly: [
                {
                  time: '2026-03-15T18:00:00.000Z',
                  temperature: 71,
                  icon: 'cloud-sun',
                  precipitationProbability: 10,
                  windSpeed: 15,
                  windGust: 26,
                }
              ],
              weekly: [],
            },
          },
        ],
      },
    });

    await act(async () => {
      root.render(<WeatherBar />);
    });
    await flush();

    const expandButton = container.querySelector('button[aria-label="Expand weather"]');
    expect(expandButton).toBeTruthy();

    await act(async () => {
      expandButton.click();
    });

    expect(container.textContent).toContain('Gusts 24 mph');
    expect(container.textContent).toContain('Gust 26 mph');
  });
});