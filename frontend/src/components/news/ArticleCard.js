import React from 'react';

/**
 * ArticleCard
 *
 * Renders a single news article in one of three sizes:
 *   size="featured"  — large hero card with image (local / top articles)
 *   size="compact"   — medium row with thumbnail (state / national tier)
 *   size="mini"      — slim list item (feed tier)
 *
 * Props:
 *   article — API article object
 *   size    — "featured" | "compact" | "mini"
 *   onClick — (article) => void
 */
const ArticleCard = ({ article, size = 'compact', onClick }) => {
  if (!article) return null;

  const { title, source, sourceName, publishedAt, imageUrl, summary, category, _tier } = article;

  const timeAgo = (isoDate) => {
    if (!isoDate) return '';
    const diff = Math.floor((Date.now() - new Date(isoDate)) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const tierLabel = {
    local: { text: 'Local', bg: 'bg-green-100', fg: 'text-green-700' },
    state: { text: 'State', bg: 'bg-blue-100', fg: 'text-blue-700' },
    national: { text: 'National', bg: 'bg-purple-100', fg: 'text-purple-700' },
    trending: { text: 'Trending', bg: 'bg-orange-100', fg: 'text-orange-700' }
  }[_tier] || null;

  const handleClick = () => onClick && onClick(article);
  const handleKey = (e) => (e.key === 'Enter' || e.key === ' ') && handleClick();

  if (size === 'featured') {
    return (
      <article
        className="rounded-2xl overflow-hidden bg-white shadow-sm ring-1 ring-gray-200 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
        onClick={handleClick}
        onKeyDown={handleKey}
        tabIndex={0}
        role="button"
        aria-label={title}
      >
        {imageUrl && (
          <div className="aspect-[16/9] overflow-hidden bg-gray-100">
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        )}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            {tierLabel && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tierLabel.bg} ${tierLabel.fg}`}>
                {tierLabel.text}
              </span>
            )}
            {category && (
              <span className="text-[10px] text-gray-400 capitalize">{category}</span>
            )}
          </div>
          <h2 className="text-base font-semibold text-gray-900 leading-snug line-clamp-3 mb-1">{title}</h2>
          {summary && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{summary}</p>}
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span className="font-medium truncate max-w-[60%]">{sourceName || source}</span>
            <span>{timeAgo(publishedAt)}</span>
          </div>
        </div>
      </article>
    );
  }

  if (size === 'compact') {
    return (
      <article
        className="flex items-start gap-3 p-3 bg-white rounded-xl ring-1 ring-gray-100 cursor-pointer hover:bg-gray-50 transition-colors active:scale-[0.99]"
        onClick={handleClick}
        onKeyDown={handleKey}
        tabIndex={0}
        role="button"
        aria-label={title}
      >
        {imageUrl && (
          <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => { e.target.parentNode.style.display = 'none'; }}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {tierLabel && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tierLabel.bg} ${tierLabel.fg}`}>
                {tierLabel.text}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{title}</h3>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
            <span className="truncate">{sourceName || source}</span>
            <span>·</span>
            <span className="flex-shrink-0">{timeAgo(publishedAt)}</span>
          </div>
        </div>
      </article>
    );
  }

  // mini
  return (
    <article
      className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50 px-2 -mx-2 rounded transition-colors"
      onClick={handleClick}
      onKeyDown={handleKey}
      tabIndex={0}
      role="button"
      aria-label={title}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 line-clamp-2 leading-snug">{title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
          <span className="truncate">{sourceName || source}</span>
          <span>·</span>
          <span className="flex-shrink-0">{timeAgo(publishedAt)}</span>
        </div>
      </div>
    </article>
  );
};

export default ArticleCard;
