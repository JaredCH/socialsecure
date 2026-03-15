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
});