import React from 'react';

const healthDotColor = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  red: 'bg-red-500',
  unknown: 'bg-gray-300'
};

const SourcesStatusCard = ({ sources = [], enabledCount = 0, totalCount = 0, onManageSources }) => {
  // Show top sources by health status
  const sourceSummary = sources.slice(0, 8);

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">📡 Sources</h2>
        <span className="text-[11px] text-gray-400">{enabledCount}/{totalCount} active</span>
      </div>

      {sourceSummary.length === 0 ? (
        <p className="text-xs text-gray-400">No sources available.</p>
      ) : (
        <div className="space-y-1.5">
          {sourceSummary.map((source) => (
            <div key={source._id} className="flex items-center gap-2 text-xs">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${healthDotColor[source.health] || healthDotColor.unknown}`}
                aria-label={`Source ${source.name} health: ${source.health || 'unknown'}`}
                title={source.healthReason || 'Unknown status'}
              />
              <span className="text-gray-700 truncate">{source.name}</span>
              <span className="ml-auto text-gray-400 text-[10px] shrink-0">{source.type}</span>
            </div>
          ))}
        </div>
      )}

      {onManageSources && (
        <button
          onClick={onManageSources}
          className="mt-3 w-full text-center text-xs text-indigo-600 hover:text-indigo-700 font-medium"
        >
          Manage Sources →
        </button>
      )}
    </div>
  );
};

export default SourcesStatusCard;
