import React from 'react';

/**
 * LoadMoreButton
 *
 * A "Load more" pagination button styled consistently across all surfaces.
 *
 * Props:
 *   onClick   — handler
 *   loading   — when true the button is hidden (caller renders Spinner instead)
 *   hasMore   — when false the button is hidden
 *   label     — button text (default "Load more")
 *   className — extra classes forwarded to the wrapper <div>
 */
const LoadMoreButton = ({
  onClick,
  loading = false,
  hasMore = true,
  label = 'Load more',
  className = '',
}) => {
  if (!hasMore || loading) return null;

  return (
    <div className={`mt-4 text-center ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="min-h-[44px] px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
      >
        {label}
      </button>
    </div>
  );
};

export default LoadMoreButton;
