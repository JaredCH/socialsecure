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
  }, [article._id, article, onScrollPast]);

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

  const isKeyword = article._tier === 'keyword';
  const isBreaking = Number(article.viralSignals?.urgencyTerms) > 0.8;
  const sourceName = article.source?.name || article.sourceName || article.source || '';
  const locationLabel = article.locationTags?.city || article.locationTags?.cities?.[0] || 'Global';
  const subtitle = article.description || article.summary || '';
  
  // Custom colors for categories based on prototype mapping
  const catColorMap = {
    breaking: '#ff4757',
    tech: '#00d4ff',
    politics: '#f5a623',
    science: '#7c3aed',
    markets: '#00c47a',
    health: '#ff6b35',
    sports: '#facc15',
    entertainment: '#ec4899',
    world: '#3b82f6',
  };
  const cColor = catColorMap[article.category?.toLowerCase()] || '#555b6e';

  return (
    <article
      ref={rowRef}
      onClick={handleClick}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className="flex gap-0 p-0 border-b border-[var(--border)] cursor-pointer transition-colors relative hover:bg-[rgba(255,255,255,0.02)] group"
    >
      {/* Article Category Bar */}
      <div 
        className="w-[3px] shrink-0" 
        style={{ backgroundColor: isBreaking ? 'var(--red)' : cColor }} 
      />

      <div className="flex-1 flex flex-col gap-[4px] p-[10px_14px]">
        {/* Meta Row */}
        <div className="flex items-center gap-[8px]">
          <span className="font-[var(--mono)] text-[9px] font-semibold tracking-[1px] text-[var(--text3)] uppercase">
            {sourceName}
          </span>
          {article.category && (
            <span 
              className="text-[8px] font-[var(--mono)] px-[5px] py-[1px] rounded-[3px] tracking-[0.5px]"
              style={{
                color: isBreaking ? 'var(--red)' : cColor,
                border: `1px solid ${isBreaking ? 'rgba(255,71,87,0.3)' : cColor + '4D'}`,
                backgroundColor: isBreaking ? 'rgba(255,71,87,0.15)' : cColor + '0D'
              }}
            >
              {(isBreaking ? 'BREAKING' : article.category).toUpperCase()}
            </span>
          )}
          {isKeyword && (
            <span className="text-[8px] font-[var(--mono)] px-[5px] py-[1px] rounded-[3px] tracking-[0.5px] text-[var(--accent2)] border border-[rgba(124,58,237,0.3)] bg-[rgba(124,58,237,0.05)] ml-[-4px]">
              KEYWORD
            </span>
          )}
          <span className="ml-auto font-[var(--mono)] text-[9px] text-[var(--text3)]">
            {timeAgo(article.publishedAt)}
          </span>
        </div>

        {/* Title */}
        <div className="text-[13px] font-semibold text-[var(--text)] leading-[1.4] tracking-[-0.1px] group-hover:text-[var(--accent)]">
          {article.title}
        </div>

        {/* Excerpt */}
        {subtitle && (
          <div className="text-[11px] text-[var(--text2)] leading-[1.5] line-clamp-2 overflow-hidden text-ellipsis">
            {subtitle}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-[8px] mt-[2px]">
          <span className="font-[var(--mono)] text-[9px] text-[var(--text3)]">
            📍 {locationLabel}
          </span>
          <div className="flex gap-[4px] ml-auto">
            <span className="text-[11px] text-[var(--text3)] cursor-pointer p-[2px] transition-colors hover:text-[var(--text)]" title="Pin / Save" onClick={(e) => { e.stopPropagation(); }}>
              📌
            </span>
            <span className="text-[11px] text-[var(--text3)] cursor-pointer p-[2px] transition-colors hover:text-[var(--text)]" title="Share" onClick={(e) => { e.stopPropagation(); }}>
              🔗
            </span>
            <span className="text-[11px] text-[var(--text3)] cursor-pointer p-[2px] transition-colors hover:text-[var(--text)]" title="Dismiss" onClick={(e) => { e.stopPropagation(); }}>
              ✕
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
