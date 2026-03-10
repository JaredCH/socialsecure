import React from 'react';

const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
};

const TrendingCard = ({ items = [], loading = false, error = null }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 p-5">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">🔥 Trending</h2>
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="animate-pulse pb-3 border-b border-gray-100 last:border-0">
              <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
              <div className="h-2 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-400">No trending stories right now.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <a
              key={item.article._id}
              href={item.article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
            >
              <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{item.article.title}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px] text-gray-400">{item.article.source} · {formatRelativeTime(item.article.publishedAt)}</span>
                <span className="ml-auto text-[11px] font-semibold bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-md">🔥 {Math.round(item.viralScore || 0)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrendingCard;
