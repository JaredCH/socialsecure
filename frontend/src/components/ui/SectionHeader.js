import React from 'react';

/**
 * SectionHeader
 *
 * Renders an uppercase-tracked section title with optional subtitle and action slot.
 *
 * Props:
 *   title     — primary heading text
 *   subtitle  — optional secondary text
 *   icon      — emoji or ReactNode prefix
 *   action    — ReactNode (e.g. badge or button) rendered to the right
 *   as        — wrapper element type ('h2', 'h3', 'p', etc.) — default 'h2'
 *   className — extra classes
 */
const SectionHeader = ({
  title,
  subtitle,
  icon,
  action,
  as: Tag = 'h2',
  className = '',
}) => (
  <div className={`flex items-center justify-between mb-3 ${className}`}>
    <div>
      <Tag className="text-xs font-bold text-gray-500 uppercase tracking-wider">
        {icon ? <>{icon}{' '}</> : null}
        {title}
      </Tag>
      {subtitle ? (
        <span className="ml-2 text-[11px] text-gray-400">{subtitle}</span>
      ) : null}
    </div>
    {action ?? null}
  </div>
);

export default SectionHeader;
