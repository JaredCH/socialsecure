import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('../utils/api', () => ({
  mapsAPI: {
    getPresence: jest.fn().mockResolvedValue({ data: { presence: { shareWithFriends: true } } }),
    getLocalMap: jest.fn().mockResolvedValue({ data: { spotlights: [] } }),
    getCommunityMap: jest.fn().mockResolvedValue({ data: { spotlights: [] } }),
    getHeatmap: jest.fn().mockResolvedValue({ data: { heatmap: [] } }),
    getFriendsLocations: jest.fn().mockResolvedValue({ data: { friends: [] } }),
    updatePresence: jest.fn().mockResolvedValue({ data: {} }),
    updatePrivacy: jest.fn().mockResolvedValue({ data: {} }),
    createSpotlight: jest.fn().mockResolvedValue({ data: {} }),
    reactToSpotlight: jest.fn().mockResolvedValue({ data: {} })
  }
}));

jest.mock('leaflet', () => ({
  map: jest.fn(),
  tileLayer: jest.fn(),
  marker: jest.fn(),
  circle: jest.fn(),
  divIcon: jest.fn(),
  Icon: {
    Default: {}
  }
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const {
  default: Maps,
  FRIENDS_REFRESH_INTERVAL_MS,
  LOCATION_PUBLISH_INTERVAL_MS,
  configureLeafletMarkerAssets,
  resolveLeafletModule,
  withDataFallback
} = require('./Maps');

describe('resolveLeafletModule', () => {
  it('uses default export when it contains Leaflet map API', () => {
    const defaultExport = { map: jest.fn() };
    const moduleShape = { default: defaultExport, map: undefined };

    expect(resolveLeafletModule(moduleShape)).toBe(defaultExport);
  });

  it('uses module object when map API is on the top-level export', () => {
    const moduleShape = { map: jest.fn() };

    expect(resolveLeafletModule(moduleShape)).toBe(moduleShape);
  });

  it('falls back to module object when default export has no map function', () => {
    const moduleShape = { default: { map: null }, map: jest.fn() };

    expect(resolveLeafletModule(moduleShape)).toBe(moduleShape);
  });

  it('throws when no valid map API exists on either export shape', () => {
    expect(() => resolveLeafletModule({ default: {} })).toThrow('Leaflet map API is unavailable');
  });
});

describe('withDataFallback', () => {
  it('returns request response when request succeeds', async () => {
    const response = { data: { spotlights: [{ _id: '1' }] } };

    await expect(withDataFallback(Promise.resolve(response), { spotlights: [] }))
      .resolves
      .toBe(response);
  });

  it('returns fallback response when request fails', async () => {
    await expect(withDataFallback(Promise.reject(new Error('boom')), { spotlights: [] }))
      .resolves
      .toEqual({ data: { spotlights: [] } });
  });
});

describe('configureLeafletMarkerAssets', () => {
  it('sets explicit marker icon URLs from bundled Leaflet assets', async () => {
    const mergeOptions = jest.fn();
    const leafletModule = { Icon: { Default: { mergeOptions } } };
    const assetLoader = jest.fn().mockResolvedValue([
      { default: '/assets/marker-icon-2x.png' },
      { default: '/assets/marker-icon.png' },
      { default: '/assets/marker-shadow.png' }
    ]);

    await configureLeafletMarkerAssets(leafletModule, assetLoader);

    expect(assetLoader).toHaveBeenCalledTimes(1);
    expect(mergeOptions).toHaveBeenCalledWith({
      iconRetinaUrl: '/assets/marker-icon-2x.png',
      iconUrl: '/assets/marker-icon.png',
      shadowUrl: '/assets/marker-shadow.png'
    });
  });

  it('does nothing when Leaflet icon defaults are unavailable', async () => {
    const assetLoader = jest.fn();

    await configureLeafletMarkerAssets({}, assetLoader);

    expect(assetLoader).not.toHaveBeenCalled();
  });
});

describe('map polling intervals', () => {
  it('publishes user location every 30 seconds', () => {
    expect(LOCATION_PUBLISH_INTERVAL_MS).toBe(30000);
  });

  it('refreshes friend locations every 10 seconds', () => {
    expect(FRIENDS_REFRESH_INTERVAL_MS).toBe(10000);
  });
});

describe('Maps mobile-first controls', () => {
  let container;
  let root;
  const originalGeolocation = navigator.geolocation;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: jest.fn()
      }
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation
    });
  });

  it('renders compact mobile overlay controls for layers and privacy', async () => {
    await act(async () => {
      root.render(<Maps />);
    });

    const layersControlButton = container.querySelector('button[aria-label="Open map layers controls"]');
    const privacyControlButton = container.querySelector('button[aria-label="Open map privacy controls"]');
    const updateLocationButton = container.querySelector('button[aria-label="Update map to your location"]');

    expect(layersControlButton).not.toBeNull();
    expect(privacyControlButton).not.toBeNull();
    expect(updateLocationButton).not.toBeNull();
  });
});
