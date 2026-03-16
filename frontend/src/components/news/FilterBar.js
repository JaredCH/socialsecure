import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * FilterBar — compact sticky filter strip.
 *
 * Props:
 *   categories        {Array}    — [{ key, label }]
 *   activeCategory    {string}   — current active category key (null = All)
 *   onCategoryChange  {Function} — (key|null) => void
 *   onSearch          {Function} — (query) => void
 *   onRegionChange    {Function} — ({ country, state, city }) => void
 *   onDateChange      {Function} — (range) => void  range = '24h'|'48h'|'week'|'all'
 *   activeRegion      {object}   — current region filter
 *   activeDate        {string}   — current date filter
 *   className         {string}
 */

const DATE_OPTIONS = [
  { value: 'all',  label: 'Any time' },
  { value: '24h',  label: 'Last 24h' },
  { value: '48h',  label: 'Last 48h' },
  { value: 'week', label: 'This week' },
];

function Dropdown({ label, children, icon }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative z-30" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          open
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-600'
        }`}
      >
        {icon && <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">{icon}</span>}
        {label}
        <span className={`material-symbols-outlined text-sm leading-none transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">expand_more</span>
      </button>
      {open && (
        <div data-testid="filter-dropdown-menu" className="absolute top-full mt-1 left-0 z-[70] bg-white rounded-xl shadow-xl ring-1 ring-gray-200 min-w-[200px] overflow-hidden">
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

const NON_STATE_CODES = new Set(['AS', 'DC', 'GU', 'MP', 'PR', 'VI']);

const getRegionStateLabel = (activeRegion, statesByCode) => {
  const stateCode = String(activeRegion?.state || '').trim().toUpperCase();
  if (activeRegion?.stateName) return activeRegion.stateName;
  if (statesByCode.has(stateCode)) return statesByCode.get(stateCode).name;
  return activeRegion?.state || '';
};

// ─── Region drill-down dropdown ───────────────────────────────────────────────
function RegionDropdown({ activeRegion, onRegionChange, locationTaxonomy }) {
  const states = useMemo(
    () => (Array.isArray(locationTaxonomy?.states) ? locationTaxonomy.states : [])
      .filter((state) => state?.code && state?.name && !NON_STATE_CODES.has(state.code))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [locationTaxonomy]
  );
  const statesByCode = useMemo(
    () => new Map(states.map((state) => [state.code, state])),
    [states]
  );
  const preferredStateCode = String(locationTaxonomy?.preferredStateCode || '').trim().toUpperCase();
  const preferredState = statesByCode.get(preferredStateCode) || null;
  const otherStates = useMemo(
    () => states.filter((state) => state.code !== preferredStateCode),
    [preferredStateCode, states]
  );
  const [expandedStateCode, setExpandedStateCode] = useState(
    String(activeRegion?.state || preferredStateCode || '').trim().toUpperCase()
  );

  useEffect(() => {
    const nextExpandedState = String(activeRegion?.state || preferredStateCode || '').trim().toUpperCase();
    setExpandedStateCode(nextExpandedState);
  }, [activeRegion, preferredStateCode]);

  const regionStateLabel = getRegionStateLabel(activeRegion, statesByCode);
  const regionLabel = activeRegion?.city
    ? `${activeRegion.city}${regionStateLabel ? `, ${regionStateLabel}` : ''}`
    : regionStateLabel
    ? regionStateLabel
    : 'Region';

  const renderStateRow = (state, close) => {
    const cityOptions = locationTaxonomy?.citiesByState?.[state.code] || [];
    const isExpanded = expandedStateCode === state.code;
    const isSelectedState = String(activeRegion?.state || '').trim().toUpperCase() === state.code && !activeRegion?.city;

    return (
      <div key={state.code} className="border-t border-slate-100 first:border-t-0">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <button
            type="button"
            data-testid={`region-state-option-${state.code}`}
            className={`flex-1 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
              isSelectedState
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
            }`}
            onClick={() => {
              onRegionChange({
                country: 'US',
                state: state.code,
                stateName: state.name,
              });
              close();
            }}
          >
            <span className="block">{state.name}</span>
            <span className="block text-[10px] font-normal text-slate-400">{state.code}</span>
          </button>
          {cityOptions.length > 0 && (
            <button
              type="button"
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} cities for ${state.name}`}
              className={`rounded-lg border px-2 py-2 text-slate-500 transition-colors ${
                isExpanded
                  ? 'border-blue-200 bg-blue-50 text-blue-600'
                  : 'border-slate-200 hover:border-slate-300 hover:text-slate-700'
              }`}
              onClick={() => {
                setExpandedStateCode((current) => current === state.code ? '' : state.code);
              }}
            >
              <span
                className={`material-symbols-outlined text-base leading-none transition-transform ${
                  isExpanded ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              >
                expand_more
              </span>
            </button>
          )}
        </div>
        {isExpanded && cityOptions.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/70 px-2 py-2">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Cities with news
            </p>
            <div className="max-h-40 overflow-y-auto">
              {cityOptions.map((city) => {
                const isSelectedCity = String(activeRegion?.state || '').trim().toUpperCase() === state.code
                  && activeRegion?.city === city;
                return (
                  <button
                    key={`${state.code}-${city}`}
                    type="button"
                    data-testid={`region-city-option-${state.code}-${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    className={`block w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      isSelectedCity
                        ? 'bg-blue-600 font-medium text-white'
                        : 'text-slate-700 hover:bg-white hover:text-slate-900'
                    }`}
                    onClick={() => {
                      onRegionChange({
                        country: 'US',
                        state: state.code,
                        stateName: state.name,
                        city,
                      });
                      close();
                    }}
                  >
                    {city}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dropdown label={regionLabel} icon="location_on">
      {({ close }) => (
        <div className="w-[18rem]">
          <div className="border-b border-slate-200 px-3 py-3">
            <p className="text-xs font-semibold text-slate-900">Filter by Region</p>
            <p className="mt-1 text-[11px] text-slate-500">Choose a state or expand one to pick a city with local coverage.</p>
          </div>
          <div className="border-b border-slate-100 px-2 py-2">
            <button
              type="button"
              className={`block w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                !activeRegion ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`}
              onClick={() => {
                onRegionChange(null);
                close();
              }}
            >
              All U.S. regions
            </button>
          </div>
          <div className="max-h-[24rem] overflow-y-auto">
            {preferredState && (
              <div>
                <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Near you
                </div>
                {renderStateRow(preferredState, close)}
                <div data-testid="region-preferred-divider" className="mx-3 border-t border-slate-200" />
              </div>
            )}
            {otherStates.map((state) => renderStateRow(state, close))}
          </div>
        </div>
      )}
    </Dropdown>
  );
}

// ─── Main FilterBar ───────────────────────────────────────────────────────────
export default function FilterBar({
  categories = [],
  activeCategory,
  onCategoryChange,
  onSearch,
  searchValue = '',
  onRegionChange,
  onDateChange,
  activeRegion,
  activeDate = 'all',
  locationTaxonomy,
  className = '',
}) {
  const activeDateLabel = DATE_OPTIONS.find((o) => o.value === activeDate)?.label || 'Any time';
  const activeCatLabel = activeCategory
    ? (categories.find((c) => c.key === activeCategory)?.label || activeCategory)
    : 'All';

  return (
    <div className={`relative z-30 bg-white/95 backdrop-blur border-b border-gray-100 px-3 py-2 ${className}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-400">
          <span className="material-symbols-outlined text-base text-gray-400 leading-none shrink-0" aria-hidden="true">search</span>
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearch?.(e.target.value)}
            placeholder="Search news…"
            className="flex-1 bg-transparent text-xs outline-none text-gray-700 placeholder-gray-400 min-w-0"
          />
          {searchValue && (
            <button
              onClick={() => onSearch?.('')}
              className="text-gray-400 hover:text-gray-600 leading-none"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined text-sm leading-none">close</span>
            </button>
          )}
        </div>

        {/* Category dropdown */}
        <Dropdown label={activeCatLabel} icon="category">
          {({ close }) => (
            <div className="py-1 max-h-64 overflow-y-auto">
              <button
                className={`w-full text-left text-xs px-3 py-2 hover:bg-gray-50 ${!activeCategory ? 'font-semibold text-blue-600' : 'text-gray-700'}`}
                onClick={() => { onCategoryChange(null); close(); }}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  className={`w-full text-left text-xs px-3 py-2 hover:bg-gray-50 flex items-center gap-2 ${
                    activeCategory === cat.key ? 'font-semibold text-blue-600' : 'text-gray-700'
                  }`}
                  onClick={() => { onCategoryChange(cat.key); close(); }}
                >
                  <span className="w-4 text-center">{cat.icon || ''}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </Dropdown>

        {/* Region dropdown */}
        <RegionDropdown
          activeRegion={activeRegion}
          onRegionChange={onRegionChange}
          locationTaxonomy={locationTaxonomy}
        />

        {/* Date dropdown */}
        <Dropdown label={activeDateLabel} icon="calendar_today">
          {({ close }) => (
            <div className="py-1">
              {DATE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`w-full text-left text-xs px-3 py-2 hover:bg-gray-50 ${
                    activeDate === opt.value ? 'font-semibold text-blue-600' : 'text-gray-700'
                  }`}
                  onClick={() => { onDateChange?.(opt.value); close(); }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </Dropdown>
      </div>
    </div>
  );
}
