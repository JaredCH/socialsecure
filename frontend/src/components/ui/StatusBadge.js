import React from 'react';

/**
 * StatusBadge
 *
 * Renders a color-coded pill badge for any status string.
 * Merges palettes from ModerationDashboard & AdminNewsReview so every
 * surface that previously defined its own color map can share one component.
 *
 * Props:
 *   status    — string key (e.g. 'active', 'pending', 'failed')
 *   label     — optional display text; defaults to `status`
 *   className — extra classes forwarded to the outer <span>
 *   colorMap  — optional override map { [status]: 'bg-… text-…' }
 */

const DEFAULT_COLORS = {
  // Shared across admin / moderation / news-review
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-red-100 text-red-700',
  processed: 'bg-emerald-100 text-emerald-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  inserted: 'bg-blue-100 text-blue-700',
  insert: 'bg-blue-100 text-blue-700',
  updated: 'bg-amber-100 text-amber-700',
  update: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  under_review: 'bg-blue-100 text-blue-700',
  duplicate: 'bg-gray-100 text-gray-600',
  skip: 'bg-gray-100 text-gray-600',
  dismissed: 'bg-gray-100 text-gray-600',
  // Severity
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
  // Log levels
  info: 'bg-blue-100 text-blue-700',
  warn: 'bg-yellow-100 text-yellow-700',
  debug: 'bg-gray-100 text-gray-500',
  // Geo scopes (AdminNewsReview)
  city: 'bg-blue-100 text-blue-700',
  county: 'bg-purple-100 text-purple-700',
  state: 'bg-amber-100 text-amber-700',
  country: 'bg-green-100 text-green-700',
  global: 'bg-gray-100 text-gray-600',
  local: 'bg-blue-100 text-blue-700',
  regional: 'bg-amber-100 text-amber-700',
  national: 'bg-green-100 text-green-700',
};

const FALLBACK = 'bg-gray-100 text-gray-600';

const StatusBadge = ({ status, label, className = '', colorMap }) => {
  const palette = colorMap ? { ...DEFAULT_COLORS, ...colorMap } : DEFAULT_COLORS;
  const color = palette[status] || FALLBACK;

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color} ${className}`}
    >
      {label ?? status}
    </span>
  );
};

export default StatusBadge;
