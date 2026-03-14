import React, { useRef, useEffect } from 'react';

/**
 * CategoryPillBar
 *
 * Horizontally-scrollable sticky strip of category pills.
 * Props:
 *   categories  — array of { key, label, icon, color } from GET /api/news/categories
 *   active      — currently selected category key (null = All)
 *   onChange    — (key | null) => void
 */
const CategoryPillBar = ({ categories = [], active, onChange }) => {
  const scrollRef = useRef(null);
  const activePillRef = useRef(null);

  // Scroll active pill into view on mount / change
  useEffect(() => {
    if (activePillRef.current && scrollRef.current) {
      activePillRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active]);

  const allCategories = [{ key: null, label: 'All', icon: null, color: '#64748b' }, ...categories];

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto scrollbar-hide py-2 px-1 sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100"
      role="tablist"
      aria-label="News categories"
    >
      {allCategories.map(({ key, label, color }) => {
        const isActive = active === key;
        return (
          <button
            key={key ?? '__all__'}
            ref={isActive ? activePillRef : null}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={[
              'flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              isActive
                ? 'text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            ].join(' ')}
            style={isActive ? { backgroundColor: color } : {}}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default CategoryPillBar;
