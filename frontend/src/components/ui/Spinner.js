import React from 'react';

/**
 * Spinner
 *
 * A centered loading indicator.
 *
 * Props:
 *   size      — Tailwind size classes for the circle (default 'h-8 w-8')
 *   label     — optional text below the spinner
 *   className — extra classes forwarded to the wrapper <div>
 */
const Spinner = ({ size = 'h-8 w-8', label, className = '' }) => (
  <div className={`flex flex-col items-center justify-center py-6 text-gray-400 ${className}`} aria-busy="true" aria-label={label || 'Loading'}>
    <div
      className={`${size} animate-spin rounded-full border-4 border-blue-600 border-t-transparent`}
    />
    {label ? <p className="text-sm mt-2">{label}</p> : null}
  </div>
);

export default Spinner;
