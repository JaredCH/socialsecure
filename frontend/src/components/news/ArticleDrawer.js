import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import NewsArticleImage from './NewsArticleImage';
import { formatRelativeTime } from './utils';

/**
 * ArticleDrawer — Article detail overlay.
 * Desktop: centered 520px popup matching prototype (popIn animation, 4 action buttons).
 * Mobile: slide-in drawer from the right.
 * variant='popup' (legacy): positioned popup anchored to click coords.
 */

function buildLocationLabel(article) {
  const city = article?.locationTags?.city || article?.locationTags?.cities?.[0] || null;
  const state = article?.locationTags?.state || article?.locationTags?.states?.[0] || null;
  const country = article?.locationTags?.country || article?.locationTags?.countries?.[0] || null;
  return [city, state, country].filter(Boolean).join(', ');
}

const ArticleDrawer = ({ article, onClose, variant = 'drawer', anchorPosition = null }) => {
  const popupRef = useRef(null);
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;

  // ── Escape key + body lock ────────────────────────────────────────────
  useEffect(() => {
    if (!article) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    const prevOverflow = document.body.style.overflow;
    if (!isDesktop) document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [article, onClose, isDesktop]);

  // ── Click-outside for popup variant ───────────────────────────────────
  useEffect(() => {
    if (!article || variant !== 'popup') return;
    const handlePointerDown = (e) => {
      if (!popupRef.current?.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [article, variant, onClose]);

  if (!article) return null;

  const sourceName = article.source?.name || article.sourceName || article.source || 'Unknown source';
  const locationLabel = buildLocationLabel(article);
  const keywords = article.keywords || article.topics || [];

  // ── Shared article content ────────────────────────────────────────────
  const articleContent = (
    <div className="px-[18px] py-[16px]">
      <NewsArticleImage
        article={article}
        wrapperClassName="mb-4 overflow-hidden rounded-xl"
        imageClassName="h-48 w-full object-cover"
      />

      {/* Source + time metadata */}
      <div className="font-[var(--mono)] text-[10px] text-[var(--accent)] mb-[6px]">
        {sourceName}
      </div>
      <div className="font-[var(--mono)] text-[10px] text-[var(--text3)] mb-[12px]">
        {locationLabel && `📍 ${locationLabel}  ·  `}
        {article.publishedAt && `🕐 ${formatRelativeTime(article.publishedAt)}`}
      </div>

      {/* Content */}
      <div className="text-[13px] text-[var(--text2)] leading-[1.7] mb-[14px]">
        {article.description || 'This article only includes headline metadata from the feed. Use the button below to open the publisher page.'}
      </div>

      {/* Tags */}
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-[6px] mt-[14px] mb-[14px]">
          {keywords.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="font-[var(--mono)] text-[9px] px-[8px] py-[3px] rounded-[4px] border border-[var(--border2)] text-[var(--text3)] cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-[8px] mt-[14px]">
        <button className="flex-1 py-[8px] rounded-[5px] border border-[var(--border2)] bg-[var(--bg3)] text-[var(--text2)] text-[11px] font-[var(--sans)] cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">
          📌 Save
        </button>
        <button className="flex-1 py-[8px] rounded-[5px] border border-[var(--border2)] bg-[var(--bg3)] text-[var(--text2)] text-[11px] font-[var(--sans)] cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">
          🔗 Share
        </button>
        <button className="flex-1 py-[8px] rounded-[5px] border border-[var(--border2)] bg-[var(--bg3)] text-[var(--text2)] text-[11px] font-[var(--sans)] cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">
          🔕 Hide Source
        </button>
        {article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-[8px] rounded-[5px] border border-[var(--accent)] bg-[rgba(0,212,255,0.1)] text-[var(--accent)] text-[11px] font-[var(--sans)] cursor-pointer hover:bg-[rgba(0,212,255,0.2)] transition-all text-center no-underline"
          >
            ↗ Full Article
          </a>
        ) : (
          <button disabled className="flex-1 py-[8px] rounded-[5px] border border-[var(--border)] bg-[var(--bg3)] text-[var(--text3)] text-[11px] cursor-not-allowed">
            ↗ No Link
          </button>
        )}
      </div>
    </div>
  );

  // ── Desktop: Centered 520px popup ─────────────────────────────────────
  if (isDesktop && variant !== 'popup') {
    const desktopPopup = (
      <>
        <div
          className="fixed inset-0 z-[1310] bg-black/60 backdrop-blur-[4px]"
          onClick={onClose}
        />
        <div className="fixed inset-0 z-[1320] flex items-center justify-center pointer-events-none">
          <div
            ref={popupRef}
            role="dialog"
            aria-modal="true"
            aria-label="Article Detail"
            className="pointer-events-auto w-[520px] max-w-[calc(100vw-2rem)] max-h-[80vh] overflow-y-auto rounded-[10px] border border-[var(--border2)] bg-[var(--bg2)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            style={{ animation: 'popIn 0.2s cubic-bezier(0.34,1.56,0.64,1)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-[10px] px-[18px] py-[16px] border-b border-[var(--border)]">
              <div className="flex-1 min-w-0">
                <div className="font-[var(--mono)] text-[10px] text-[var(--accent)] mb-[2px]">
                  {sourceName}
                </div>
                <div className="font-[var(--display)] text-[20px] tracking-[1px] text-[var(--text)] leading-snug line-clamp-2">
                  {article.title}
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-[26px] h-[26px] rounded-full bg-[var(--bg3)] border border-[var(--border)] flex items-center justify-center text-[12px] text-[var(--text2)] cursor-pointer hover:bg-[var(--red)] hover:border-[var(--red)] hover:text-white transition-all flex-shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            {articleContent}
          </div>
        </div>
      </>
    );
    return createPortal(desktopPopup, document.body);
  }

  // ── Mobile: Full-width slide-in drawer ────────────────────────────────
  const mobileDrawer = (
    <>
      <div className="fixed inset-0 z-[1310] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        data-testid="article-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Article Detail"
        className="fixed inset-y-0 right-0 z-[1320] w-full max-w-lg overflow-y-auto bg-[var(--bg2)] shadow-[0_0_80px_rgba(0,0,0,0.6)] border-l border-[var(--border)]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)] px-6 py-4">
          <h3 className="font-[var(--mono)] text-xs font-bold uppercase tracking-[1px] text-[var(--text2)]">
            Article Detail
          </h3>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border2)] px-2.5 py-1.5 text-[var(--text3)] hover:text-[var(--accent)] transition-colors"
            aria-label="Close article drawer"
          >
            <span className="text-xs font-semibold">Close</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Title */}
        <div className="px-[18px] pt-[16px]">
          <h2 className="text-xl font-bold text-[var(--text)] leading-snug mb-2">{article.title}</h2>
        </div>

        {articleContent}
      </div>
    </>
  );

  return createPortal(mobileDrawer, document.body);
};

export default ArticleDrawer;
