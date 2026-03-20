import React from 'react';

/**
 * EmptyState
 *
 * Renders a centered "nothing here" placeholder.
 *
 * Props:
 *   icon        — emoji or ReactNode rendered above the title
 *   title       — primary message (string)
 *   description — secondary helper text (string, optional)
 *   action      — ReactNode (e.g. a button) rendered below the description
 *   className   — extra classes forwarded to the wrapper <div>
 */
const EmptyState = ({ icon, title, description, action, className = '' }) => (
  <div className={`text-center py-12 text-gray-400 ${className}`} role="status">
    {icon ? <p className="text-4xl mb-3">{icon}</p> : null}
    {title ? <p className="font-medium text-gray-600">{title}</p> : null}
    {description ? <p className="text-sm mt-1">{description}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export default EmptyState;
