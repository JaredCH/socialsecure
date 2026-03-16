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
    jest.useRealTimers();
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

  it('shows wind gusts in the compact card hourly forecast without hourly wind speed', async () => {
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
      root.render(<WeatherBar variant="card" />);
    });
    await flush();

    const expandButton = container.querySelector('button[aria-label="Expand weather details"]');
    expect(expandButton).toBeTruthy();

    await act(async () => {
      expandButton.click();
    });

    expect(container.textContent).toContain('Gust 24 mph');
    expect(container.textContent).toContain('Gust 26 mph');
    expect(container.textContent).not.toContain('15 mph');
  });

  it('keeps card variant compact by default and reveals extended details on expand', async () => {
    newsAPI.getWeather.mockResolvedValue({
      data: {
        locations: [
          {
            _id: 'compact-card',
            city: 'Austin',
            state: 'TX',
            isPrimary: true,
            weather: {
              current: {
                temperature: 72,
                shortForecast: 'Breezy',
                humidity: 41,
                icon: 'cloud-sun',
                windSpeed: 14,
                windGust: 24,
                pressure: 1014.4,
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
                },
                {
                  time: '2026-03-15T19:00:00.000Z',
                  temperature: 70,
                  icon: 'cloud',
                  precipitationProbability: 20,
                  windSpeed: 12,
                  windGust: 18,
                }
              ],
              weekly: [
                {
                  date: '2026-03-15',
                  high: 78,
                  low: 59,
                  icon: 'cloud-sun',
                  shortForecast: 'Breezy with a light shower chance later in the evening',
                  sunrise: '2026-03-15T12:34:00.000Z',
                  sunset: '2026-03-15T23:45:00.000Z',
                },
                {
                  date: '2026-03-16',
                  high: 75,
                  low: 57,
                  icon: 'cloud',
                  shortForecast: 'Cloudy and cool through the afternoon',
                }
              ],
              airQuality: { index: 42, label: 'Good' },
              sunrise: '2026-03-15T12:34:00.000Z',
              sunset: '2026-03-15T23:45:00.000Z',
            },
          },
        ],
      },
    });

    await act(async () => {
      root.render(<WeatherBar variant="card" />);
    });
    await flush();

    // Collapsed view shows temp, city, stats row (humidity, wind, precip)
    expect(container.textContent).toContain('72°');
    expect(container.textContent).toContain('Austin, TX');
    expect(container.textContent).toContain('41%');
    expect(container.textContent).toContain('14 mph');
    // Extended details should NOT be visible before expand
    expect(container.querySelector('[data-testid="weather-card-expanded"]')).toBeFalsy();

    const expandButton = container.querySelector('button[aria-label="Expand weather details"]');
    expect(expandButton).toBeTruthy();
    await act(async () => {
      expandButton.click();
    });

    const weatherCard = container.querySelector('section');
    const expandedPanel = container.querySelector('[data-testid="weather-card-expanded"]');
    expect(weatherCard.className).toContain('shrink-0');
    expect(expandedPanel).toBeTruthy();
    expect(expandedPanel.className).not.toContain('max-h-[24rem]');
    expect(expandedPanel.className).not.toContain('overflow-y-auto');
    expect(expandedPanel.querySelector('.overflow-x-auto')).toBeFalsy();
    // After expand, metric badges and forecasts are visible
    expect(container.textContent).toContain('Pressure 1014 hPa');
    expect(container.textContent).toContain('Air 14 mph');
    expect(container.textContent).toContain('Gust 24 mph');
    expect(container.textContent).toContain('Gust 26 mph');
    expect(container.textContent).not.toContain('15 mph');
    expect(container.textContent).not.toContain('12 mph');
    expect(container.textContent).toContain('Breezy with a light shower chance later in the evening');
    expect(container.textContent).toContain('Sunrise');
    expect(container.textContent).toContain('Sunset');
  });

  it('starts the card hourly forecast at the next local hour and limits it to 8 panels', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 2, 15, 13, 31, 0));

    const localHour = (hour) => new Date(2026, 2, 15, hour, 0, 0).toISOString();

    newsAPI.getWeather.mockResolvedValue({
      data: {
        locations: [
          {
            _id: 'hourly-window',
            city: 'Austin',
            state: 'TX',
            isPrimary: true,
            weather: {
              current: {
                temperature: 72,
                shortForecast: 'Breezy',
                humidity: 41,
                icon: 'cloud-sun',
                windSpeed: 14,
              },
              high: 78,
              low: 59,
              hourly: [
                { time: localHour(12), temperature: 70, icon: 'sun', windGust: 18 },
                { time: localHour(13), temperature: 71, icon: 'sun', windGust: 19 },
                { time: localHour(14), temperature: 72, icon: 'cloud-sun', windGust: 20 },
                { time: localHour(15), temperature: 73, icon: 'cloud-sun', windGust: 21 },
                { time: localHour(16), temperature: 74, icon: 'cloud', windGust: 22 },
                { time: localHour(17), temperature: 75, icon: 'cloud', windGust: 23 },
                { time: localHour(18), temperature: 76, icon: 'cloud-rain', windGust: 24 },
                { time: localHour(19), temperature: 77, icon: 'cloud-rain', windGust: 25 },
                { time: localHour(20), temperature: 78, icon: 'cloud-rain', windGust: 26 },
                { time: localHour(21), temperature: 79, icon: 'cloud-lightning', windGust: 27 },
              ],
              weekly: [],
            },
          },
        ],
      },
    });

    await act(async () => {
      root.render(<WeatherBar variant="card" />);
    });
    await flush();

    const expandButton = container.querySelector('button[aria-label="Expand weather details"]');
    expect(expandButton).toBeTruthy();

    await act(async () => {
      expandButton.click();
    });

    const hourlyLabels = Array.from(
      container.querySelectorAll('[data-testid="weather-card-expanded"] .grid.grid-cols-4 > div > p:first-child')
    ).map((node) => node.textContent);

    const expectedLabels = [14, 15, 16, 17, 18, 19, 20, 21]
      .map((hour) => new Date(2026, 2, 15, hour, 0, 0).toLocaleTimeString([], { hour: 'numeric' }));

    expect(hourlyLabels).toHaveLength(8);
    expect(hourlyLabels).toEqual(expectedLabels);
    expect(hourlyLabels).not.toContain(new Date(2026, 2, 15, 12, 0, 0).toLocaleTimeString([], { hour: 'numeric' }));
    expect(hourlyLabels).not.toContain(new Date(2026, 2, 15, 13, 0, 0).toLocaleTimeString([], { hour: 'numeric' }));
  });
});
