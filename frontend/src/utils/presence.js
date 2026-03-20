/**
 * Presence utilities — rendering helpers for the canonical presence DTO
 * produced by the backend presenceService.
 *
 * The backend is the single source of truth for status derivation.
 * These helpers format and classify the DTO for rendering purposes only;
 * they do NOT re-derive the status from raw timestamps (the 5-minute
 * inactive window is evaluated server-side).  A lightweight fallback is
 * retained so that if the frontend receives a stale/raw DTO it can still
 * approximate a reasonable status without diverging from the backend
 * thresholds.
 */

export const PRESENCE_INACTIVE_WINDOW_MS = 5 * 60 * 1000;

const toTimestamp = (value) => {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const resolvePresenceStatus = (presence, referenceTime = Date.now()) => {
  const rawStatus = String(presence?.status || '').trim().toLowerCase();

  // Backend-resolved canonical states are authoritative
  if (rawStatus === 'hidden') return 'hidden';
  if (rawStatus === 'online') return 'online';
  if (rawStatus === 'inactive') return 'inactive';
  if (rawStatus === 'unknown') return 'unknown';

  // Fallback: if backend sent 'offline' or unrecognized status, do a
  // lightweight staleness check so recently-disconnected users still
  // render as "inactive" even if the DTO was slightly stale.
  const lastSeenTimestamp = toTimestamp(presence?.lastSeen);
  if (lastSeenTimestamp > 0 && (referenceTime - lastSeenTimestamp) < PRESENCE_INACTIVE_WINDOW_MS) {
    return 'inactive';
  }

  return 'offline';
};

export const formatPresenceLastSeen = (value, referenceTime = Date.now()) => {
  const timestamp = toTimestamp(value);
  if (!timestamp) return '';

  const diffMs = Math.max(0, referenceTime - timestamp);
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `Last seen ${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `Last seen ${diffDays}d ago`;
};

export const getPresenceMeta = (presence, referenceTime = Date.now()) => {
  const status = resolvePresenceStatus(presence, referenceTime);
  if (status === 'hidden') {
    return {
      status,
      label: 'Presence hidden',
      shortLabel: 'Hidden',
      dotClassName: 'bg-gray-300'
    };
  }

  if (status === 'online') {
    return {
      status,
      label: 'Online now',
      shortLabel: 'Online',
      dotClassName: 'bg-emerald-500'
    };
  }

  if (status === 'inactive') {
    return {
      status,
      label: 'Inactive',
      shortLabel: 'Inactive',
      dotClassName: 'bg-amber-400'
    };
  }

  if (status === 'unknown') {
    return {
      status,
      label: 'Status unavailable',
      shortLabel: 'Unknown',
      dotClassName: 'bg-slate-300'
    };
  }

  return {
    status,
    label: formatPresenceLastSeen(presence?.lastSeen, referenceTime) || 'Offline',
    shortLabel: 'Offline',
    dotClassName: 'bg-slate-300'
  };
};
