import React from 'react';

export default function SchedulePanel({ preferences, onUpdatePreferences, scopes }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Feed Schedule & Defaults</h3>
      </div>

      {/* Default scope */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Default Scope</label>
        <p className="text-xs text-gray-500">Scope that loads when you open News</p>
        <select
          value={preferences?.defaultScope || 'local'}
          onChange={(e) => onUpdatePreferences({ defaultScope: e.target.value })}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
        >
          {scopes.map((s) => (
            <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-center">
        <p className="text-sm text-gray-500">Auto-refresh and scheduling options will be available in a future update.</p>
      </div>
    </div>
  );
}
