import React, { useState, useEffect, useMemo, useRef } from 'react';
import { mapsAPI } from '../utils/api';

// Category icons
const CATEGORY_ICONS = {
  food: '🍔',
  drink: '🍺',
  entertainment: '🎭',
  shopping: '🛍️',
  service: '🔧',
  outdoor: '🌲',
  other: '📍'
};

// State icons
const STATE_ICONS = {
  friends_only: '👥',
  trending: '🔥',
  public_glow: '✨'
};
const GEOLOCATION_OPTIONS_TIMEOUT_MS = 8000;
const GEOLOCATION_OPTIONS_MAX_AGE_MS = 60000;
export const HEATMAP_CIRCLE_RADIUS_METERS = 100 * 0.3048;
export const HEATMAP_VISIBILITY_RADIUS_METERS = 2000 * 0.3048;
export const LOCATION_PUBLISH_INTERVAL_MS = 30 * 1000;
export const FRIENDS_REFRESH_INTERVAL_MS = 10 * 1000;
const MAP_REFRESH_INTERVAL_MS = 60 * 1000;
const MAP_DATA_CACHE_TTL_MS = 90 * 1000;
const MAP_DATA_CACHE_MAX_ENTRIES = 6;
const MAP_DATA_CACHE_COORDINATE_PRECISION = 2;
const FAVORITES_CACHE_TTL_MS = 5 * 60 * 1000;
const HEATMAP_FILL_OPACITY = 0.25;
const MAP_FRIEND_FOCUS_ZOOM_LEVEL = 15;
const MAP_SELF_FOCUS_ZOOM_LEVEL = 14;
const createFallbackResponse = (data) => ({ data });
const mapDataCache = new Map();
let favoriteLocationsCacheEntry = null;

export const withDataFallback = (request, fallbackData) =>
  request.catch(() => createFallbackResponse(fallbackData));

export const resolveMapHeatmapData = (mapData, heatmapData) =>
  heatmapData?.heatmap || mapData?.heatmap || [];

const EARTH_RADIUS_METERS = 6378137;

/**
 * Haversine distance in meters between two [lat, lng] positions.
 */
export const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const resolveLeafletModule = (leafletModule) => {
  const resolvedModule = leafletModule?.default && typeof leafletModule.default.map === 'function'
    ? leafletModule.default
    : leafletModule;

  if (typeof resolvedModule?.map !== 'function') {
    throw new Error('Leaflet map API is unavailable');
  }

  return resolvedModule;
};

const getFriendActivityTimestamp = (friend) => {
  const timestamp = friend?.lastActivityAt ? new Date(friend.lastActivityAt).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const sortFriendsByStatusAndActivity = (friends = []) => (
  [...friends].sort((left, right) => {
    if (Boolean(left?.isLive) !== Boolean(right?.isLive)) {
      return left?.isLive ? -1 : 1;
    }

    return getFriendActivityTimestamp(right) - getFriendActivityTimestamp(left);
  })
);

const pruneCacheEntries = (cache, maxEntries) => {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === 'undefined') break;
    cache.delete(oldestKey);
  }
};

const getCachedValue = (cache, key, maxAgeMs) => {
  const entry = cache.get(key);
  if (!entry) return null;

  if ((Date.now() - entry.cachedAt) > maxAgeMs) {
    cache.delete(key);
    return null;
  }

  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
};

const setCachedValue = (cache, key, value, maxEntries) => {
  cache.delete(key);
  cache.set(key, {
    value,
    cachedAt: Date.now()
  });
  pruneCacheEntries(cache, maxEntries);
};

const roundMapCacheCoordinate = (value) => Number(value).toFixed(MAP_DATA_CACHE_COORDINATE_PRECISION);

export const createMapDataCacheKey = ({ lat, lng, viewMode, includeHeatmap }) => (
  [
    viewMode,
    roundMapCacheCoordinate(lat),
    roundMapCacheCoordinate(lng),
    includeHeatmap ? 'heatmap' : 'markers'
  ].join(':')
);

export const clearMapsClientCaches = () => {
  mapDataCache.clear();
  favoriteLocationsCacheEntry = null;
};

const getFriendDisplayLocation = (friend) =>
  friend?.locationName
  || friend?.city
  || [friend?.state, friend?.country].filter(Boolean).join(', ')
  || 'Location unavailable';

const formatFriendStatus = (friend) => {
  if (friend?.liveAgeSeconds != null) {
    return `${friend.isLive ? 'Live' : 'Last seen'} • ${friend.liveAgeSeconds}s ago`;
  }

  return friend?.isLive ? 'Live now' : 'Offline';
};

const getFriendMarkerLabel = (friend) =>
  (friend?.user?.username?.[0] || friend?.user?.realName?.[0] || '•')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '•');

const defaultLeafletAssetLoader = () => Promise.all([
  import('leaflet/dist/images/marker-icon-2x.png'),
  import('leaflet/dist/images/marker-icon.png'),
  import('leaflet/dist/images/marker-shadow.png')
]);
const resolveLeafletAssetUrl = (assetModule) => assetModule?.default || assetModule;

export const configureLeafletMarkerAssets = async (
  leafletModule,
  assetLoader = defaultLeafletAssetLoader
) => {
  if (typeof leafletModule?.Icon?.Default?.mergeOptions !== 'function') {
    return;
  }

  const [iconRetina, icon, shadow] = await assetLoader();

  leafletModule.Icon.Default.mergeOptions({
    iconRetinaUrl: resolveLeafletAssetUrl(iconRetina),
    iconUrl: resolveLeafletAssetUrl(icon),
    shadowUrl: resolveLeafletAssetUrl(shadow)
  });
};

function Maps() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const leafletRef = useRef(null);
  const mobileControlsRef = useRef(null);
  const mobileLayersButtonRef = useRef(null);
  const mobilePrivacyButtonRef = useRef(null);
  const mobileLayersFirstInputRef = useRef(null);
  const mobilePrivacyToggleRef = useRef(null);
  const [map, setMap] = useState(null);
  const [mapInitAttempt, setMapInitAttempt] = useState(0);
  const [viewMode, setViewMode] = useState('local'); // local, community
  const [layers, setLayers] = useState({
    friends: true,
    spotlights: true,
    heatmap: true
  });
  
  // Data states
  const [friendsLocations, setFriendsLocations] = useState([]);
  const [spotlights, setSpotlights] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [favoriteLocations, setFavoriteLocations] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [privacySettings, setPrivacySettings] = useState({ shareWithFriends: true });
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateSpotlight, setShowCreateSpotlight] = useState(false);
  const [creatingSpotlight, setCreatingSpotlight] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [mobileLayersMenuOpen, setMobileLayersMenuOpen] = useState(false);
  const [mobilePrivacyMenuOpen, setMobilePrivacyMenuOpen] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [favoriteError, setFavoriteError] = useState(null);
  const [lastMapRefreshAt, setLastMapRefreshAt] = useState(null);
  const [lastFriendsRefreshAt, setLastFriendsRefreshAt] = useState(null);
  const [spotlightForm, setSpotlightForm] = useState({
    locationName: '',
    description: '',
    category: 'other'
  });
  const [favoriteForm, setFavoriteForm] = useState({
    address: ''
  });

  const sortedFriends = useMemo(
    () => sortFriendsByStatusAndActivity(friendsLocations),
    [friendsLocations]
  );
  const onlineFriends = useMemo(
    () => sortedFriends.filter((friend) => friend.isLive),
    [sortedFriends]
  );
  const offlineFriends = useMemo(
    () => sortedFriends.filter((friend) => !friend.isLive),
    [sortedFriends]
  );

  // Initialize map
  useEffect(() => {
    let cancelled = false;
    let initTimeoutId = null;

    const initMap = async () => {
      if (typeof window === 'undefined' || mapInstanceRef.current) return;
      setLoading(true);
      setError(null);

      if (!mapRef.current) {
        setError('Map failed to initialize. Please try again.');
        setLoading(false);
        return;
      }

      initTimeoutId = window.setTimeout(() => {
        if (!cancelled && !mapInstanceRef.current) {
          setError('Map is taking too long to load. Please try again.');
          setLoading(false);
        }
      }, 10000);

      try {
        const leafletModule = await import('leaflet');
        const L = resolveLeafletModule(leafletModule);
        await import('leaflet/dist/leaflet.css');
        if (cancelled) return;

        leafletRef.current = L;
        await configureLeafletMarkerAssets(L);

        const createMap = (center, zoom) => {
          if (!mapRef.current || cancelled) return;

          const mapInstance = L.map(mapRef.current).setView(center, zoom);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(mapInstance);

          mapInstanceRef.current = mapInstance;
          setMap(mapInstance);
          setUserLocation(center);
          setLoading(false);
          if (initTimeoutId) {
            clearTimeout(initTimeoutId);
          }
        };

        // Get user location
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (cancelled || mapInstanceRef.current) return;
              const { latitude, longitude } = position.coords;
              createMap([latitude, longitude], 12);
            },
            () => {
              if (cancelled || mapInstanceRef.current) return;
              // Default to center of US if geolocation fails
              createMap([39.8283, -98.5795], 4);
            },
            { timeout: GEOLOCATION_OPTIONS_TIMEOUT_MS, maximumAge: GEOLOCATION_OPTIONS_MAX_AGE_MS }
          );
        } else {
          createMap([39.8283, -98.5795], 4);
        }
      } catch (err) {
        console.error('Error initializing map:', err);
        if (!cancelled) {
          setError('Failed to initialize map. Please try again.');
          setLoading(false);
        }
      }
    };

    initMap();
    fetchUserPresence();
    fetchFavoriteLocations();
    return () => {
      cancelled = true;
      if (initTimeoutId) {
        clearTimeout(initTimeoutId);
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }
      mapInstanceRef.current = null;
    };
  }, [mapInitAttempt]);

  useEffect(() => {
    if (!userLocation) return;
    fetchMapData();
    if (!layers.friends) {
      setFriendsLocations([]);
    }
  }, [userLocation, viewMode, layers.friends]);

  useEffect(() => {
    if (!userLocation) return undefined;

    const intervalId = window.setInterval(() => {
      fetchMapData({ showLoading: false });
    }, MAP_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [userLocation, viewMode]);

  useEffect(() => {
    if (!userLocation || !layers.friends) return undefined;
    fetchFriendsLocations();

    const intervalId = window.setInterval(() => {
      fetchFriendsLocations();
    }, FRIENDS_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [userLocation, layers.friends]);

  // Fetch map data based on view mode
  const fetchMapData = async ({ showLoading = true, forceRefresh = false } = {}) => {
    if (!userLocation) return;
    
    try {
      if (showLoading) {
        setLoading(true);
      }
      const [lat, lng] = userLocation;
      const cacheKey = createMapDataCacheKey({
        lat,
        lng,
        viewMode,
        includeHeatmap: true
      });

      if (!forceRefresh) {
        const cachedMapData = getCachedValue(mapDataCache, cacheKey, MAP_DATA_CACHE_TTL_MS);
        if (cachedMapData) {
          setSpotlights(cachedMapData.spotlights);
          setHeatmapData(cachedMapData.heatmap);
          setLastMapRefreshAt(new Date(cachedMapData.fetchedAt));
          setError(null);
          if (showLoading) {
            setLoading(false);
          }
          return;
        }
      }
      
      // Fetch map data
      const mapEndpoint = viewMode === 'local' ? 'getLocalMap' : 'getCommunityMap';
      const [mapRes, heatmapRes] = await Promise.all([
        withDataFallback(
          mapsAPI[mapEndpoint]({ lat, lng, radius: viewMode === 'local' ? 50000 : 200000 }),
          { spotlights: [], heatmap: [] }
        ),
        withDataFallback(
          mapsAPI.getHeatmap({ lat, lng }),
          { heatmap: [] }
        )
      ]);
      
      const nextMapData = {
        spotlights: mapRes.data.spotlights || [],
        heatmap: resolveMapHeatmapData(mapRes.data, heatmapRes.data),
        fetchedAt: Date.now()
      };

      setCachedValue(mapDataCache, cacheKey, nextMapData, MAP_DATA_CACHE_MAX_ENTRIES);
      setSpotlights(nextMapData.spotlights);
      setHeatmapData(nextMapData.heatmap);
      setLastMapRefreshAt(new Date(nextMapData.fetchedAt));
      setError(null);
    } catch (err) {
      console.error('Error fetching map data:', err);
      setError('Failed to load map data');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const fetchFriendsLocations = async () => {
    if (!layers.friends) {
      setFriendsLocations([]);
      return;
    }

    try {
      const friendsRes = await withDataFallback(mapsAPI.getFriendsLocations(), { friends: [] });
      setFriendsLocations(friendsRes.data.friends || []);
      setLastFriendsRefreshAt(new Date());
    } catch (err) {
      console.error('Error fetching friend locations:', err);
    }
  };

  const fetchFavoriteLocations = async ({ forceRefresh = false } = {}) => {
    try {
      if (!forceRefresh && favoriteLocationsCacheEntry) {
        const isFavoriteCacheFresh = (Date.now() - favoriteLocationsCacheEntry.cachedAt) <= FAVORITES_CACHE_TTL_MS;
        if (isFavoriteCacheFresh) {
          setFavoriteLocations(favoriteLocationsCacheEntry.favorites);
          return;
        }
        favoriteLocationsCacheEntry = null;
      }

      const favoritesRes = await withDataFallback(mapsAPI.getFavoriteLocations(), { favorites: [] });
      const nextFavorites = favoritesRes.data.favorites || [];
      favoriteLocationsCacheEntry = {
        favorites: nextFavorites,
        cachedAt: Date.now()
      };
      setFavoriteLocations(nextFavorites);
    } catch (err) {
      console.error('Error fetching favorite locations:', err);
    }
  };

  // Fetch user presence
  const fetchUserPresence = async () => {
    try {
      const res = await mapsAPI.getPresence();
      if (res?.data?.presence) {
        setPrivacySettings({ shareWithFriends: res.data.presence.shareWithFriends });
      }
    } catch (err) {
      console.error('Error fetching presence:', err);
    }
  };

  // Update user location
  const publishCurrentLocation = ({ recenterMap = false } = {}) => {
    if (!navigator.geolocation) return;
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          await mapsAPI.updatePresence({
            latitude,
            longitude,
            precisionLevel: 5,
            deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
          });

          const nextLocation = [latitude, longitude];
          setUserLocation(nextLocation);
          if (recenterMap && map) {
            map.setView([latitude, longitude], 12);
          }
          
          if (recenterMap) {
            fetchMapData({ showLoading: true, forceRefresh: true });
          }
        } catch (err) {
          console.error('Error updating presence:', err);
        }
      },
      (err) => console.error('Geolocation error:', err),
      {
        enableHighAccuracy: false,
        timeout: GEOLOCATION_OPTIONS_TIMEOUT_MS,
        maximumAge: GEOLOCATION_OPTIONS_MAX_AGE_MS
      }
    );
  };

  useEffect(() => {
    if (!userLocation) return undefined;
    const intervalId = window.setInterval(() => {
      publishCurrentLocation();
    }, LOCATION_PUBLISH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [userLocation]);

  const focusCurrentLocation = () => {
    if (map && userLocation) {
      map.setView(userLocation, MAP_SELF_FOCUS_ZOOM_LEVEL);
    }
    publishCurrentLocation({ recenterMap: true });
  };

  // Toggle layer visibility
  const toggleLayer = (layer) => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Update privacy settings
  const updatePrivacy = async (shareWithFriends) => {
    try {
      await mapsAPI.updatePrivacy(shareWithFriends);
      setPrivacySettings({ shareWithFriends });
    } catch (err) {
      console.error('Error updating privacy:', err);
    }
  };

  // Create spotlight
  const handleCreateSpotlight = async (e) => {
    e.preventDefault();
    if (!userLocation || !spotlightForm.locationName) return;
    
    setCreatingSpotlight(true);
    
    try {
      const [lat, lng] = userLocation;
      await mapsAPI.createSpotlight({
        latitude: lat,
        longitude: lng,
        ...spotlightForm
      });
      
      mapDataCache.clear();
      setShowCreateSpotlight(false);
      setSpotlightForm({ locationName: '', description: '', category: 'other' });
      fetchMapData({ forceRefresh: true });
    } catch (err) {
      console.error('Error creating spotlight:', err);
      setError(err.response?.data?.error || 'Failed to create spotlight');
    } finally {
      setCreatingSpotlight(false);
    }
  };

  // React to spotlight
  const handleReact = async (spotlightId, reactionType) => {
    try {
      await mapsAPI.reactToSpotlight(spotlightId, reactionType);
      mapDataCache.clear();
      fetchMapData({ forceRefresh: true });
    } catch (err) {
      console.error('Error reacting to spotlight:', err);
    }
  };

  const saveFavoriteLocation = async (payload) => {
    setSavingFavorite(true);
    setFavoriteError(null);

    try {
      const res = await mapsAPI.createFavoriteLocation(payload);
      const nextFavorite = res?.data?.favorite;
      favoriteLocationsCacheEntry = null;
      if (nextFavorite) {
        setFavoriteLocations((prev) => [nextFavorite, ...prev]);
      } else {
        await fetchFavoriteLocations({ forceRefresh: true });
      }
      setFavoriteForm({ address: '' });
      setShowFavoritesModal(false);
    } catch (err) {
      setFavoriteError(err.response?.data?.error || 'Failed to save favorite location');
    } finally {
      setSavingFavorite(false);
    }
  };

  const handleCreateFavorite = async (event) => {
    event.preventDefault();
    const address = favoriteForm.address.trim();
    if (!address) {
      setFavoriteError('Enter an address or use your current location.');
      return;
    }

    await saveFavoriteLocation({ address });
  };

  const handleFavoriteCurrentLocation = () => {
    if (!navigator.geolocation) {
      setFavoriteError('Geolocation is not available on this device.');
      return;
    }

    setFavoriteError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await saveFavoriteLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () => {
        setFavoriteError('Unable to detect your current location.');
      },
      {
        enableHighAccuracy: false,
        timeout: GEOLOCATION_OPTIONS_TIMEOUT_MS,
        maximumAge: GEOLOCATION_OPTIONS_MAX_AGE_MS
      }
    );
  };

  const handleDeleteFavorite = async (favoriteId) => {
    try {
      await mapsAPI.deleteFavoriteLocation(favoriteId);
      favoriteLocationsCacheEntry = null;
      setFavoriteLocations((prev) => prev.filter((favorite) => favorite._id !== favoriteId));
    } catch (err) {
      setFavoriteError(err.response?.data?.error || 'Failed to remove favorite location');
    }
  };

  // Render markers on map
  useEffect(() => {
    const L = leafletRef.current;
    if (!map || !L) return;
    
    // Clear existing non-tile layers
    map.eachLayer((layer) => {
      if (layer._url && layer._url.includes('tile')) return; // Keep tile layer
      map.removeLayer(layer);
    });
    
    // Add user's own location pin
    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'user-marker',
        html: `<div style="background:#3b82f6;width:28px;height:28px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(59,130,246,0.5);">📍</div>`,
        iconSize: [28, 28]
      });
      
      L.marker(userLocation, { icon: userIcon, zIndexOffset: 1000 })
        .bindPopup('<b>You are here</b>')
        .addTo(map);
    }
    
    // Add friends markers
    if (layers.friends && friendsLocations.length > 0) {
      friendsLocations.forEach(friend => {
        if (friend.lat != null && friend.lng != null) {
          const markerColor = friend.isLive ? '#10b981' : '#9ca3af';
          const markerLabel = getFriendMarkerLabel(friend);
          const icon = L.divIcon({
            className: 'friend-marker',
            html: `<div style="background:${markerColor};color:white;width:24px;height:24px;border-radius:999px;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(15,23,42,0.2);">${markerLabel}</div>`,
            iconSize: [24, 24]
          });
          
          L.marker([friend.lat, friend.lng], { icon, zIndexOffset: friend.isLive ? 800 : 600 })
            .bindPopup(`<b>${friend.user?.username || 'Friend'}</b><br/>${getFriendDisplayLocation(friend)}<br/>${friend.isLive ? 'Live now' : 'Offline'}`)
            .addTo(map);
        }
      });
    }

    favoriteLocations.forEach((favorite) => {
      if (favorite.lat == null || favorite.lng == null) return;

      const icon = L.divIcon({
        className: 'favorite-marker',
        html: '<div style="background:#f59e0b;color:white;width:26px;height:26px;border-radius:999px;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(245,158,11,0.45);">★</div>',
        iconSize: [26, 26]
      });

      L.marker([favorite.lat, favorite.lng], { icon, zIndexOffset: 750 })
        .bindPopup(`<b>Favorite</b><br/>${favorite.address}`)
        .addTo(map);
    });
    
    // Add spotlight markers
    if (layers.spotlights && spotlights.length > 0) {
      spotlights.forEach(spotlight => {
        if (spotlight.lat != null && spotlight.lng != null) {
          const stateIcon = STATE_ICONS[spotlight.state] || '📍';
          const categoryIcon = CATEGORY_ICONS[spotlight.category] || '📍';
          
          const icon = L.divIcon({
            className: 'spotlight-marker',
            html: `<div style="background:#f59e0b;width:32px;height:32px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${stateIcon}</div>`,
            iconSize: [32, 32]
          });
          
          L.marker([spotlight.lat, spotlight.lng], { icon })
            .bindPopup(`
              <b>${spotlight.locationName}</b><br/>
              ${spotlight.description || ''}<br/>
              ${categoryIcon} ${spotlight.category}<br/>
              ❤️ ${spotlight.reactions?.heart || 0} 🔥 ${spotlight.reactions?.fire || 0} 😎 ${spotlight.reactions?.cool || 0}
            `)
            .addTo(map);
        }
      });
    }
    
    // Render heatmap overlay – one partially transparent red circle per user
    if (heatmapData.length > 0 && userLocation) {
      const [uLat, uLng] = userLocation;
      heatmapData.forEach(point => {
        if (point.lat == null || point.lng == null) return;
        // Client-side 2000 ft radius guard (defense in depth)
        if (haversineDistance(uLat, uLng, point.lat, point.lng) > HEATMAP_VISIBILITY_RADIUS_METERS) return;

        L.circle([point.lat, point.lng], {
          radius: HEATMAP_CIRCLE_RADIUS_METERS,
          color: 'transparent',
          fillColor: '#ef4444',
          fillOpacity: HEATMAP_FILL_OPACITY,
          interactive: false
        }).addTo(map);
      });
    }
    
  }, [map, userLocation, friendsLocations, favoriteLocations, spotlights, heatmapData, layers]);

  const retryMapInitialization = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    setMap(null);
    setError(null);
    setLoading(true);
    setMapInitAttempt((attempt) => attempt + 1);
  };

  const flyToFriend = (friend) => {
    if (!map || friend.lat == null || friend.lng == null) return;
    map.setView([friend.lat, friend.lng], MAP_FRIEND_FOCUS_ZOOM_LEVEL);
  };

  const flyToFavorite = (favorite) => {
    if (!map || favorite.lat == null || favorite.lng == null) return;
    map.setView([favorite.lat, favorite.lng], MAP_FRIEND_FOCUS_ZOOM_LEVEL);
  };

  useEffect(() => {
    if (mobileLayersMenuOpen && mobileLayersFirstInputRef.current) {
      mobileLayersFirstInputRef.current.focus();
    }
  }, [mobileLayersMenuOpen]);

  useEffect(() => {
    if (mobilePrivacyMenuOpen && mobilePrivacyToggleRef.current) {
      mobilePrivacyToggleRef.current.focus();
    }
  }, [mobilePrivacyMenuOpen]);

  useEffect(() => {
    if (!mobileLayersMenuOpen && !mobilePrivacyMenuOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      const shouldReturnToLayers = mobileLayersMenuOpen;
      setMobileLayersMenuOpen(false);
      setMobilePrivacyMenuOpen(false);
      if (shouldReturnToLayers && mobileLayersButtonRef.current) {
        mobileLayersButtonRef.current.focus();
      } else if (mobilePrivacyButtonRef.current) {
        mobilePrivacyButtonRef.current.focus();
      }
    };

    const handlePointerDown = (event) => {
      if (mobileControlsRef.current?.contains(event.target)) return;
      setMobileLayersMenuOpen(false);
      setMobilePrivacyMenuOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [mobileLayersMenuOpen, mobilePrivacyMenuOpen]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="hidden shrink-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white px-4 py-3 lg:flex lg:items-center lg:justify-between">
        <h1 className="text-xl font-bold">🗺️ Maps</h1>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={focusCurrentLocation}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            📍 My Location
          </button>
          <button
            onClick={() => {
              setFavoriteError(null);
              setShowFavoritesModal(true);
            }}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            + Favorites
          </button>
          <button
            onClick={() => setShowCreateSpotlight(true)}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            ✨ Create Spotlight
          </button>
        </div>
      </div>

      {/* Responsive body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar – Controls & Filters */}
        <aside className="hidden lg:flex w-72 shrink-0 bg-white border-r border-gray-200 overflow-y-auto flex-col">
          {/* View Mode */}
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-xs font-semibold uppercase text-gray-500 mb-2">View Mode</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('local')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'local'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📍 Local
              </button>
              <button
                onClick={() => setViewMode('community')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'community'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🌍 Community
              </button>
            </div>
          </div>

          {/* Layer Toggles */}
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-xs font-semibold uppercase text-gray-500 mb-2">Layers</h2>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layers.friends}
                  onChange={() => toggleLayer('friends')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>👥 Friends</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layers.spotlights}
                  onChange={() => toggleLayer('spotlights')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>✨ Spotlights</span>
              </label>
            </div>
          </div>

          {/* Privacy Settings */}
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-xs font-semibold uppercase text-gray-500 mb-2">Privacy</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Share Location</p>
                <p className="text-xs text-gray-500">Friends see your area</p>
              </div>
              <button
                onClick={() => updatePrivacy(!privacySettings.shareWithFriends)}
                className={`w-11 h-6 rounded-full transition-colors ${
                  privacySettings.shareWithFriends ? 'bg-blue-600' : 'bg-gray-300'
                }`}
                aria-label={`Toggle location sharing, currently ${privacySettings.shareWithFriends ? 'on' : 'off'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  privacySettings.shareWithFriends ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              ℹ️ Heatmap participation is mandatory and anonymized
            </p>
          </div>

          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-xs font-semibold uppercase text-gray-500">Favorites</h2>
              <button
                onClick={() => {
                  setFavoriteError(null);
                  setShowFavoritesModal(true);
                }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                + Favorites
              </button>
            </div>
            {favoriteLocations.length === 0 ? (
              <p className="text-sm text-gray-400">Save an address or your current location for quick zoom.</p>
            ) : (
              <div className="space-y-2">
                {favoriteLocations.map((favorite) => (
                  <div
                    key={favorite._id}
                    className="group flex items-start justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <button
                      type="button"
                      onClick={() => flyToFavorite(favorite)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium text-gray-900">{favorite.address}</p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {favorite.sourceType === 'current_location' ? 'Saved from current location' : 'Saved address'}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFavorite(favorite._id)}
                      className="text-xs font-semibold text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                      aria-label={`Remove favorite ${favorite.address}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nearby Spotlights */}
          <div className="p-4 flex-1 overflow-y-auto">
            <h2 className="text-xs font-semibold uppercase text-gray-500 mb-2">Nearby Spotlights</h2>
            {spotlights.length === 0 ? (
              <p className="text-sm text-gray-400">No spotlights nearby.</p>
            ) : (
              <div className="space-y-3">
                {spotlights.map(spotlight => (
                  <div key={spotlight._id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium truncate">{spotlight.locationName}</h3>
                        <p className="text-xs text-gray-500">
                          {CATEGORY_ICONS[spotlight.category]} {spotlight.category}
                        </p>
                      </div>
                      <span className="text-lg shrink-0">{STATE_ICONS[spotlight.state]}</span>
                    </div>
                    {spotlight.description && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">{spotlight.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => handleReact(spotlight._id, 'heart')}
                        className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-500"
                      >
                        ❤️ {spotlight.reactions?.heart || 0}
                      </button>
                      <button
                        onClick={() => handleReact(spotlight._id, 'fire')}
                        className="flex items-center gap-1 text-xs text-gray-600 hover:text-orange-500"
                      >
                        🔥 {spotlight.reactions?.fire || 0}
                      </button>
                      <button
                        onClick={() => handleReact(spotlight._id, 'cool')}
                        className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-500"
                      >
                        😎 {spotlight.reactions?.cool || 0}
                      </button>
                    </div>
                    {spotlight.user && (
                      <p className="text-xs text-gray-400 mt-1">by {spotlight.user.username}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Center – Map */}
        <div className="flex-1 min-w-0 relative min-h-0">
          <div ref={mapRef} className="absolute inset-0" />

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-[500]">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
            </div>
          )}

          <div className="absolute right-4 top-1/2 z-[550] hidden -translate-y-1/2 lg:flex flex-col gap-2">
            <button
              type="button"
              onClick={focusCurrentLocation}
              className="rounded-full border border-white/70 bg-white/95 px-4 py-2 text-sm font-semibold text-gray-800 shadow-lg"
            >
              📍 My Location
            </button>
            <button
              type="button"
              onClick={() => {
                setFavoriteError(null);
                setShowFavoritesModal(true);
              }}
              className="rounded-full border border-white/70 bg-white/95 px-4 py-2 text-sm font-semibold text-gray-800 shadow-lg"
            >
              + Favorites
            </button>
          </div>

          {/* Error Toast */}
          {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-3 rounded-lg flex items-center gap-3 max-w-[90%] z-[500]">
              <span className="text-sm">{error}</span>
              <button
                onClick={retryMapInitialization}
                className="px-3 py-1 text-sm bg-red-700 hover:bg-red-800 rounded"
              >
                Retry
              </button>
            </div>
          )}

          {/* Mobile controls */}
          <div
            className="absolute inset-x-3 top-3 z-[550] lg:hidden pointer-events-none"
            ref={mobileControlsRef}
          >
            <div className="flex items-center justify-between gap-2 pointer-events-auto">
              <div
                className="inline-flex rounded-full border border-white/70 bg-white/95 p-1 shadow-lg"
                role="group"
                aria-label="View mode selection"
              >
                <button
                  onClick={() => setViewMode('local')}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                    viewMode === 'local'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  aria-label="Show local map view"
                  aria-pressed={viewMode === 'local'}
                >
                  📍 Local
                </button>
                <button
                  onClick={() => setViewMode('community')}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                    viewMode === 'community'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  aria-label="Show community map view"
                  aria-pressed={viewMode === 'community'}
                >
                  🌍 Community
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setMobileLayersMenuOpen((open) => !open);
                    setMobilePrivacyMenuOpen(false);
                  }}
                  ref={mobileLayersButtonRef}
                  className="h-10 w-10 rounded-full border border-white/70 bg-white/95 text-lg shadow-lg"
                  aria-label="Open map layers controls"
                  aria-expanded={mobileLayersMenuOpen}
                  aria-controls="mobile-layers-menu"
                >
                  🗂️
                </button>
                <button
                  onClick={() => {
                    setMobilePrivacyMenuOpen((open) => !open);
                    setMobileLayersMenuOpen(false);
                  }}
                  ref={mobilePrivacyButtonRef}
                  className="h-10 w-10 rounded-full border border-white/70 bg-white/95 text-lg shadow-lg"
                  aria-label="Open map privacy controls"
                  aria-expanded={mobilePrivacyMenuOpen}
                  aria-controls="mobile-privacy-menu"
                >
                  🔒
                </button>
              </div>
            </div>

            {mobileLayersMenuOpen && (
              <div
                className="mt-2 ml-auto w-56 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg pointer-events-auto"
                id="mobile-layers-menu"
              >
                <h2 className="text-[11px] font-semibold uppercase text-gray-500 mb-2">Layers</h2>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      ref={mobileLayersFirstInputRef}
                      checked={layers.friends}
                      onChange={() => toggleLayer('friends')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>👥 Friends</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layers.spotlights}
                      onChange={() => toggleLayer('spotlights')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>✨ Spotlights</span>
                  </label>
                </div>
              </div>
            )}

            {mobilePrivacyMenuOpen && (
              <div
                className="mt-2 ml-auto w-56 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg pointer-events-auto"
                id="mobile-privacy-menu"
              >
                <h2 className="text-[11px] font-semibold uppercase text-gray-500 mb-2">Privacy</h2>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Share Location</p>
                    <p className="text-xs text-gray-500">Friends see your area</p>
                  </div>
                  <button
                    onClick={() => updatePrivacy(!privacySettings.shareWithFriends)}
                    ref={mobilePrivacyToggleRef}
                    className={`w-11 h-6 rounded-full transition-colors ${
                      privacySettings.shareWithFriends ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                    aria-label={`Toggle location sharing, currently ${privacySettings.shareWithFriends ? 'on' : 'off'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      privacySettings.shareWithFriends ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  ℹ️ Heatmap participation is mandatory and anonymized
                </p>
              </div>
            )}
          </div>

          <div className="absolute bottom-4 right-3 z-[550] flex flex-col gap-2 lg:hidden">
            <button
              onClick={focusCurrentLocation}
              className="h-11 w-11 rounded-full border border-white/70 bg-white/95 text-lg shadow-lg"
              aria-label="Update map to your location"
            >
              📍
            </button>
            <button
              onClick={() => {
                setFavoriteError(null);
                setShowFavoritesModal(true);
              }}
              className="h-11 w-11 rounded-full border border-white/70 bg-white/95 text-base font-bold shadow-lg"
              aria-label="Open favorite locations"
            >
              ★
            </button>
            <button
              onClick={() => setShowCreateSpotlight(true)}
              className="h-11 w-11 rounded-full border border-white/70 bg-white/95 text-lg shadow-lg"
              aria-label="Create a spotlight"
            >
              ✨
            </button>
          </div>
        </div>

        {/* Right Sidebar – Friends */}
        <aside className="hidden lg:flex w-64 shrink-0 bg-white border-l border-gray-200 overflow-y-auto flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-xs font-semibold uppercase text-gray-500">Friends</h2>
            <p className="text-[11px] text-gray-400 mt-1">
              Refreshes every 10 seconds
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {friendsLocations.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm text-gray-400">No friends found.</p>
                <p className="text-xs text-gray-400 mt-1">Accepted friends will appear here when available.</p>
              </div>
            ) : (
              <div>
                {[
                  { key: 'online', label: 'Online', friends: onlineFriends },
                  { key: 'offline', label: 'Offline', friends: offlineFriends }
                ].map((group) => (
                  <section key={group.key} className="border-b border-gray-100 last:border-b-0">
                    <div className="sticky top-0 z-10 flex items-center justify-between bg-white/95 px-4 py-2 backdrop-blur">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{group.label}</h3>
                      <span className="text-[11px] text-gray-400">{group.friends.length}</span>
                    </div>
                    {group.friends.length === 0 ? (
                      <p className="px-4 pb-4 text-xs text-gray-400">No {group.label.toLowerCase()} friends.</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {group.friends.map((friend, idx) => (
                          <li key={friend.user?._id || `${group.key}-${idx}`}>
                            <button
                              onClick={() => flyToFriend(friend)}
                              className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 hover:bg-blue-50 ${
                                friend.isLive ? '' : 'opacity-60'
                              }`}
                            >
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0 ${
                                friend.isLive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                              }`}>
                                {getFriendMarkerLabel(friend)}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{friend.user?.username || 'Friend'}</p>
                                <p className="text-xs text-gray-500 truncate">{getFriendDisplayLocation(friend)}</p>
                                <p className={`text-[11px] mt-0.5 ${friend.isLive ? 'text-emerald-600' : 'text-gray-500'}`}>
                                  {formatFriendStatus(friend)}
                                </p>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>
          <div className="p-3 border-t border-gray-200 text-[11px] text-gray-400">
            <p>Map refresh: {lastMapRefreshAt ? lastMapRefreshAt.toLocaleTimeString() : 'Waiting for map data'}</p>
            <p>Friends refresh: {lastFriendsRefreshAt ? lastFriendsRefreshAt.toLocaleTimeString() : 'Waiting for friend data'}</p>
          </div>
        </aside>
      </div>

      {/* Create Spotlight Modal */}
      {showCreateSpotlight && (
        <div
          className="fixed inset-0 z-[700] flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Create Spotlight"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">✨ Create Spotlight</h2>

            <form onSubmit={handleCreateSpotlight}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location Name *</label>
                  <input
                    type="text"
                    value={spotlightForm.locationName}
                    onChange={(e) => setSpotlightForm(prev => ({ ...prev, locationName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="e.g., Joe's Coffee Shop"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={spotlightForm.category}
                    onChange={(e) => setSpotlightForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="food">🍔 Food</option>
                    <option value="drink">🍺 Drink</option>
                    <option value="entertainment">🎭 Entertainment</option>
                    <option value="shopping">🛍️ Shopping</option>
                    <option value="service">🔧 Service</option>
                    <option value="outdoor">🌲 Outdoor</option>
                    <option value="other">📍 Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={spotlightForm.description}
                    onChange={(e) => setSpotlightForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="What makes this place special?"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateSpotlight(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingSpotlight || !spotlightForm.locationName}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                >
                  {creatingSpotlight ? 'Creating...' : '✨ Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFavoritesModal && (
        <div
          className="fixed inset-0 z-[700] flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Save Favorite"
        >
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-gray-900">★ Save Favorite</h2>
              <button
                type="button"
                onClick={() => {
                  setShowFavoritesModal(false);
                  setFavoriteError(null);
                }}
                className="text-sm font-medium text-gray-400 hover:text-gray-600"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateFavorite} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
                <input
                  type="text"
                  value={favoriteForm.address}
                  onChange={(event) => setFavoriteForm({ address: event.target.value })}
                  aria-label="Favorite address"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="123 Main St, Austin, TX"
                />
                <p className="mt-1 text-xs text-gray-500">
                  We’ll save a readable address when possible and fall back to GPS coordinates only if needed.
                </p>
              </div>

              {favoriteError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {favoriteError}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleFavoriteCurrentLocation}
                  disabled={savingFavorite}
                  className="flex-1 rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
                >
                  Use Current Location
                </button>
                <button
                  type="submit"
                  disabled={savingFavorite}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingFavorite ? 'Saving...' : 'Save Favorite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Maps;
