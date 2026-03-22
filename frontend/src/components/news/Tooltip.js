import React, { useState } from 'react';

/**
 * Tooltip — A simple hover tooltip matching the news theme.
 * Wraps any element and shows a small dark popup.
 */
export default function Tooltip({ text, children, position = 'top' }) {
  const [visible, setVisible] = useState(false);

  if (!text) return <>{children}</>;

  const posClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div 
      className="relative flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div 
          className={`absolute z-[2000] px-2 py-1 bg-[var(--bg4)] border border-[var(--border2)] rounded-[4px] shadow-lg pointer-events-none whitespace-nowrap overflow-visible ${posClasses[position]}`}
          style={{ animation: 'popIn 0.15s ease-out' }}
        >
          <div className="text-[9px] font-[var(--mono)] text-[var(--text2)] uppercase tracking-[1px]">
            {text}
          </div>
          {/* Arrow */}
          <div 
            className={`absolute w-0 h-0 border-4 border-transparent ${
              position === 'top' ? 'top-full left-1/2 -translate-x-1/2 border-t-[var(--border2)]' :
              position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 border-b-[var(--border2)]' :
              position === 'left' ? 'left-full top-1/2 -translate-y-1/2 border-l-[var(--border2)]' :
              'right-full top-1/2 -translate-y-1/2 border-r-[var(--border2)]'
            }`}
          />
        </div>
      )}
    </div>
  );
}
