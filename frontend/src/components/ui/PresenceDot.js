import React from 'react';
import { resolvePresenceStatus } from '../../utils/presence';

/**
 * PresenceDot
 *
 * Renders a small colored circle representing a user's presence status.
 * Replaces inline PresenceDot helpers in Friends.js and similar pages.
 *
 * Props:
 *   presence  — presence object (same shape as backend PresenceDTO)
 *   className — extra classes
 */
const STATUS_COLORS = {
  online: 'bg-emerald-500',
  inactive: 'bg-amber-400',
};
const FALLBACK_COLOR = 'bg-slate-300';

const PresenceDot = ({ presence, className = '' }) => {
  const status = resolvePresenceStatus(presence);
  const color = STATUS_COLORS[status] || FALLBACK_COLOR;

  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${color} ${className}`}
      title={status}
      role="img"
      aria-label={`Status: ${status}`}
    />
  );
};

export default PresenceDot;
