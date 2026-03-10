import React from 'react';
import { HealthDot, HEALTH_REASON_LABELS } from '../HealthDot';

const SOURCE_ABBR = {
  'google-news': 'GN',
  'reuters': 'RT',
  'bbc': 'BBC',
  'npr': 'NPR',
  'associated-press': 'AP',
  'pbs': 'PBS',
  'cnn': 'CNN',
  'guardian': 'TG',
  'new-york-times': 'NYT',
  'wall-street-journal': 'WSJ',
  'techcrunch': 'TC',
  'gdelt': 'GD'
};

export default function SourcesPanel({ sources, onToggleSource, isSourceEnabled, onToggleGoogleNews, googleNewsEnabled, preferences }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">All News Sources</h3>
        <span className="text-xs text-gray-400">
          {sources.filter(s => s.enabled || (s.id === 'google-news' && googleNewsEnabled)).length} active
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map((source) => {
          const isGoogleNews = source.id === 'google-news';
          const enabled = isGoogleNews ? googleNewsEnabled : (source._id ? isSourceEnabled(source._id) : false);
          const abbr = SOURCE_ABBR[source.id] || source.name?.substring(0, 2).toUpperCase() || '??';
          const reasonLabel = HEALTH_REASON_LABELS[source.healthReason] || source.healthReason || '';

          return (
            <div
              key={source.id}
              className={`bg-white rounded-xl p-3 ring-1 transition-all ${
                enabled ? 'ring-gray-200 shadow-sm' : 'ring-gray-100 opacity-75'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Logo/Abbr */}
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-xs font-bold text-gray-600">
                  {abbr}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Name + health dot */}
                  <div className="flex items-center gap-1.5">
                    <HealthDot health={source.health} healthReason={source.healthReason} />
                    <span className="text-sm font-medium text-gray-800 truncate">{source.name}</span>
                  </div>

                  {/* URL / type */}
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {source.url ? new URL(source.url).hostname : source.type}
                  </p>

                  {/* Health reason label */}
                  <p className={`text-[10px] mt-0.5 ${
                    source.health === 'green' ? 'text-emerald-600' :
                    source.health === 'red' ? 'text-red-500' :
                    'text-amber-600'
                  }`}>
                    {reasonLabel}
                  </p>

                  {/* Category chips */}
                  {source.categories && source.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {source.categories.slice(0, 4).map((cat) => (
                        <span key={cat} className="px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded text-[10px] font-medium">
                          {cat}
                        </span>
                      ))}
                      {source.categories.length > 4 && (
                        <span className="px-1.5 py-0.5 text-gray-400 text-[10px]">
                          +{source.categories.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Toggle */}
                <div className="shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`Toggle ${source.name}`}
                    onClick={() => {
                      if (isGoogleNews) {
                        onToggleGoogleNews();
                      } else if (source._id && source.wired) {
                        onToggleSource(source._id, enabled);
                      }
                    }}
                    disabled={!source.wired && !isGoogleNews}
                    className={`w-8 h-[18px] rounded-full transition-colors duration-200 shrink-0 ${
                      enabled ? 'bg-indigo-600' : 'bg-gray-300'
                    } ${!source.wired && !isGoogleNews ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className={`block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-200 ${
                      enabled ? 'translate-x-[14px]' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sources.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">No sources configured.</p>
      )}
    </div>
  );
}
