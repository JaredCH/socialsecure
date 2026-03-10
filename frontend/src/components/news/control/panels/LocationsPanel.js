import React from 'react';

export default function LocationsPanel({
  locations,
  onAddLocation,
  onRemoveLocation,
  onSetPrimaryLocation,
  newLocation,
  setNewLocation
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Location Preferences</h3>
        <span className="text-xs text-gray-400">{locations?.length || 0} locations</span>
      </div>

      {/* Existing locations */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {locations?.map((loc) => {
          const parts = [loc.city, loc.zipCode, loc.county, loc.state, loc.country].filter(Boolean);
          return (
            <div key={loc._id} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg text-sm ring-1 ring-gray-200">
              <span className="text-gray-700 truncate">
                {parts.join(', ') || 'Unknown'}
                {loc.isPrimary && <span className="ml-1.5 text-xs text-indigo-600 font-semibold">Primary</span>}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {!loc.isPrimary && (
                  <button
                    onClick={() => onSetPrimaryLocation(loc._id)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Primary
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
      <form onSubmit={onAddLocation} className="space-y-3 pt-2 border-t border-gray-100">
        <p className="text-xs text-gray-500 font-medium">Add New Location</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={newLocation.city}
            onChange={(e) => setNewLocation({ ...newLocation, city: e.target.value })}
            placeholder="City"
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
          />
          <input
            type="text"
            value={newLocation.zipCode}
            onChange={(e) => setNewLocation({ ...newLocation, zipCode: e.target.value })}
            placeholder="ZIP"
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
          />
          <input
            type="text"
            value={newLocation.state}
            onChange={(e) => setNewLocation({ ...newLocation, state: e.target.value })}
            placeholder="State"
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
          />
          <input
            type="text"
            value={newLocation.country}
            onChange={(e) => setNewLocation({ ...newLocation, country: e.target.value })}
            placeholder="Country"
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={newLocation.isPrimary}
            onChange={(e) => setNewLocation({ ...newLocation, isPrimary: e.target.checked })}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Make this my primary location
        </label>
        <button
          type="submit"
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Add Location
        </button>
      </form>
    </div>
  );
}
