import React, { useEffect, useState, useMemo } from 'react';

const MAX_TOTAL_LOCATIONS = 3;
const MAX_ADDITIONAL_LOCATIONS = 2;

const getLocationGranularityLabel = (location) => {
  const hasZip = Boolean(location.zipCode?.trim());
  const hasCity = Boolean(location.city?.trim());
  const hasState = Boolean(location.state?.trim() || location.stateCode?.trim());
  const hasCountry = Boolean(location.country?.trim());

  if (hasZip || hasCity) return { level: 'local', label: 'Local' };
  if (hasState) return { level: 'regional', label: 'Regional' };
  if (hasCountry) return { level: 'national', label: 'National' };
  return { level: 'unknown', label: 'Unknown' };
};

const GRANULARITY_STYLES = {
  local: 'bg-emerald-100 text-emerald-700',
  regional: 'bg-sky-100 text-sky-700',
  national: 'bg-amber-100 text-amber-700',
  unknown: 'bg-amber-100 text-amber-700',
};

/**
 * Combined Location & Weather settings panel.
 *
 * Merges the old LocationsPanel and WeatherLocationsPanel into a single UI with
 * two sub-sections:
 *   1. News Locations — uses the geocode search bar (formerly weather-only)
 *   2. Weather Locations — same as before
 */
export default function LocationWeatherPanel({
  // News location props
  locations,
  onAddLocation,
  onRemoveLocation,
  onSetPrimaryLocation,
  newLocation,
  setNewLocation,
  locationTaxonomy,
  registrationAlignment,
  // Weather location props
  weatherLocations,
  onSearchWeatherLocations,
  onAddWeatherLocation,
  onRemoveWeatherLocation,
  onSetPrimaryWeatherLocation,
  onReorderWeatherLocations,
  weatherStatusMessage,
  setWeatherStatusMessage,
}) {
  const [section, setSection] = useState('news'); // 'news' | 'weather'

  // ── Shared geocode search state ──────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  // For the old form-based approach (fallback for news locations)
  const [showManualForm, setShowManualForm] = useState(false);
  const [addLocationError, setAddLocationError] = useState('');
  const [addLocationSuccess, setAddLocationSuccess] = useState('');

  const primaryLocation = useMemo(() => {
    return locations?.find((loc) => loc.isPrimary) || locations?.[0] || null;
  }, [locations]);

  const additionalLocationsCount = useMemo(() => {
    if (!locations || locations.length === 0) return 0;
    return primaryLocation ? locations.length - 1 : locations.length;
  }, [locations, primaryLocation]);

  const canAddMoreLocations = additionalLocationsCount < MAX_ADDITIONAL_LOCATIONS;
  const states = Array.isArray(locationTaxonomy?.states) ? locationTaxonomy.states : [];
  const cityOptions = newLocation.stateCode
    ? (locationTaxonomy?.citiesByState?.[newLocation.stateCode] || [])
    : [];

  // ── Debounced geocode search ──────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSuggestions([]);
      setSearchError('');
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const result = await onSearchWeatherLocations(searchQuery.trim());
        if (!active) return;
        setSuggestions(result || []);
        setSearchError('');
      } catch {
        if (!active) return;
        setSuggestions([]);
        setSearchError('Unable to search locations right now.');
      } finally {
        if (active) setSearching(false);
      }
    }, 250);

    return () => { active = false; clearTimeout(timer); };
  }, [searchQuery, onSearchWeatherLocations]);

  // ── News location handlers ────────────────────────────────────────────────
  const handleAddNewsLocationFromSuggestion = (suggestion) => {
    if (!canAddMoreLocations) {
      setAddLocationError(`Maximum ${MAX_TOTAL_LOCATIONS} locations allowed.`);
      setTimeout(() => setAddLocationError(''), 3000);
      return;
    }
    onAddLocation({
      city: suggestion.city || '',
      cityKey: suggestion.city && suggestion.state
        ? `${(suggestion.state || '').substring(0, 2).toUpperCase()}:${(suggestion.city || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
        : '',
      zipCode: '',
      state: suggestion.state || '',
      stateCode: suggestion.state ? (suggestion.state.length === 2 ? suggestion.state : '') : '',
      country: suggestion.country || 'United States',
      countryCode: suggestion.countryCode || 'US',
      isPrimary: !primaryLocation,
    });
    setSearchQuery('');
    setSuggestions([]);
    setAddLocationSuccess('Location added.');
    setTimeout(() => setAddLocationSuccess(''), 3000);
  };

  const handleStateChange = (value) => {
    const selectedState = states.find((s) => s.code === value);
    setNewLocation({ ...newLocation, stateCode: value, state: selectedState?.name || '', city: '', cityKey: '' });
  };

  const handleCityChange = (value) => {
    const normalized = String(value || '').trim();
    setNewLocation({
      ...newLocation,
      city: normalized,
      cityKey: normalized && newLocation.stateCode
        ? `${newLocation.stateCode}:${normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
        : '',
    });
  };

  const handleManualAdd = (e) => {
    e.preventDefault();
    setAddLocationError('');
    setAddLocationSuccess('');
    if (!canAddMoreLocations) {
      setAddLocationError(`Maximum ${MAX_TOTAL_LOCATIONS} locations allowed.`);
      return;
    }
    const hasZip = Boolean(newLocation.zipCode?.trim());
    const hasCity = Boolean(newLocation.city?.trim());
    const hasState = Boolean(newLocation.stateCode?.trim());
    if (!hasZip && !hasCity) { setAddLocationError('Enter a ZIP code or select a city.'); return; }
    if (hasCity && !hasState) { setAddLocationError('Select a state for the city.'); return; }
    onAddLocation(newLocation);
    setAddLocationSuccess('Location added.');
    setTimeout(() => setAddLocationSuccess(''), 3000);
  };

  // ── Weather handlers ──────────────────────────────────────────────────────
  const handleAddWeatherSuggestion = async (suggestion) => {
    await onAddWeatherLocation({
      label: suggestion.label,
      city: suggestion.city,
      state: suggestion.state,
      country: suggestion.country,
      countryCode: suggestion.countryCode,
      lat: suggestion.latitude,
      lon: suggestion.longitude,
      timezone: suggestion.timezone,
    });
    setSearchQuery('');
    setSuggestions([]);
  };

  const moveWeatherLocation = async (index, direction) => {
    const next = index + direction;
    if (next < 0 || next >= (weatherLocations || []).length) return;
    const copy = [...(weatherLocations || [])];
    const temp = copy[index];
    copy[index] = copy[next];
    copy[next] = temp;
    await onReorderWeatherLocations(copy);
  };

  const handleSuggestionClick = (suggestion) => {
    if (section === 'news') handleAddNewsLocationFromSuggestion(suggestion);
    else handleAddWeatherSuggestion(suggestion);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5" data-testid="location-weather-panel">
      {/* Section toggle */}
      <div className="flex items-center gap-2">
        {['news', 'weather'].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => { setSection(id); setSearchQuery(''); setSuggestions([]); }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              section === id
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] leading-none">
              {id === 'news' ? 'location_on' : 'partly_cloudy_day'}
            </span>
            {id === 'news' ? 'News Locations' : 'Weather Locations'}
          </button>
        ))}
      </div>

      {/* Shared search bar (geocode-powered) */}
      <div className="space-y-2">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search city, zip code, or coordinates…"
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
            data-testid="location-search-input"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            </div>
          )}
        </div>

        {searchError && <p className="text-xs text-red-500">{searchError}</p>}

        {suggestions.length > 0 && (
          <div className="rounded-xl ring-1 ring-slate-200 bg-white max-h-48 overflow-y-auto shadow-lg" data-testid="location-suggestions">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSuggestionClick(s)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-100 last:border-b-0 transition-colors"
              >
                <p className="text-sm text-slate-800">{s.label}</p>
                <p className="text-[11px] text-slate-500">
                  {s.latitude?.toFixed?.(4)}, {s.longitude?.toFixed?.(4)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status messages */}
      {addLocationSuccess && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
          {addLocationSuccess}
        </div>
      )}
      {addLocationError && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-100">
          {addLocationError}
        </div>
      )}
      {weatherStatusMessage && section === 'weather' && (
        <button
          type="button"
          className="text-xs text-emerald-700 bg-emerald-50 ring-1 ring-emerald-100 px-2 py-1 rounded"
          onClick={() => setWeatherStatusMessage('')}
        >
          {weatherStatusMessage}
        </button>
      )}

      {/* ── News Locations section ──────────────────────────────────────────── */}
      {section === 'news' && (
        <div className="space-y-3">
          {registrationAlignment?.needsConfirmation && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-semibold">Location verification needed</p>
              <p className="mt-1">{registrationAlignment.message}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Saved Locations</span>
            <span className="text-xs text-slate-400">{locations?.length || 0}/{MAX_TOTAL_LOCATIONS}</span>
          </div>

          {/* Primary location */}
          {primaryLocation && (
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500">Primary</p>
                  <p className="text-sm text-slate-900 truncate">
                    {[primaryLocation.city, primaryLocation.zipCode, primaryLocation.state, primaryLocation.country].filter(Boolean).join(', ') || 'Unknown'}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${GRANULARITY_STYLES[getLocationGranularityLabel(primaryLocation).level]}`}>
                  {getLocationGranularityLabel(primaryLocation).label}
                </span>
              </div>
            </div>
          )}

          {/* Additional locations */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {locations?.filter((l) => l !== primaryLocation).map((loc) => {
              const parts = [loc.city, loc.zipCode, loc.state, loc.country].filter(Boolean);
              const gran = getLocationGranularityLabel(loc);
              return (
                <div key={loc._id} className="flex items-center justify-between px-3 py-2 bg-white rounded-xl text-sm ring-1 ring-slate-200 hover:ring-slate-300 transition-colors">
                  <div className="min-w-0 flex-1">
                    <span className="text-slate-700 truncate block">{parts.join(', ') || 'Unknown'}</span>
                    <span className={`text-[10px] ${gran.level === 'local' ? 'text-emerald-600' : gran.level === 'regional' ? 'text-sky-600' : 'text-amber-600'}`}>
                      {gran.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onSetPrimaryLocation(loc._id)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold"
                    >
                      Set Primary
                    </button>
                    <button
                      onClick={() => onRemoveLocation(loc._id)}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      aria-label={`Remove location ${parts.join(', ')}`}
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                </div>
              );
            })}
            {(!locations || locations.length === 0) && (
              <p className="text-sm text-slate-400 text-center py-3">No locations added yet. Use the search bar above to add one.</p>
            )}
          </div>

          {/* Manual form toggle */}
          <button
            type="button"
            onClick={() => setShowManualForm(!showManualForm)}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          >
            {showManualForm ? 'Hide manual entry' : 'Or add manually by state/city/ZIP'}
          </button>

          {showManualForm && (
            <form onSubmit={handleManualAdd} className="space-y-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newLocation.stateCode}
                  onChange={(e) => handleStateChange(e.target.value)}
                  disabled={!canAddMoreLocations}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none disabled:opacity-50"
                >
                  <option value="">Select state</option>
                  {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
                <input
                  type="text"
                  value={newLocation.city}
                  list="news-location-city-options"
                  onChange={(e) => handleCityChange(e.target.value)}
                  placeholder={newLocation.stateCode ? 'City' : 'Select state first'}
                  disabled={!newLocation.stateCode || !canAddMoreLocations}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none disabled:opacity-50"
                />
                <datalist id="news-location-city-options">
                  {cityOptions.map((c) => <option key={c} value={c} />)}
                </datalist>
                <input
                  type="text"
                  value={newLocation.zipCode}
                  onChange={(e) => setNewLocation({ ...newLocation, zipCode: e.target.value })}
                  placeholder="ZIP code"
                  disabled={!canAddMoreLocations}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none disabled:opacity-50"
                />
                <input
                  type="text"
                  value={locationTaxonomy?.country?.name || 'United States'}
                  readOnly
                  className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={newLocation.isPrimary}
                    onChange={(e) => setNewLocation({ ...newLocation, isPrimary: e.target.checked })}
                    disabled={!canAddMoreLocations}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  Set as primary
                </label>
                <button
                  type="submit"
                  disabled={!canAddMoreLocations}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Weather Locations section ───────────────────────────────────────── */}
      {section === 'weather' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Saved Weather Locations</span>
            <span className="text-xs text-slate-400">{weatherLocations?.length || 0} saved</span>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(weatherLocations || []).map((loc, index) => (
              <div key={loc._id || `${loc.label}-${index}`} className="rounded-xl ring-1 ring-slate-200 bg-white p-3 hover:ring-slate-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{loc.label || [loc.city, loc.state, loc.country].filter(Boolean).join(', ') || 'Weather location'}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon)) ? `${Number(loc.lat).toFixed(4)}, ${Number(loc.lon).toFixed(4)}` : 'Coordinates pending'}
                    </p>
                    {loc.isPrimary && <p className="text-[11px] text-indigo-600 font-semibold mt-0.5">Primary</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => moveWeatherLocation(index, -1)} className="px-1.5 py-1 text-xs rounded bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="Move up">↑</button>
                    <button type="button" onClick={() => moveWeatherLocation(index, 1)} className="px-1.5 py-1 text-xs rounded bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="Move down">↓</button>
                    {!loc.isPrimary && (
                      <button type="button" onClick={() => onSetPrimaryWeatherLocation(loc._id)} className="px-2 py-1 text-[11px] rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold">Primary</button>
                    )}
                    <button type="button" onClick={() => onRemoveWeatherLocation(loc._id)} className="px-2 py-1 text-[11px] rounded bg-red-50 text-red-600 hover:bg-red-100 font-semibold">Remove</button>
                  </div>
                </div>
              </div>
            ))}

            {(!weatherLocations || weatherLocations.length === 0) && (
              <p className="text-sm text-slate-400 text-center py-4">No weather locations yet. Use the search bar above to add one.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
