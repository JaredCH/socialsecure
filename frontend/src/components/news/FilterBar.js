import React, { useEffect, useRef, useState } from 'react';
import { newsAPI } from '../../utils/api';

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
        <div className="absolute top-full mt-1 left-0 z-[70] bg-white rounded-xl shadow-xl ring-1 ring-gray-200 min-w-[200px] overflow-hidden">
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

// ─── Region drill-down dropdown ───────────────────────────────────────────────
function RegionDropdown({ activeRegion, onRegionChange }) {
  const [country, setCountry] = useState(activeRegion?.country || 'US');
  const [stateVal, setStateVal] = useState(activeRegion?.state || '');
  const [cityVal, setCityVal] = useState(activeRegion?.city || '');
  const [citySuggestions, setCitySuggestions] = useState([]);
  const debounceRef = useRef(null);

  const onCityInput = (val) => {
    setCityVal(val);
    clearTimeout(debounceRef.current);
    if (val.length < 2) { setCitySuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const q = stateVal ? `${val}, ${stateVal}` : val;
        const r = await newsAPI.geocodeWeatherLocations(q);
        setCitySuggestions(r.data?.suggestions || []);
      } catch { /* silent */ }
    }, 300);
  };

  const regionLabel = activeRegion?.city
    ? `${activeRegion.city}${activeRegion.state ? `, ${activeRegion.state}` : ''}`
    : activeRegion?.state
    ? activeRegion.state
    : activeRegion?.country && activeRegion.country !== 'US'
    ? activeRegion.country
    : 'Region';

  return (
    <Dropdown label={regionLabel} icon="location_on">
      {({ close }) => (
        <div className="p-3 space-y-2 w-64">
          <p className="text-xs font-semibold text-gray-700 mb-1">Filter by Region</p>
          {/* Country */}
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Country</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="US"
            />
          </div>
          {/* State */}
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">State / Province</label>
            <input
              type="text"
              value={stateVal}
              onChange={(e) => setStateVal(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. TX"
            />
          </div>
          {/* City with autocomplete */}
          <div className="relative">
            <label className="block text-[10px] text-gray-500 mb-0.5">City</label>
            <input
              type="text"
              value={cityVal}
              onChange={(e) => onCityInput(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Type a city name…"
            />
            {citySuggestions.length > 0 && (
              <ul className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-md mt-0.5 max-h-36 overflow-y-auto">
                {citySuggestions.slice(0, 5).map((s, i) => (
                  <li key={i}>
                    <button
                      className="w-full text-left text-xs px-2 py-1.5 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => {
                        setCityVal(s.name || s.label || '');
                        if (s.admin1 && !stateVal) setStateVal(s.admin1);
                        if (s.country_code && !country) setCountry(s.country_code);
                        setCitySuggestions([]);
                      }}
                    >
                      {s.name || s.label}{s.admin1 ? `, ${s.admin1}` : ''}{s.country_code ? ` (${s.country_code})` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              className="flex-1 text-xs bg-blue-600 text-white rounded-lg py-1.5 font-medium hover:bg-blue-700"
              onClick={() => {
                onRegionChange({ country: country || undefined, state: stateVal || undefined, city: cityVal || undefined });
                close();
              }}
            >
              Apply
            </button>
            <button
              className="flex-1 text-xs bg-gray-100 text-gray-600 rounded-lg py-1.5 font-medium hover:bg-gray-200"
              onClick={() => {
                setCountry('US'); setStateVal(''); setCityVal('');
                onRegionChange(null);
                close();
              }}
            >
              Clear
            </button>
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
        <RegionDropdown activeRegion={activeRegion} onRegionChange={onRegionChange} />

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
