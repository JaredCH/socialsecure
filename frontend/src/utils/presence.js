export const PRESENCE_INACTIVE_WINDOW_MS = 5 * 60 * 1000;

const toTimestamp = (value) => {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const resolvePresenceStatus = (presence, referenceTime = Date.now()) => {
  const rawStatus = String(presence?.status || '').trim().toLowerCase();
  if (rawStatus === 'hidden') return 'hidden';
  if (rawStatus === 'online') return 'online';

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

  return {
    status,
    label: formatPresenceLastSeen(presence?.lastSeen, referenceTime) || 'Offline',
    shortLabel: 'Offline',
    dotClassName: 'bg-slate-300'
  };
};
