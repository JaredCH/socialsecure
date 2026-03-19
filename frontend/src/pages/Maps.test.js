import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Maps, {
  areFriendsLocationsEquivalent,
  attachSafeTileRetry,
  FRIENDS_REFRESH_INTERVAL_MS,
  HEATMAP_CIRCLE_RADIUS_METERS,
  HEATMAP_VISIBILITY_RADIUS_METERS,
  LOCATION_PUBLISH_INTERVAL_MS,
  clearMapsClientCaches,
  configureLeafletMarkerAssets,
  createMapDataCacheKey,
  haversineDistance,
  isFriendLive,
  resolveMapHeatmapData,
  resolveLeafletModule,
  sortFriendsByStatusAndActivity,
  withDataFallback
} from './Maps';
import { mapsAPI } from '../utils/api';

jest.mock('../utils/api', () => ({
  mapsAPI: {
    getPresence: jest.fn().mockResolvedValue({ data: { presence: { shareWithFriends: true } } }),
    getLocalMap: jest.fn().mockResolvedValue({ data: { spotlights: [] } }),
    getCommunityMap: jest.fn().mockResolvedValue({ data: { spotlights: [] } }),
    getHeatmap: jest.fn().mockResolvedValue({ data: { heatmap: [] } }),
    getFriendsLocations: jest.fn().mockResolvedValue({ data: { friends: [] } }),
    getFavoriteLocations: jest.fn().mockResolvedValue({ data: { favorites: [] } }),
    updatePresence: jest.fn().mockResolvedValue({ data: {} }),
    updatePrivacy: jest.fn().mockResolvedValue({ data: {} }),
    createSpotlight: jest.fn().mockResolvedValue({ data: {} }),
    reactToSpotlight: jest.fn().mockResolvedValue({ data: {} }),
    createFavoriteLocation: jest.fn().mockResolvedValue({ data: { favorite: null } }),
    deleteFavoriteLocation: jest.fn().mockResolvedValue({ data: {} })
  }
}));

jest.mock('leaflet', () => {
  const mapInstance = {
    setView: jest.fn(),
    eachLayer: jest.fn(),
    removeLayer: jest.fn(),
    remove: jest.fn()
  };
  mapInstance.setView.mockImplementation(() => mapInstance);

  const tileLayerInstance = {
    addTo: jest.fn().mockReturnThis()
  };
  const markerInstance = {
    bindPopup: jest.fn().mockReturnThis(),
    addTo: jest.fn().mockReturnThis()
  };
  const circleInstance = {
    addTo: jest.fn().mockReturnThis()
  };

  const exported = {
    __esModule: true,
    __mapInstance: mapInstance,
    map: jest.fn(() => mapInstance),
    tileLayer: jest.fn(() => tileLayerInstance),
    marker: jest.fn(() => markerInstance),
    circle: jest.fn(() => circleInstance),
    divIcon: jest.fn((options) => options),
    Icon: {
      Default: {}
    }
  };
  exported.default = exported;
  return exported;
});

const leaflet = require('leaflet');

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

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

describe('resolveMapHeatmapData', () => {
  it('prefers the standalone heatmap response over the map endpoint heatmap', () => {
    const mapHeatmap = [{ lat: 30.2672, lng: -97.7431, intensity: 0.9, userCount: 4 }];
    const fallbackHeatmap = [{ lat: 40.7128, lng: -74.006, intensity: 0.2, userCount: 1 }];

    expect(resolveMapHeatmapData({ heatmap: mapHeatmap }, { heatmap: fallbackHeatmap })).toBe(fallbackHeatmap);
  });

  it('falls back to the map endpoint heatmap when the standalone response has no heatmap', () => {
    const mapHeatmap = [{ lat: 40.7128, lng: -74.006, intensity: 0.2, userCount: 1 }];

    expect(resolveMapHeatmapData({ heatmap: mapHeatmap }, {})).toBe(mapHeatmap);
  });
});

describe('createMapDataCacheKey', () => {
  it('rounds nearby coordinates into a bounded cache key', () => {
    expect(createMapDataCacheKey({
      lat: 30.26721,
      lng: -97.74306,
      viewMode: 'local',
      includeHeatmap: true
    })).toBe('local:30.27:-97.74:heatmap');
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

  it('refreshes friend locations every 5 seconds', () => {
    expect(FRIENDS_REFRESH_INTERVAL_MS).toBe(5000);
  });

  it('renders heatmap circles at a 200 foot diameter (100 foot radius)', () => {
    expect(HEATMAP_CIRCLE_RADIUS_METERS).toBeCloseTo(30.48, 2);
  });

  it('limits heatmap visibility to a 2000 foot radius', () => {
    expect(HEATMAP_VISIBILITY_RADIUS_METERS).toBeCloseTo(609.6, 1);
  });
});

describe('areFriendsLocationsEquivalent', () => {
  it('returns true when friend location payloads are equivalent', () => {
    const left = [{
      user: { _id: 'u1', username: 'alice' },
      lat: 30.2672,
      lng: -97.7431,
      isLive: true,
      locationName: 'Downtown',
      city: 'Austin',
      state: 'TX',
      country: 'US',
      liveAgeSeconds: 2,
      lastActivityAt: '2026-03-19T10:00:00.000Z'
    }];
    const right = [{
      user: { _id: 'u1', username: 'alice' },
      lat: 30.2672,
      lng: -97.7431,
      isLive: true,
      locationName: 'Downtown',
      city: 'Austin',
      state: 'TX',
      country: 'US',
      liveAgeSeconds: 2,
      lastActivityAt: '2026-03-19T10:00:00.000Z'
    }];

    expect(areFriendsLocationsEquivalent(left, right)).toBe(true);
  });

  it('returns false when any friend status or location field differs', () => {
    const left = [{
      user: { _id: 'u1', username: 'alice' },
      lat: 30.2672,
      lng: -97.7431,
      isLive: true,
      lastActivityAt: '2026-03-19T10:00:00.000Z'
    }];
    const right = [{
      user: { _id: 'u1', username: 'alice' },
      lat: 30.2672,
      lng: -97.7431,
      isLive: false,
      lastActivityAt: '2026-03-19T10:00:00.000Z'
    }];

    expect(areFriendsLocationsEquivalent(left, right)).toBe(false);
  });
});

describe('attachSafeTileRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries failed tile loads with bounded attempts and cleanup', () => {
    const listeners = new Map();
    const tileLayer = {
      on: jest.fn((eventName, handler) => {
        listeners.set(eventName, handler);
      }),
      off: jest.fn((eventName, handler) => {
        if (listeners.get(eventName) === handler) {
          listeners.delete(eventName);
        }
      }),
      getTileUrl: jest.fn(() => 'https://a.tile.openstreetmap.org/1/2/3.png')
    };
    const tile = { src: '', isConnected: true };
    const coords = { x: 2, y: 3, z: 1 };

    const detachRetryHandlers = attachSafeTileRetry(tileLayer);
    expect(typeof detachRetryHandlers).toBe('function');

    listeners.get('tileerror')({ tile, coords });
    jest.advanceTimersByTime(800);
    expect(tile.src).toContain('retry=1');

    listeners.get('tileerror')({ tile, coords });
    jest.advanceTimersByTime(1600);
    expect(tile.src).toContain('retry=2');

    listeners.get('tileerror')({ tile, coords });
    jest.advanceTimersByTime(5000);
    expect(tile.src).toContain('retry=2');

    detachRetryHandlers();
    expect(tileLayer.off).toHaveBeenCalled();
  });
});

describe('haversineDistance', () => {
  it('returns zero for identical points', () => {
    expect(haversineDistance(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
  });

  it('computes roughly correct distance between two known points', () => {
    // Approx 1.1 km between these two NYC points
    const distance = haversineDistance(40.7128, -74.006, 40.7228, -74.006);
    expect(distance).toBeGreaterThan(1000);
    expect(distance).toBeLessThan(1200);
  });
});

describe('sortFriendsByStatusAndActivity', () => {
  it('groups online friends first and sorts each group by most recent activity', () => {
    const sorted = sortFriendsByStatusAndActivity([
      { user: { username: 'older-online' }, isLive: true, lastActivityAt: '2026-03-16T19:20:00.000Z' },
      { user: { username: 'newest-offline' }, isLive: false, lastActivityAt: '2026-03-16T19:29:00.000Z' },
      { user: { username: 'newest-online' }, isLive: true, lastActivityAt: '2026-03-16T19:30:00.000Z' },
      { user: { username: 'older-offline' }, isLive: false, lastActivityAt: '2026-03-16T19:10:00.000Z' }
    ]);

    expect(sorted.map((friend) => friend.user.username)).toEqual([
      'newest-online',
      'older-online',
      'newest-offline',
      'older-offline'
    ]);
  });

  it('treats recent active friends as live when isLive is missing', () => {
    const now = new Date('2026-03-19T17:53:16.000Z').getTime();
    const sorted = sortFriendsByStatusAndActivity([
      { user: { username: 'offline' }, isActive: false, lastActivityAt: '2026-03-19T17:53:00.000Z' },
      { user: { username: 'online' }, isActive: true, lastActivityAt: '2026-03-19T17:53:05.000Z' }
    ]);

    expect(isFriendLive(sorted[0], now)).toBe(true);
    expect(sorted[0].user.username).toBe('online');
    expect(isFriendLive(sorted[1], now)).toBe(false);
  });
});

describe('Maps mobile-first controls', () => {
  let container;
  let root;
  const originalGeolocation = navigator.geolocation;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearMapsClientCaches();
    mapsAPI.getPresence.mockResolvedValue({ data: { presence: { shareWithFriends: true } } });
    mapsAPI.getLocalMap.mockResolvedValue({ data: { spotlights: [] } });
    mapsAPI.getCommunityMap.mockResolvedValue({ data: { spotlights: [] } });
    mapsAPI.getHeatmap.mockResolvedValue({ data: { heatmap: [] } });
    mapsAPI.getFriendsLocations.mockResolvedValue({ data: { friends: [] } });
    mapsAPI.getFavoriteLocations.mockResolvedValue({ data: { favorites: [] } });
    mapsAPI.createFavoriteLocation.mockResolvedValue({
      data: {
        favorite: {
          _id: 'favorite-1',
          address: '123 Main St, Austin, TX',
          lat: 30.2672,
          lng: -97.7431,
          sourceType: 'address'
        }
      }
    });

    leaflet.__mapInstance.setView.mockClear();
    leaflet.__mapInstance.eachLayer.mockImplementation(() => {});
    leaflet.__mapInstance.removeLayer.mockClear();
    leaflet.__mapInstance.remove.mockClear();
    leaflet.map.mockClear();
    leaflet.tileLayer.mockClear();
    leaflet.marker.mockClear();
    leaflet.circle.mockClear();
    leaflet.divIcon.mockClear();

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

  afterAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  it('renders compact mobile overlay controls for layers, privacy, favorites, and location', async () => {
    await act(async () => {
      root.render(<Maps />);
    });
    await flushPromises();

    const layersControlButton = container.querySelector('button[aria-label="Open map layers controls"]');
    const privacyControlButton = container.querySelector('button[aria-label="Open map privacy controls"]');
    const updateLocationButton = container.querySelector('button[aria-label="Update map to your location"]');
    const favoritesButton = container.querySelector('button[aria-label="Open favorite locations"]');

    expect(layersControlButton).not.toBeNull();
    expect(privacyControlButton).not.toBeNull();
    expect(updateLocationButton).not.toBeNull();
    expect(favoritesButton).not.toBeNull();
  });

  it('saves a favorite location from a typed address', async () => {
    await act(async () => {
      root.render(<Maps />);
    });
    await flushPromises();

    const favoritesButton = container.querySelector('button[aria-label="Open favorite locations"]');

    act(() => {
      favoritesButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    const addressInput = container.querySelector('input[aria-label="Favorite address"]');
    const modalForm = Array.from(container.querySelectorAll('form'))
      .find((form) => form.textContent.includes('Use Current Location'));
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

    act(() => {
      valueSetter.call(addressInput, '123 Main St, Austin, TX');
      addressInput.dispatchEvent(new Event('input', { bubbles: true }));
      addressInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      modalForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushPromises();

    expect(mapsAPI.createFavoriteLocation).toHaveBeenCalledWith({
      address: '123 Main St, Austin, TX'
    });
  });

  it('renders the favorites modal above map controls when opened', async () => {
    await act(async () => {
      root.render(<Maps />);
    });
    await flushPromises();

    const favoritesButton = container.querySelector('button[aria-label="Open favorite locations"]');

    act(() => {
      favoritesButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    const favoritesModal = container.querySelector('[role="dialog"][aria-label="Save Favorite"]');

    expect(favoritesModal).not.toBeNull();
    expect(favoritesModal.className).toContain('z-[700]');
  });

  it('reuses cached map data between maps page mounts', async () => {
    leaflet.map.mockImplementation(() => leaflet.__mapInstance);
    leaflet.__mapInstance.setView.mockImplementation(() => leaflet.__mapInstance);
    leaflet.tileLayer.mockImplementation(() => ({
      addTo: jest.fn().mockReturnThis()
    }));
    leaflet.marker.mockImplementation(() => ({
      bindPopup: jest.fn().mockReturnThis(),
      addTo: jest.fn().mockReturnThis()
    }));
    leaflet.circle.mockImplementation(() => ({
      addTo: jest.fn().mockReturnThis()
    }));
    navigator.geolocation.getCurrentPosition.mockImplementation((success) => {
      success({ coords: { latitude: 30.2672, longitude: -97.7431 } });
    });

    mapsAPI.getLocalMap.mockResolvedValue({
      data: {
        spotlights: [{ _id: 'spotlight-1', locationName: 'Coffee Shop', lat: 30.2672, lng: -97.7431 }]
      }
    });
    mapsAPI.getHeatmap.mockResolvedValue({
      data: {
        heatmap: [{ lat: 30.2672, lng: -97.7431, intensity: 0.5, userCount: 3 }]
      }
    });

    await act(async () => {
      root.render(<Maps />);
    });
    await flushPromises();
    await flushPromises();

    expect(mapsAPI.getLocalMap).toHaveBeenCalledTimes(1);
    expect(mapsAPI.getHeatmap).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });

    root = createRoot(container);

    await act(async () => {
      root.render(<Maps />);
    });
    await flushPromises();
    await flushPromises();

    expect(mapsAPI.getLocalMap).toHaveBeenCalledTimes(1);
    expect(mapsAPI.getHeatmap).toHaveBeenCalledTimes(1);
  });

  it('refreshes favorites when the save response omits the created favorite payload', async () => {
    mapsAPI.createFavoriteLocation.mockResolvedValueOnce({ data: { favorite: null } });
    mapsAPI.getFavoriteLocations
      .mockResolvedValueOnce({ data: { favorites: [] } })
      .mockResolvedValueOnce({
        data: {
          favorites: [{
            _id: 'favorite-2',
            address: '500 W 2nd St, Austin, TX',
            lat: 30.2654,
            lng: -97.7483,
            sourceType: 'address'
          }]
        }
      });

    await act(async () => {
      root.render(<Maps />);
    });
    await flushPromises();

    const favoritesButton = container.querySelector('button[aria-label="Open favorite locations"]');

    act(() => {
      favoritesButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    const addressInput = container.querySelector('input[aria-label="Favorite address"]');
    const modalForm = Array.from(container.querySelectorAll('form'))
      .find((form) => form.textContent.includes('Use Current Location'));
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

    act(() => {
      valueSetter.call(addressInput, '500 W 2nd St, Austin, TX');
      addressInput.dispatchEvent(new Event('input', { bubbles: true }));
      addressInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      modalForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushPromises();

    expect(mapsAPI.createFavoriteLocation).toHaveBeenCalledWith({
      address: '500 W 2nd St, Austin, TX'
    });
    expect(mapsAPI.getFavoriteLocations).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('500 W 2nd St, Austin, TX');
  });
});
