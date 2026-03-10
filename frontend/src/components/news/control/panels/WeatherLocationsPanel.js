import React, { useEffect, useState } from 'react';

export default function WeatherLocationsPanel({
  locations,
  onSearchLocations,
  onAddLocation,
  onRemoveLocation,
  onSetPrimary,
  onReorder,
  statusMessage,
  setStatusMessage
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setSearchError('');
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const result = await onSearchLocations(query.trim());
        if (!active) return;
        setSuggestions(result || []);
        setSearchError('');
      } catch (error) {
        if (!active) return;
        setSuggestions([]);
        setSearchError('Unable to search locations right now.');
      } finally {
        if (active) setSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, onSearchLocations]);

  const handleAddSuggestion = async (suggestion) => {
    await onAddLocation({
      label: suggestion.label,
      city: suggestion.city,
      state: suggestion.state,
      country: suggestion.country,
      countryCode: suggestion.countryCode,
      lat: suggestion.latitude,
      lon: suggestion.longitude,
      timezone: suggestion.timezone
    });
    setQuery('');
    setSuggestions([]);
  };

  const moveLocation = async (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= (locations || []).length) return;
    const copy = [...(locations || [])];
    const temp = copy[index];
    copy[index] = copy[nextIndex];
    copy[nextIndex] = temp;
    await onReorder(copy);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Weather Monitoring Locations</h3>
        <span className="text-xs text-gray-400">{locations?.length || 0} saved</span>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search city, zip, or coordinates"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />

        {searching && <p className="text-xs text-gray-500">Searching Open-Meteo locations...</p>}
        {searchError && <p className="text-xs text-red-500">{searchError}</p>}

        {suggestions.length > 0 && (
          <div className="rounded-xl ring-1 ring-gray-200 bg-white max-h-48 overflow-y-auto">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => handleAddSuggestion(suggestion)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
              >
                <p className="text-sm text-gray-800">{suggestion.label}</p>
                <p className="text-[11px] text-gray-500">{suggestion.latitude?.toFixed?.(4)}, {suggestion.longitude?.toFixed?.(4)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {statusMessage && (
        <button
          type="button"
          className="text-xs text-emerald-700 bg-emerald-50 ring-1 ring-emerald-100 px-2 py-1 rounded"
          onClick={() => setStatusMessage('')}
        >
          {statusMessage}
        </button>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {(locations || []).map((loc, index) => (
          <div key={loc._id || `${loc.label}-${index}`} className="rounded-xl ring-1 ring-gray-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{loc.label || [loc.city, loc.state, loc.country].filter(Boolean).join(', ') || 'Weather location'}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon)) ? `${Number(loc.lat).toFixed(4)}, ${Number(loc.lon).toFixed(4)}` : 'Coordinates pending'}
                </p>
                {loc.isPrimary && <p className="text-[11px] text-indigo-600 font-semibold mt-0.5">Primary</p>}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => moveLocation(index, -1)} className="px-1.5 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200" aria-label="Move up">↑</button>
                <button type="button" onClick={() => moveLocation(index, 1)} className="px-1.5 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200" aria-label="Move down">↓</button>
                {!loc.isPrimary && (
                  <button type="button" onClick={() => onSetPrimary(loc._id)} className="px-2 py-1 text-xs rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100">Primary</button>
                )}
                <button type="button" onClick={() => onRemoveLocation(loc._id)} className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100">Remove</button>
              </div>
            </div>
          </div>
        ))}

        {(!locations || locations.length === 0) && (
          <p className="text-sm text-gray-400 text-center py-3">No weather locations yet. Search and add one above.</p>
        )}
      </div>
    </div>
  );
}
