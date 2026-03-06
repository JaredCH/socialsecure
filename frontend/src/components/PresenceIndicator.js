import React from 'react';

const formatLastSeen = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `Last seen ${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `Last seen ${diffDays}d ago`;
};

const PresenceIndicator = ({ presence }) => {
  const status = presence?.status || 'offline';
  const isOnline = status === 'online';
  const isHidden = status === 'hidden';

  const label = isHidden
    ? 'Presence hidden'
    : isOnline
      ? 'Online now'
      : formatLastSeen(presence?.lastSeen) || 'Offline';

  const dotClassName = isHidden
    ? 'bg-gray-300'
    : isOnline
      ? 'bg-emerald-500'
      : 'bg-gray-400';

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500" title={label}>
      <span className={`w-2.5 h-2.5 rounded-full ${dotClassName}`} />
      <span>{label}</span>
    </span>
  );
};

export default PresenceIndicator;
