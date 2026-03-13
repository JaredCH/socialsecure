import React, { useState, useMemo } from 'react';

const MAX_TOTAL_LOCATIONS = 3;
const MAX_ADDITIONAL_LOCATIONS = 2;

const validateLocationInput = (location) => {
  const errors = [];
  const hasZip = Boolean(location.zipCode?.trim());
  const hasCity = Boolean(location.city?.trim());
  const hasState = Boolean(location.stateCode?.trim());
  
  // Require at least ZIP or (city + state)
  if (!hasZip && !hasCity) {
    errors.push('Enter a ZIP code or select a city.');
  }
  if (hasCity && !hasState) {
    errors.push('Select a state for the city.');
  }
  
  // Reject country-only entries
  if (!hasZip && !hasCity && !hasState) {
    errors.push('Location must include at least a ZIP code or city and state.');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const getLocationGranularityLabel = (location) => {
  const hasZip = Boolean(location.zipCode?.trim());
  const hasCity = Boolean(location.city?.trim());
  const hasState = Boolean(location.state?.trim() || location.stateCode?.trim());
  const hasCountry = Boolean(location.country?.trim());
  
  if (hasZip || hasCity) return { level: 'local', label: 'Local precision' };
  if (hasState) return { level: 'regional', label: 'Regional precision' };
  if (hasCountry) return { level: 'national', label: 'National only' };
  return { level: 'unknown', label: 'Unknown' };
};

export default function LocationsPanel({
  locations,
  onAddLocation,
  onRemoveLocation,
  onSetPrimaryLocation,
  newLocation,
  setNewLocation,
  locationTaxonomy,
  registrationAlignment
}) {
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
  const remainingSlots = MAX_ADDITIONAL_LOCATIONS - additionalLocationsCount;
  const states = Array.isArray(locationTaxonomy?.states) ? locationTaxonomy.states : [];
  const cityOptions = newLocation.stateCode
    ? (locationTaxonomy?.citiesByState?.[newLocation.stateCode] || [])
    : [];

  const handleStateChange = (value) => {
    const selectedState = states.find((state) => state.code === value);
    setNewLocation({
      ...newLocation,
      stateCode: value,
      state: selectedState?.name || '',
      city: '',
      cityKey: ''
    });
  };

  const handleCityChange = (value) => {
    const normalized = String(value || '').trim();
    setNewLocation({
      ...newLocation,
      city: normalized,
      cityKey: normalized && newLocation.stateCode
        ? `${newLocation.stateCode}:${normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
        : ''
    });
  };

  const handleAddLocation = (e) => {
    e.preventDefault();
    setAddLocationError('');
    setAddLocationSuccess('');
    
    // Check location limit
    if (!canAddMoreLocations) {
      setAddLocationError(`Maximum ${MAX_TOTAL_LOCATIONS} locations allowed (${MAX_ADDITIONAL_LOCATIONS} additional beyond primary).`);
      return;
    }
    
    // Validate input format
    const validation = validateLocationInput(newLocation);
    if (!validation.isValid) {
      setAddLocationError(validation.errors.join(' '));
      return;
    }
    
    onAddLocation(newLocation);
    setAddLocationSuccess('Location added successfully.');
    setTimeout(() => setAddLocationSuccess(''), 3000);
  };
  
  const primaryGranularity = primaryLocation ? getLocationGranularityLabel(primaryLocation) : null;
  const showInsufficiencyWarning = primaryGranularity?.level === 'national' || primaryGranularity?.level === 'unknown';
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Location Preferences</h3>
        <span className="text-xs text-gray-400">{locations?.length || 0}/{MAX_TOTAL_LOCATIONS} locations</span>
      </div>

      {registrationAlignment?.needsConfirmation && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">Location verification needed</p>
          <p className="mt-1">{registrationAlignment.message}</p>
        </div>
      )}
      
      {/* Primary location clarity and insufficiency warning */}
      {primaryLocation && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-700">Primary Location</p>
              <p className="text-sm text-gray-900">
                {[primaryLocation.city, primaryLocation.zipCode, primaryLocation.state, primaryLocation.country].filter(Boolean).join(', ') || 'Unknown'}
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded font-medium ${
              primaryGranularity?.level === 'local' ? 'bg-emerald-100 text-emerald-700' :
              primaryGranularity?.level === 'regional' ? 'bg-sky-100 text-sky-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {primaryGranularity?.label}
            </span>
          </div>
          {showInsufficiencyWarning && (
            <div className="mt-2 flex items-start gap-2 text-amber-800">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs">
                Your primary location is too broad for local news precision. Add a ZIP code or city/state to receive local news.
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Location limit indicator */}
      {!canAddMoreLocations && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
          <p className="font-semibold">Location limit reached</p>
          <p className="mt-1">Maximum {MAX_TOTAL_LOCATIONS} locations allowed ({MAX_ADDITIONAL_LOCATIONS} additional beyond primary).</p>
        </div>
      )}
      {canAddMoreLocations && remainingSlots > 0 && (
        <p className="text-xs text-gray-500">You can add {remainingSlots} more location{remainingSlots > 1 ? 's' : ''}.</p>
      )}

      {/* Existing locations */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {locations?.map((loc) => {
          const parts = [loc.city, loc.zipCode, loc.county, loc.state, loc.country].filter(Boolean);
          const granularity = getLocationGranularityLabel(loc);
          return (
            <div key={loc._id} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg text-sm ring-1 ring-gray-200">
              <div className="min-w-0 flex-1">
                <span className="text-gray-700 truncate block">
                  {parts.join(', ') || 'Unknown'}
                </span>
                <span className={`text-[10px] ${
                  granularity?.level === 'local' ? 'text-emerald-600' :
                  granularity?.level === 'regional' ? 'text-sky-600' :
                  'text-amber-600'
                }`}>
                  {granularity?.label}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {loc.isPrimary ? (
                  <span className="text-xs text-indigo-600 font-semibold">Primary</span>
                ) : (
                  <button
                    onClick={() => onSetPrimaryLocation(loc._id)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Set Primary
                  </button>
                )}
                <button
                  onClick={() => onRemoveLocation(loc._id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  aria-label={`Remove location ${parts.join(', ')}`}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
        {(!locations || locations.length === 0) && (
          <p className="text-sm text-gray-400 text-center py-2">No locations added yet.</p>
        )}
      </div>

      {/* Add location form */}
      <form onSubmit={handleAddLocation} className="space-y-3 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 font-medium">Add New Location</p>
          {!canAddMoreLocations && (
            <span className="text-xs text-amber-600 font-medium">Limit reached</span>
          )}
        </div>
        
        {addLocationError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <p className="font-semibold">Invalid location</p>
            <p className="mt-1">{addLocationError}</p>
          </div>
        )}
        
        {addLocationSuccess && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {addLocationSuccess}
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-2">
          <select
            value={newLocation.stateCode}
            onChange={(e) => handleStateChange(e.target.value)}
            disabled={!canAddMoreLocations}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all disabled:opacity-50"
          >
            <option value="">Select state</option>
            {states.map((state) => (
              <option key={state.code} value={state.code}>{state.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={newLocation.city}
            list="news-location-city-options"
            onChange={(e) => handleCityChange(e.target.value)}
            placeholder={newLocation.stateCode ? 'Select or search city' : 'Select state first'}
            disabled={!newLocation.stateCode || !canAddMoreLocations}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all disabled:opacity-50"
          />
          <datalist id="news-location-city-options">
            {cityOptions.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
          <input
            type="text"
            value={newLocation.zipCode}
            onChange={(e) => setNewLocation({ ...newLocation, zipCode: e.target.value })}
            placeholder="ZIP code (required if no city)"
            disabled={!canAddMoreLocations}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all disabled:opacity-50"
          />
          <input
            type="text"
            value={locationTaxonomy?.country?.name || 'United States'}
            readOnly
            className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={newLocation.isPrimary}
              onChange={(e) => setNewLocation({ ...newLocation, isPrimary: e.target.checked })}
              disabled={!canAddMoreLocations}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
            />
            Make this my primary location
          </label>
          <span className="text-[10px] text-gray-400">
            Requires ZIP or city + state
          </span>
        </div>
        <button
          type="submit"
          disabled={!canAddMoreLocations}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {canAddMoreLocations ? 'Add Location' : `Limit Reached (${MAX_TOTAL_LOCATIONS})`}
        </button>
      </form>
    </div>
  );
}
