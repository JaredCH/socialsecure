import React, { useEffect, useRef } from 'react';
import { getCategoryIcon } from '../../constants/categoryIcons';

/**
 * ArticleRow — single article list item.
 *
 * Props:
 *   article        {object}   — article document from backend
 *   onArticle      {Function} — (article) => void  — open detail/drawer
 *   onScrollPast   {Function} — (articleId) => void — called when row is 70%+ in viewport
 *   onClick        {Function} — (articleId) => void — called on click (for impression tracking)
 */

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ArticleRow({ article, onArticle, onScrollPast, onClick }) {
  const rowRef = useRef(null);
  const firedRef = useRef(false);

  // IntersectionObserver — fire onScrollPast once when 70%+ visible
  useEffect(() => {
    const el = rowRef.current;
    if (!el || !onScrollPast) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.7 && !firedRef.current) {
          firedRef.current = true;
          onScrollPast(article);
        }
      },
      { threshold: 0.7 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [article._id]);

  const buildAnchor = (event) => {
    const rowRect = rowRef.current?.getBoundingClientRect?.();
    const fallbackX = rowRect ? rowRect.left + (rowRect.width / 2) : 0;
    const fallbackY = rowRect ? rowRect.top + (rowRect.height / 2) : 0;
    return {
      x: typeof event?.clientX === 'number' ? event.clientX : fallbackX,
      y: typeof event?.clientY === 'number' ? event.clientY : fallbackY,
    };
  };

  const handleClick = (event) => {
    onClick?.(article);
    onArticle?.(article, buildAnchor(event));
  };

  const { symbol, bg, text } = getCategoryIcon(article.category);
  const isKeyword = article._tier === 'keyword';
  const isBreaking = Number(article.viralSignals?.urgencyTerms) > 0.8;
  const sourceName = article.source?.name || article.sourceName || article.source || '';
  const locationLabel = article.locationTags?.city || article.locationTags?.cities?.[0] || '';
  const subtitle = article.description
    ? article.description.length > 140
      ? article.description.slice(0, 140) + '…'
      : article.description
    : '';

  return (
    <article
      ref={rowRef}
      onClick={handleClick}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className={`
        relative flex items-start gap-3 px-3 py-3 cursor-pointer
        bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors
        border-b border-gray-100
        ${isKeyword ? 'border-l-4 border-l-purple-500' : ''}
      `}
    >
      {/* Breaking badge */}
      {isBreaking && (
        <span className="absolute top-2 right-2 text-[9px] font-bold bg-red-600 text-white px-1 py-0.5 rounded tracking-wide z-10">
          BREAKING
        </span>
      )}

      {/* Category icon square */}
      <div
        className={`shrink-0 w-14 h-14 rounded-xl ${bg} flex flex-col items-center justify-center gap-0.5 mt-0.5`}
        aria-hidden="true"
      >
        <span className={`material-symbols-outlined text-2xl leading-none ${text}`}>{symbol}</span>
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        {/* Keyword match chip */}
        {isKeyword && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1 py-0.5 mb-1">
            <span className="material-symbols-outlined text-xs leading-none">bookmark</span>
            Keyword Match
          </span>
        )}

        {/* Title */}
        <h3 className="font-semibold text-sm text-gray-900 leading-snug line-clamp-2 mb-0.5">
          {article.title}
        </h3>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-xs text-gray-500 leading-snug line-clamp-2 mb-1">
            {subtitle}
          </p>
        )}

        {/* Source + time footer */}
        <div className="flex items-center gap-1 text-[10px] text-gray-400 flex-wrap">
          {sourceName && (
            <>
              <span className="font-medium text-gray-500">{sourceName}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{timeAgo(article.publishedAt)}</span>
          {locationLabel && (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[11px] leading-none">location_on</span>
                {locationLabel}
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
