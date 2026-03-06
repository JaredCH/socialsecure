import React from 'react';

const formatLastSeen = (lastSeen) => {
  if (!lastSeen) return 'Offline';
  const ts = new Date(lastSeen);
  if (Number.isNaN(ts.getTime())) return 'Offline';
  return `Last seen ${ts.toLocaleString()}`;
};

const PresenceIndicator = ({ status = 'offline', lastSeen = null }) => {
  const online = status === 'online';
  return (
    <span className="inline-flex items-center gap-1" title={online ? 'Online' : formatLastSeen(lastSeen)}>
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${online ? 'bg-green-500' : 'bg-gray-400'}`} />
      <span className="text-xs text-gray-500">{online ? 'Online' : 'Offline'}</span>
    </span>
  );
};

export default PresenceIndicator;
