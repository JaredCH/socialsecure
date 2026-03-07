import React, { useState, useEffect, useRef } from 'react';
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
const HEATMAP_CIRCLE_RADIUS_METERS = 2000;
export const LOCATION_PUBLISH_INTERVAL_MS = 30 * 1000;
export const FRIENDS_REFRESH_INTERVAL_MS = 10 * 1000;
const MAP_REFRESH_INTERVAL_MS = 60 * 1000;
const HEATMAP_USERS_PER_LAYER = 3;
const HEATMAP_MAX_STACK_LAYERS = 6;
const HEATMAP_BASE_FILL_OPACITY = 0.08;
const HEATMAP_INTENSITY_OPACITY_FACTOR = 0.14;
const HEATMAP_MAX_FILL_OPACITY = 0.34;
const createFallbackResponse = (data) => ({ data });

export const withDataFallback = (request, fallbackData) =>
  request.catch(() => createFallbackResponse(fallbackData));

export const resolveLeafletModule = (leafletModule) => {
  const resolvedModule = leafletModule?.default && typeof leafletModule.default.map === 'function'
    ? leafletModule.default
    : leafletModule;

  if (typeof resolvedModule?.map !== 'function') {
    throw new Error('Leaflet map API is unavailable');
  }

  return resolvedModule;
};

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
  const [userLocation, setUserLocation] = useState(null);
  const [presence, setPresence] = useState(null);
  const [privacySettings, setPrivacySettings] = useState({ shareWithFriends: true });
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateSpotlight, setShowCreateSpotlight] = useState(false);
  const [creatingSpotlight, setCreatingSpotlight] = useState(false);
  const [mobileLayersMenuOpen, setMobileLayersMenuOpen] = useState(false);
  const [mobilePrivacyMenuOpen, setMobilePrivacyMenuOpen] = useState(false);
  const [lastMapRefreshAt, setLastMapRefreshAt] = useState(null);
  const [lastFriendsRefreshAt, setLastFriendsRefreshAt] = useState(null);
  const [spotlightForm, setSpotlightForm] = useState({
    locationName: '',
    description: '',
    category: 'other'
  });

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
  }, [userLocation, viewMode, layers.friends, layers.heatmap]);

  useEffect(() => {
    if (!userLocation) return undefined;

    const intervalId = window.setInterval(() => {
      fetchMapData({ showLoading: false });
    }, MAP_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [userLocation, viewMode, layers.heatmap]);

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
  const fetchMapData = async ({ showLoading = true } = {}) => {
    if (!userLocation) return;
    
    try {
      if (showLoading) {
        setLoading(true);
      }
      const [lat, lng] = userLocation;
      
      // Fetch map data
      const mapEndpoint = viewMode === 'local' ? 'getLocalMap' : 'getCommunityMap';
      const [mapRes, heatmapRes] = await Promise.all([
        withDataFallback(
          mapsAPI[mapEndpoint]({ lat, lng, radius: viewMode === 'local' ? 50000 : 200000 }),
          { spotlights: [] }
        ),
        layers.heatmap
          ? withDataFallback(
            mapsAPI.getHeatmap({
              north: lat + 1, south: lat - 1, east: lng + 1, west: lng - 1
            }),
            { heatmap: [] }
          )
          : Promise.resolve(createFallbackResponse({ heatmap: [] }))
      ]);
      
      setSpotlights(mapRes.data.spotlights || []);
      setHeatmapData(heatmapRes.data.heatmap || []);
      setLastMapRefreshAt(new Date());
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

  // Fetch user presence
  const fetchUserPresence = async () => {
    try {
      const res = await mapsAPI.getPresence();
      if (res?.data?.presence) {
        setPresence(res.data.presence);
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
            fetchMapData({ showLoading: true });
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

  const updateLocation = () => {
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
      
      setShowCreateSpotlight(false);
      setSpotlightForm({ locationName: '', description: '', category: 'other' });
      fetchMapData();
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
      fetchMapData();
    } catch (err) {
      console.error('Error reacting to spotlight:', err);
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
          const icon = L.divIcon({
            className: 'friend-marker',
            html: `<div style="background:${markerColor};width:24px;height:24px;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:12px;">👤</div>`,
            iconSize: [24, 24]
          });
          
          L.marker([friend.lat, friend.lng], { icon })
            .bindPopup(`<b>${friend.user?.username || 'Friend'}</b><br/>${friend.city || friend.locationName || 'Location shared'}<br/>${friend.isLive ? 'Live now' : 'Recently shared'}`)
            .addTo(map);
        }
      });
    }
    
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
    
    // Render heatmap overlay as colored circles
    if (layers.heatmap && heatmapData.length > 0) {
      heatmapData.forEach(point => {
        if (point.lat != null && point.lng != null && point.intensity > 0) {
          const intensity = Math.max(0, Math.min(point.intensity, 1));
          const stackLayers = Math.max(
            1,
            Math.min(HEATMAP_MAX_STACK_LAYERS, Math.ceil((point.userCount || 1) / HEATMAP_USERS_PER_LAYER))
          );

          for (let index = 0; index < stackLayers; index += 1) {
            // Keep outer circles softer so overlapping layers read as glow instead of an opaque block.
            const layerWeight = 1 - (index / (stackLayers + 1));

            L.circle([point.lat, point.lng], {
              radius: HEATMAP_CIRCLE_RADIUS_METERS * (1 + index * 0.45),
              color: 'transparent',
              fillColor: '#ef4444',
              fillOpacity: Math.min(
                HEATMAP_BASE_FILL_OPACITY + (intensity * HEATMAP_INTENSITY_OPACITY_FACTOR * layerWeight),
                HEATMAP_MAX_FILL_OPACITY
              ),
              interactive: false
            }).addTo(map);
          }
        }
      });
    }
    
  }, [map, userLocation, friendsLocations, spotlights, heatmapData, layers]);

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
    map.setView([friend.lat, friend.lng], 14);
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="hidden shrink-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white px-4 py-3 lg:flex lg:items-center lg:justify-between">
        <h1 className="text-xl font-bold">🗺️ Maps</h1>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={updateLocation}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            📍 My Location
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
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layers.heatmap}
                  onChange={() => toggleLayer('heatmap')}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>🔥 Heatmap</span>
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
          <div className="absolute inset-x-3 top-3 z-[550] lg:hidden pointer-events-none">
            <div className="flex items-center justify-between gap-2 pointer-events-auto">
              <div className="inline-flex rounded-full border border-white/70 bg-white/95 p-1 shadow-lg">
                <button
                  onClick={() => setViewMode('local')}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                    viewMode === 'local'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  aria-label="Show local map view"
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
                >
                  🌍
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setMobileLayersMenuOpen((open) => !open);
                    setMobilePrivacyMenuOpen(false);
                  }}
                  className="h-10 w-10 rounded-full border border-white/70 bg-white/95 text-lg shadow-lg"
                  aria-label="Open map layers controls"
                  aria-expanded={mobileLayersMenuOpen}
                >
                  🗂️
                </button>
                <button
                  onClick={() => {
                    setMobilePrivacyMenuOpen((open) => !open);
                    setMobileLayersMenuOpen(false);
                  }}
                  className="h-10 w-10 rounded-full border border-white/70 bg-white/95 text-lg shadow-lg"
                  aria-label="Open map privacy controls"
                  aria-expanded={mobilePrivacyMenuOpen}
                >
                  🔒
                </button>
              </div>
            </div>

            {mobileLayersMenuOpen && (
              <div className="mt-2 ml-auto w-56 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg pointer-events-auto">
                <h2 className="text-[11px] font-semibold uppercase text-gray-500 mb-2">Layers</h2>
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
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layers.heatmap}
                      onChange={() => toggleLayer('heatmap')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>🔥 Heatmap</span>
                  </label>
                </div>
              </div>
            )}

            {mobilePrivacyMenuOpen && (
              <div className="mt-2 ml-auto w-56 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg pointer-events-auto">
                <h2 className="text-[11px] font-semibold uppercase text-gray-500 mb-2">Privacy</h2>
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
              onClick={updateLocation}
              className="h-11 w-11 rounded-full border border-white/70 bg-white/95 text-lg shadow-lg"
              aria-label="Update map to your location"
            >
              📍
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
            <h2 className="text-xs font-semibold uppercase text-gray-500">Friends Nearby</h2>
            <p className="text-[11px] text-gray-400 mt-1">
              Refreshes every 10 seconds
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {friendsLocations.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm text-gray-400">No friends sharing locations.</p>
                <p className="text-xs text-gray-400 mt-1">Friends with location enabled will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {friendsLocations.map((friend, idx) => (
                  <li key={friend.user?._id || idx}>
                    <button
                      onClick={() => flyToFriend(friend)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3"
                    >
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0 ${
                        friend.isLive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {friend.user?.username?.[0]?.toUpperCase() || '?'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{friend.user?.username || 'Friend'}</p>
                        <p className="text-xs text-gray-500 truncate">{friend.city || friend.locationName || 'Location shared'}</p>
                        <p className={`text-[11px] mt-0.5 ${friend.isLive ? 'text-emerald-600' : 'text-gray-500'}`}>
                          {friend.liveAgeSeconds != null
                            ? `${friend.isLive ? 'Live' : 'Recent'} • ${friend.liveAgeSeconds}s ago`
                            : friend.isLive ? 'Live' : 'Recent'}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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
    </div>
  );
}

export default Maps;
