import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import NewsArticleImage from './NewsArticleImage';
import { formatRelativeTime } from './utils';

function buildLocationLabel(article) {
  const city = article?.locationTags?.city || article?.locationTags?.cities?.[0] || null;
  const state = article?.locationTags?.state || article?.locationTags?.states?.[0] || null;
  const country = article?.locationTags?.country || article?.locationTags?.countries?.[0] || null;
  return [city, state, country].filter(Boolean).join(', ');
}

const ArticleDrawer = ({ article, onClose, variant = 'drawer', anchorPosition = null }) => {
  const isPopup = variant === 'popup';
  const popupRef = useRef(null);

  useEffect(() => {
    if (!article || isPopup) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPopup, onClose]);

  useEffect(() => {
    if (!article || !isPopup) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    const handlePointerDown = (event) => {
      if (!popupRef.current?.contains(event.target)) onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isPopup, onClose]);

  const popupPosition = useMemo(() => {
    if (!isPopup || typeof window === 'undefined') return null;
    const popupWidth = 360;
    const popupHeight = 420;
    const margin = 16;
    const defaultX = window.innerWidth / 2;
    const defaultY = window.innerHeight / 2;
    const x = Number.isFinite(anchorPosition?.x) ? anchorPosition.x : defaultX;
    const y = Number.isFinite(anchorPosition?.y) ? anchorPosition.y : defaultY;

    return {
      left: Math.max(margin, Math.min(x + 12, window.innerWidth - popupWidth - margin)),
      top: Math.max(margin, Math.min(y + 12, window.innerHeight - popupHeight - margin)),
    };
  }, [anchorPosition, isPopup]);

  if (!article) return null;

  const sourceName = article.source?.name || article.sourceName || article.source || 'Unknown source';
  const locationLabel = buildLocationLabel(article);
  const keywords = article.keywords || article.topics || [];

  const detailContent = (
    <div className="p-6">
      <div>
        <NewsArticleImage
          article={article}
          wrapperClassName="mb-4 overflow-hidden rounded-xl"
          imageClassName="h-48 w-full object-cover"
        />

        <h2 className="text-xl font-bold text-gray-900 leading-snug mb-3">{article.title}</h2>

        <div className="flex items-center flex-wrap gap-2 text-xs text-gray-500 mb-4">
          <span className="font-semibold text-gray-700">{sourceName}</span>
          {article.publishedAt && (
            <>
              <span className="text-gray-300">·</span>
              <span>{formatRelativeTime(article.publishedAt)}</span>
            </>
          )}
          {article.category && (
            <>
              <span className="text-gray-300">·</span>
              <span className="px-2 py-0.5 bg-gray-100 rounded-md text-gray-500">{article.category}</span>
            </>
          )}
          {article.localityLevel && article.localityLevel !== 'global' && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-indigo-500 font-medium">{article.localityLevel}</span>
            </>
          )}
        </div>

        {locationLabel && (
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            <span className="material-symbols-outlined text-sm leading-none">location_on</span>
            {locationLabel}
          </div>
        )}

        {article.description ? (
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed mb-4">
            <p>{article.description}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-4">This article only includes headline metadata from the feed. Use the button below to open the publisher page.</p>
        )}

        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {keywords.map((tag, index) => (
              <span key={`${tag}-${index}`} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">{tag}</span>
            ))}
          </div>
        )}

        {article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Open Original Article
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : (
          <p className="text-sm text-gray-400">This feed item does not include an article link.</p>
        )}
      </div>
    </div>
  );

  const drawer = isPopup ? (
    <div className="fixed inset-0 z-[220] pointer-events-none">
      <div
        ref={popupRef}
        data-testid="article-popup-preview"
        role="dialog"
        aria-modal="true"
        aria-label="Article Detail"
        className="absolute w-[360px] max-w-[calc(100vw-2rem)] pointer-events-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        style={popupPosition}
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600">Article Detail</h3>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close article drawer"
          >
            <span className="text-xs font-semibold">Close</span>
          </button>
        </div>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto origin-top-left scale-[0.92]">
          {detailContent}
        </div>
      </div>
    </div>
  ) : (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[210] bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div
        data-testid="article-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Article Detail"
        className="fixed inset-y-0 right-0 z-[220] w-full max-w-lg overflow-y-auto bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h3 className="text-sm font-bold text-gray-900">Article Detail</h3>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close article drawer"
          >
            <span className="text-xs font-semibold sm:hidden">Close preview</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {detailContent}
      </div>
    </>
  );

  return createPortal(drawer, document.body);
};

export default ArticleDrawer;
