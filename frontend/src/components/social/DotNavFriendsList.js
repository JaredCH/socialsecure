import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { friendsAPI, mapsAPI, getAuthToken } from '../../utils/api';
import { getRealtimeSocket, onFriendPresence } from '../../utils/realtime';
import { resolvePresenceStatus } from '../../utils/presence';

const METERS_TO_FEET = 3.28084;
const EARTH_RADIUS_METERS = 6378137;
const FRIENDS_REFRESH_INTERVAL_MS = 30000;

/**
 * Haversine distance in meters between two [lat, lng] positions.
 */
const haversineDistanceMeters = (lat1, lng1, lat2, lng2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Get user initials from realName or username.
 */
const getInitials = (friend) => {
  const name = friend.realName || friend.username || '';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || '?').toUpperCase();
};

/**
 * Get display name: First name + Last initial
 */
const getDisplayName = (friend) => {
  const name = friend.realName || friend.username || '';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }
  return parts[0] || '';
};

/**
 * Determine if a friend is "online" for our purposes (online or inactive).
 */
const isFriendOnline = (friend) => {
  const status = resolvePresenceStatus(friend.presence);
  return status === 'online' || status === 'inactive';
};

const DotNavFriendsList = ({ isOpen, side, loggedInUser, userId }) => {
  const [friends, setFriends] = useState([]);
  const [friendLocations, setFriendLocations] = useState([]);
  const [myLocation, setMyLocation] = useState(null);
  const [imgErrors, setImgErrors] = useState({});
  const refreshTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // Fetch friends list
  const loadFriends = useCallback(async () => {
    try {
      const res = await friendsAPI.getFriends();
      if (!mountedRef.current) return;
      const list = res?.data?.friends || res?.data || [];
      setFriends(Array.isArray(list) ? list : []);
    } catch {
      // Silently handle errors - friends list is non-critical
    }
  }, []);

  // Fetch friend locations from maps API
  const loadLocations = useCallback(async () => {
    try {
      const res = await mapsAPI.getFriendsLocations();
      if (!mountedRef.current) return;
      const locs = res?.data?.locations || res?.data || [];
      setFriendLocations(Array.isArray(locs) ? locs : []);
    } catch {
      // Silently handle errors
    }
  }, []);

  // Get current user's geolocation
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (mountedRef.current) {
          setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      },
      () => { /* geolocation errors are non-critical */ },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Load data on mount and set up refresh interval
  useEffect(() => {
    mountedRef.current = true;
    loadFriends();
    loadLocations();
    refreshTimerRef.current = setInterval(() => {
      loadFriends();
      loadLocations();
    }, FRIENDS_REFRESH_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [loadFriends, loadLocations]);

  // Subscribe to real-time presence updates
  useEffect(() => {
    if (!userId) return undefined;
    const token = getAuthToken();
    if (!token) return undefined;
    getRealtimeSocket({ token, userId });

    const offPresence = onFriendPresence((payload) => {
      const uid = String(payload?.userId || '').trim();
      if (!uid) return;
      setFriends((prev) =>
        prev.map((f) =>
          String(f._id) === uid ? { ...f, presence: payload.presence || payload } : f
        )
      );
    });
    return () => { if (offPresence) offPresence(); };
  }, [userId]);

  // Build a location map by user ID
  const locationByUserId = useMemo(() => {
    const map = new Map();
    for (const loc of friendLocations) {
      const id = String(loc?.user?._id || '');
      if (id && loc.lat != null && loc.lng != null) {
        map.set(id, { lat: loc.lat, lng: loc.lng });
      }
    }
    return map;
  }, [friendLocations]);

  // Process friends: compute distance, sort, and take top 5
  const displayFriends = useMemo(() => {
    const enriched = friends.map((f) => {
      const online = isFriendOnline(f);
      const loc = locationByUserId.get(String(f._id));
      let distanceFt = null;
      if (myLocation && loc) {
        const meters = haversineDistanceMeters(myLocation.lat, myLocation.lng, loc.lat, loc.lng);
        distanceFt = Math.round(meters * METERS_TO_FEET);
      }
      return { ...f, _online: online, _distanceFt: distanceFt };
    });

    // Sort: online first, then by closest distance, then alphabetically
    enriched.sort((a, b) => {
      // Online before offline
      if (a._online !== b._online) return a._online ? -1 : 1;
      // Within same online status, by distance (closer first; null = far away)
      const aDist = a._distanceFt ?? Infinity;
      const bDist = b._distanceFt ?? Infinity;
      if (aDist !== bDist) return aDist - bDist;
      // Alphabetically by name
      const aName = (a.realName || a.username || '').toLowerCase();
      const bName = (b.realName || b.username || '').toLowerCase();
      return aName.localeCompare(bName);
    });

    return enriched;
  }, [friends, locationByUserId, myLocation]);

  // Group for display
  const onlineGroup = useMemo(() => displayFriends.filter((f) => f._online), [displayFriends]);
  const offlineGroup = useMemo(() => displayFriends.filter((f) => !f._online), [displayFriends]);

  const handleImgError = useCallback((id) => {
    setImgErrors((prev) => ({ ...prev, [id]: true }));
  }, []);

  if (!isOpen || friends.length === 0) return null;

  const opposingSide = side === 'right' ? 'left' : 'right';

  return (
    <div
      className={`dotnav-friends-list dotnav-friends-${opposingSide} dotnav-visible`}
      data-testid="dotnav-friends-list"
      role="list"
      aria-label="Friends list"
    >
      {[
        { key: 'online', label: 'Online', items: onlineGroup },
        { key: 'offline', label: 'Offline', items: offlineGroup },
      ].map((group) => {
        if (group.items.length === 0) return null;
        return (
          <div key={group.key} className="dotnav-friends-group" role="group" aria-label={`${group.label} friends`}>
            <div className="dotnav-friends-group-label">{group.label}</div>
            {group.items.map((friend) => {
              const id = String(friend._id);
              const initials = getInitials(friend);
              const displayName = getDisplayName(friend);
              const showImg = friend.avatarUrl && !imgErrors[id];
              const isOnline = friend._online;
              const distFt = friend._distanceFt;

              return (
                <div
                  key={id}
                  className={`dotnav-friend-row dotnav-friend-${isOnline ? 'online' : 'offline'}`}
                  role="listitem"
                  data-testid={`dotnav-friend-${id}`}
                >
                  <div className="dotnav-friend-avatar-wrap">
                    <div className={`dotnav-friend-avatar ${isOnline ? 'dotnav-friend-glow-online' : 'dotnav-friend-glow-offline'}`}>
                      {showImg ? (
                        <img
                          src={friend.avatarUrl}
                          alt={displayName}
                          className="dotnav-friend-avatar-img"
                          onError={() => handleImgError(id)}
                        />
                      ) : (
                        <span className="dotnav-friend-initials">{initials}</span>
                      )}
                    </div>
                    {distFt != null && (
                      <span className="dotnav-friend-distance">{distFt} Ft</span>
                    )}
                  </div>
                  <span className="dotnav-friend-name">{displayName}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export { getInitials, getDisplayName, isFriendOnline, haversineDistanceMeters, METERS_TO_FEET };
export default DotNavFriendsList;
