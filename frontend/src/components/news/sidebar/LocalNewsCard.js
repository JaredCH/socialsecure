import React from 'react';
import { formatRelativeTime } from '../utils';

const LocalNewsCard = ({ articles = [], locations = [], onManageLocations }) => {
  // Get local articles (those with localityLevel = 'local' or 'regional')
  const localArticles = articles
    .filter(a => a.localityLevel === 'local' || a.localityLevel === 'regional')
    .slice(0, 5);

  const primaryLocation = locations.find(l => l.isPrimary);
  const locationLabel = primaryLocation
    ? [primaryLocation.city, primaryLocation.state].filter(Boolean).join(', ')
    : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">📍 Local News</h2>
        {locationLabel && (
          <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">{locationLabel}</span>
        )}
      </div>

      {localArticles.length === 0 ? (
        <div>
          <p className="text-xs text-gray-400 mb-2">No local stories available.</p>
          {locations.length === 0 && (
            <p className="text-[11px] text-gray-400">Add a location for local coverage.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {localArticles.map((article) => (
            <a
              key={article._id}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
            >
              <p className="text-xs font-medium text-gray-900 line-clamp-2 leading-snug">{article.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-gray-400">{article.source}</span>
                <span className="text-[10px] text-gray-400">· {formatRelativeTime(article.publishedAt)}</span>
                {article.localityLevel && (
                  <span className="text-[10px] text-indigo-500 font-medium ml-auto">{article.localityLevel}</span>
                )}
              </div>
            </a>
          ))}
        </div>
      )}

      {onManageLocations && (
        <button
          onClick={onManageLocations}
          className="mt-3 w-full text-center text-xs text-indigo-600 hover:text-indigo-700 font-medium"
        >
          Manage Locations →
        </button>
      )}
    </div>
  );
};

export default LocalNewsCard;
