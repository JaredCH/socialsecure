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

function Maps() {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
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
  const [spotlightForm, setSpotlightForm] = useState({
    locationName: '',
    description: '',
    category: 'other'
  });

  // Initialize map and fetch data
  useEffect(() => {
    initMap();
    fetchMapData();
    fetchUserPresence();
  }, [viewMode]);

  // Initialize map (using Leaflet)
  const initMap = async () => {
    if (typeof window === 'undefined') return;
    
    const L = await import('leaflet');
    await import('leaflet/dist/leaflet.css');
    
    // Fix Leaflet marker icons
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });

    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation([latitude, longitude]);
          
          // Initialize map
          const mapInstance = L.map(mapRef.current).setView([latitude, longitude], 12);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(mapInstance);
          
          setMap(mapInstance);
        },
        () => {
          // Default to center of US if geolocation fails
          const mapInstance = L.map(mapRef.current).setView([39.8283, -98.5795], 4);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(mapInstance);
          
          setMap(mapInstance);
        }
      );
    }
  };

  // Fetch map data based on view mode
  const fetchMapData = async () => {
    if (!userLocation) return;
    
    try {
      setLoading(true);
      const [lat, lng] = userLocation;
      
      // Fetch map data
      const mapEndpoint = viewMode === 'local' ? 'getLocalMap' : 'getCommunityMap';
      const [mapRes, friendsRes, heatmapRes] = await Promise.all([
        mapsAPI[mapEndpoint]({ lat, lng, radius: viewMode === 'local' ? 50000 : 200000 }),
        layers.friends ? mapsAPI.getFriendsLocations().catch(() => ({ data: { friends: [] } })) : Promise.resolve({ data: { friends: [] } }),
        layers.heatmap ? mapsAPI.getHeatmap({
          north: lat + 1, south: lat - 1, east: lng + 1, west: lng - 1
        }).catch(() => ({ data: { heatmap: [] } })) : Promise.resolve({ data: { heatmap: [] } })
      ]);
      
      setSpotlights(mapRes.data.spotlights || []);
      setFriendsLocations(friendsRes.data.friends || []);
      setHeatmapData(heatmapRes.data.heatmap || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching map data:', err);
      setError('Failed to load map data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch user presence
  const fetchUserPresence = async () => {
    try {
      const res = await mapsAPI.getPresence();
      if (res.data.presence) {
        setPresence(res.data.presence);
        setPrivacySettings({ shareWithFriends: res.data.presence.shareWithFriends });
      }
    } catch (err) {
      console.error('Error fetching presence:', err);
    }
  };

  // Update user location
  const updateLocation = () => {
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
          
          setUserLocation([latitude, longitude]);
          if (map) {
            map.setView([latitude, longitude], 12);
          }
          
          fetchMapData();
        } catch (err) {
          console.error('Error updating presence:', err);
        }
      },
      (err) => console.error('Geolocation error:', err)
    );
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
    if (!map) return;
    
    // Clear existing layers
    map.eachLayer((layer) => {
      if (layer._url && layer._url.includes('tile')) return; // Keep tile layer
      if (layer._heat) return; // Keep heatmap layer
      map.removeLayer(layer);
    });
    
    // Add friends markers
    if (layers.friends && friendsLocations.length > 0) {
      friendsLocations.forEach(friend => {
        if (friend.locationName && map) {
          // Coarse location marker
          const icon = L.divIcon({
            className: 'friend-marker',
            html: `<div style="background:#10b981;width:24px;height:24px;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:12px;">👤</div>`,
            iconSize: [24, 24]
          });
          
          // Use city/state for marker position (coarse location)
          L.marker([39.8283, -98.5795], { icon }) // Default until we have coords
            .bindPopup(`<b>${friend.user?.username || 'Friend'}</b><br/>${friend.city || friend.locationName || 'Location hidden'}`)
            .addTo(map);
        }
      });
    }
    
    // Add spotlight markers
    if (layers.spotlights && spotlights.length > 0) {
      spotlights.forEach(spotlight => {
        // Note: In production, we'd store coordinates. For now, we use placeholder
        const stateIcon = STATE_ICONS[spotlight.state] || '📍';
        const categoryIcon = CATEGORY_ICONS[spotlight.category] || '📍';
        
        const icon = L.divIcon({
          className: 'spotlight-marker',
          html: `<div style="background:#f59e0b;width:32px;height:32px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${stateIcon}</div>`,
          iconSize: [32, 32]
        });
        
        // Placeholder position - in production would use spotlight.location.coordinates
        L.marker([39.8283, -98.5795], { icon })
          .bindPopup(`
            <b>${spotlight.locationName}</b><br/>
            ${spotlight.description || ''}<br/>
            ${categoryIcon} ${spotlight.category}<br/>
            ❤️ ${spotlight.reactions?.heart || 0} 🔥 ${spotlight.reactions?.fire || 0} 😎 ${spotlight.reactions?.cool || 0}
          `)
          .addTo(map);
      });
    }
    
  }, [map, friendsLocations, spotlights, layers]);

  if (!map && loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="flex items--center justify-center h64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">🗺️ Maps</h1>
            
            <div className="flex items-center gap-2">
              <button
                onClick={updateLocation}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm"
              >
                📍 My Location
              </button>
              <button
                onClick={() => setShowCreateSpotlight(true)}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 rounded-lg text-sm"
              >
                ✨ Create Spotlight
              </button>
            </div>
          </div>
          
          {/* View Mode Tabs */}
          <div className="flex gap-4 mt-3">
            <button
              onClick={() => setViewMode('local')}
              className={`px-4 py-1.5 rounded-full text-sm ${
                viewMode === 'local' ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              📍 Local Map
            </button>
            <button
              onClick={() => setViewMode('community')}
              className={`px-4 py-1.5 rounded-full text-sm ${
                viewMode === 'community' ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              🌍 Community Map
            </button>
          </div>
          
          {/* Layer Toggles */}
          <div className="flex gap-4 mt-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={layers.friends}
                onChange={() => toggleLayer('friends')}
                className="rounded"
              />
              👥 Friends
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={layers.spotlights}
                onChange={() => toggleLayer('spotlights')}
                className="rounded"
              />
              ✨ Spotlights
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={layers.heatmap}
                onChange={() => toggleLayer('heatmap')}
                className="rounded"
              />
              🔥 Heatmap
            </label>
          </div>
        </div>
      </div>

      {/* Privacy Settings */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Friend Location Sharing</h3>
              <p className="text-sm text-gray-400">Allow friends to see your general location</p>
            </div>
            <button
              onClick={() => updatePrivacy(!privacySettings.shareWithFriends)}
              className={`w-12 h-6 rounded-full transition-colors ${
                privacySettings.shareWithFriends ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                privacySettings.shareWithFriends ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            ℹ️ Heatmap participation is mandatory and anonymized - you cannot opt out
          </p>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative">
        <div ref={mapRef} className="h-[500px] w-full" />
        
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
          </div>
        )}
        
        {/* Error Toast */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 px-4 py-2 rounded-lg">
            {error}
          </div>
        )}
      </div>

      {/* Spotlight List */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <h2 className="text-lg font-semibold mb-3">Nearby Spotlights</h2>
        
        {spotlights.length === 0 ? (
          <p className="text-gray-400">No spotlights nearby. Create one!</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {spotlights.map(spotlight => (
              <div key={spotlight._id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{spotlight.locationName}</h3>
                    <p className="text-sm text-gray-400">
                      {CATEGORY_ICONS[spotlight.category]} {spotlight.category}
                    </p>
                  </div>
                  <span className="text-2xl">{STATE_ICONS[spotlight.state]}</span>
                </div>
                
                {spotlight.description && (
                  <p className="text-sm text-gray-300 mt-2">{spotlight.description}</p>
                )}
                
                <div className="flex items-center gap-4 mt-3">
                  <button
                    onClick={() => handleReact(spotlight._id, 'heart')}
                    className="flex items-center gap-1 text-sm hover:text-red-400"
                  >
                    ❤️ {spotlight.reactions?.heart || 0}
                  </button>
                  <button
                    onClick={() => handleReact(spotlight._id, 'fire')}
                    className="flex items-center gap-1 text-sm hover:text-orange-400"
                  >
                    🔥 {spotlight.reactions?.fire || 0}
                  </button>
                  <button
                    onClick={() => handleReact(spotlight._id, 'cool')}
                    className="flex items-center gap-1 text-sm hover:text-blue-400"
                  >
                    😎 {spotlight.reactions?.cool || 0}
                  </button>
                </div>
                
                {spotlight.user && (
                  <p className="text-xs text-gray-500 mt-2">
                    by {spotlight.user.username}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Spotlight Modal */}
      {showCreateSpotlight && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">✨ Create Spotlight</h2>
            
            <form onSubmit={handleCreateSpotlight}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Location Name *</label>
                  <input
                    type="text"
                    value={spotlightForm.locationName}
                    onChange={(e) => setSpotlightForm(prev => ({ ...prev, locationName: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., Joe's Coffee Shop"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={spotlightForm.category}
                    onChange={(e) => setSpotlightForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
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
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={spotlightForm.description}
                    onChange={(e) => setSpotlightForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    placeholder="What makes this place special?"
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateSpotlight(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingSpotlight || !spotlightForm.locationName}
                  className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50"
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
