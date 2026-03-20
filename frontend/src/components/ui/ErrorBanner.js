import React from 'react';

/**
 * ErrorBanner
 *
 * Renders a styled error message block.
 *
 * Props:
 *   message   — error text (if falsy, nothing renders)
 *   action    — optional ReactNode (e.g. retry button) rendered inline-end
 *   className — extra classes forwarded to the wrapper <div>
 */
const ErrorBanner = ({ message, action, className = '' }) => {
  if (!message) return null;

  return (
    <div
      className={`mb-4 p-3 rounded bg-red-50 text-red-700 border border-red-200 flex items-center justify-between ${className}`}
      role="alert"
    >
      <span>{message}</span>
      {action ?? null}
    </div>
  );
};

export default ErrorBanner;
