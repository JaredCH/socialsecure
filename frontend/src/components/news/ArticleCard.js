import React, { useEffect, useRef } from 'react';
import { getCategoryColor } from '../../constants/newsColors';

/**
 * ArticleCard — card-style article item for the 'card' viewMode.
 */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ArticleCard({ article, onArticle, onScrollPast, onClick }) {
  const cardRef = useRef(null);
  const firedRef = useRef(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !onScrollPast) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.5 && !firedRef.current) {
          firedRef.current = true;
          onScrollPast(article);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [article._id, article, onScrollPast]);

  const handleClick = (e) => {
    onClick?.(article);
    onArticle?.(article, { x: e.clientX, y: e.clientY });
  };

  const isBreaking = Number(article.viralSignals?.urgencyTerms) > 0.8;
  const cColor = getCategoryColor(article.category);
  const sourceName = article.source?.name || article.sourceName || article.source || '';
  const image = article.urlToImage || article.image || article.imageUrl;

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className="flex flex-col bg-[var(--bg2)] border border-[var(--border)] rounded-[12px] overflow-hidden cursor-pointer transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:translate-y-[-2px] group"
    >
      {/* Top Accent Bar */}
      <div 
        className="h-[3px] w-full" 
        style={{ backgroundColor: isBreaking ? 'var(--red)' : cColor }} 
      />

      {/* Image / Placeholder */}
      <div className="relative aspect-[16/9] bg-[var(--bg3)] overflow-hidden">
        {image ? (
          <img 
            src={image} 
            alt={article.title} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--text3)]">
             <span className="material-symbols-outlined text-[32px]">newspaper</span>
          </div>
        )}
        
        {/* Category Badge Overlaid */}
        {article.category && (
          <div 
            className="absolute top-[10px] left-[10px] text-[8px] font-[var(--mono)] font-bold px-[8px] py-[3px] rounded-[4px] backdrop-blur-[4px] shadow-sm uppercase tracking-[0.5px]"
            style={{
              backgroundColor: isBreaking ? 'rgba(255,71,87,0.85)' : `${cColor}D9`,
              color: '#fff'
            }}
          >
            {isBreaking ? 'Breaking' : article.category}
          </div>
        )}
      </div>

      <div className="p-[14px] flex flex-col gap-[8px] flex-1">
        {/* Meta */}
        <div className="flex items-center justify-between">
          <span className="font-[var(--mono)] text-[9px] font-semibold tracking-[1px] text-[var(--accent)] uppercase">
            {sourceName}
          </span>
          <span className="font-[var(--mono)] text-[9px] text-[var(--text3)]">
            {timeAgo(article.publishedAt)}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-[14px] font-bold text-[var(--text)] leading-[1.3] group-hover:text-[var(--accent)] line-clamp-2">
          {article.title}
        </h3>

        {/* Excerpt */}
        <p className="text-[11px] text-[var(--text2)] leading-[1.6] line-clamp-3 overflow-hidden">
          {article.description || article.summary || ''}
        </p>

        {/* Footer */}
        <div className="mt-auto pt-[10px] flex items-center justify-between border-t border-[var(--border)]">
          <span className="text-[9px] text-[var(--text3)] font-[var(--mono)]">
            📍 {article.locationTags?.city || 'Global'}
          </span>
          <div className="flex gap-[8px]">
             <span className="material-symbols-outlined text-[16px] text-[var(--text3)] hover:text-[var(--text)]">push_pin</span>
             <span className="material-symbols-outlined text-[16px] text-[var(--text3)] hover:text-[var(--text)]">share</span>
          </div>
        </div>
      </div>
    </div>
  );
}
