import React from 'react';

const HEALTH_COLORS = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444'
};

const HEALTH_LABELS = {
  green: 'Connected',
  yellow: 'Not wired',
  red: 'Failing'
};

const HEALTH_REASON_LABELS = {
  last_fetch_success_recent: 'Connected & healthy',
  not_wired: 'Not wired yet',
  disabled_by_env: 'Disabled by environment',
  disabled: 'Disabled',
  last_fetch_error: 'Last fetch failed',
  error_threshold_exceeded: 'Multiple failures',
  never_fetched: 'Pending first fetch',
  stale: 'Data may be stale',
  unknown: 'Unknown status'
};

export function HealthDot({ health, healthReason, size = 8 }) {
  const color = HEALTH_COLORS[health] || HEALTH_COLORS.yellow;
  const label = HEALTH_LABELS[health] || 'Unknown';
  const tooltip = HEALTH_REASON_LABELS[healthReason] || healthReason || label;

  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
      aria-label={label}
      title={tooltip}
    />
  );
}

export { HEALTH_COLORS, HEALTH_LABELS, HEALTH_REASON_LABELS };
