import React, { useState, useEffect, useRef, useCallback } from 'react';
import { newsAPI } from '../../utils/api';
import { buildAlgorithmicSequence, buildInfiniteScrollBatch } from '../../utils/newsAlgorithmHelper';
import ArticleRow from './ArticleRow';

/**
 * AlgorithmicFeed
 *
 * Props:
 *   categories      {Array}    — [{ key, label }]
 *   activeCategory  {string}   — null = All
 *   activeRegion    {object}   — { country, state, city }
 *   activeDate      {string}   — '24h'|'48h'|'week'|'all'
 *   searchQuery     {string}
 *   onArticle       {Function} — (article) => void  open drawer
 */

const IMPRESSION_FLUSH_INTERVAL = 5000; // ms
const IMPRESSION_FLUSH_COUNT    = 10;   // flush when buffer reaches N

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-3 py-3 border-b border-gray-100 animate-pulse">
      <div className="w-14 h-14 rounded-xl bg-gray-200 shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3.5 bg-gray-200 rounded w-4/5" />
        <div className="h-3 bg-gray-100 rounded w-3/5" />
        <div className="h-2.5 bg-gray-100 rounded w-2/5" />
      </div>
    </div>
  );
}

// ─── Ingest-triggered shimmer banner ─────────────────────────────────────────
function IngestBanner() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
      <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" />
      </svg>
      Fetching local news for your location…
    </div>
  );
}

export default function AlgorithmicFeed({
  categories = [],
  activeCategory,
  activeRegion,
  activeDate,
  searchQuery,
  onArticle,
}) {
  const [articles, setArticles]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [loadingMore, setLoadingMore]       = useState(false);
  const [error, setError]                   = useState(null);
  const [page, setPage]                     = useState(1);
  const [hasMore, setHasMore]               = useState(true);
  const [showIngestBanner, setShowIngestBanner] = useState(false);
  const [searchResults, setSearchResults]   = useState(null); // null = not in search mode

  // Impression buffer: { articleId, type: 'scroll'|'click' }
  const impressionBuffer = useRef([]);
  const flushTimerRef    = useRef(null);

  // Flush impressions to server
  const flushImpressions = useCallback(() => {
    const buf = impressionBuffer.current.splice(0);
    if (buf.length === 0) return;
    newsAPI.reportImpressions(buf).catch(() => {});
  }, []);

  // Buffer an impression; flush if threshold hit
  const bufferImpression = useCallback((articleId, type) => {
    impressionBuffer.current.push({ articleId, type });
    if (impressionBuffer.current.length >= IMPRESSION_FLUSH_COUNT) flushImpressions();
  }, [flushImpressions]);

  // Interval flush on mount; flush on unmount
  useEffect(() => {
    flushTimerRef.current = setInterval(flushImpressions, IMPRESSION_FLUSH_INTERVAL);
    return () => {
      clearInterval(flushTimerRef.current);
      flushImpressions();
    };
  }, [flushImpressions]);

  // Build query params for feed API
  const buildFeedParams = useCallback((pg = 1) => {
    const params = { page: pg, limit: 50 };
    if (activeCategory) params.category = activeCategory;
    if (activeRegion?.country) params.country = activeRegion.country;
    if (activeRegion?.state)   params.state   = activeRegion.state;
    if (activeRegion?.city)    params.city     = activeRegion.city;
    if (activeDate && activeDate !== 'all') {
      const hoursMap = { '24h': 24, '48h': 48, 'week': 168 };
      params.maxAgeHours = hoursMap[activeDate];
    }
    return params;
  }, [activeCategory, activeRegion, activeDate]);

  // ── Initial load / filter change ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setSearchResults(null);
      setHasMore(true);
      setPage(1);

      try {
        // If search query present, use search endpoint instead
        if (searchQuery && searchQuery.trim()) {
          const params = { q: searchQuery.trim() };
          if (activeCategory) params.category = activeCategory;
          if (activeRegion?.country) params.country = activeRegion.country;
          if (activeRegion?.state)   params.state   = activeRegion.state;
          if (activeRegion?.city)    params.city     = activeRegion.city;
          const res = await newsAPI.searchArticles(params);
          if (!cancelled) {
            setSearchResults(res.data?.results || []);
            setArticles(res.data?.results || []);
            setHasMore(false);
          }
          return;
        }

        const res = await newsAPI.getFeed(buildFeedParams(1));
        if (cancelled) return;

        const { sections, feed, triggeredIngest } = res.data || {};
        const categoryKeys = categories.map((c) => c.key);
        const ordered = buildAlgorithmicSequence(sections || {}, feed || [], categoryKeys);
        setArticles(ordered);

        if (triggeredIngest) {
          setShowIngestBanner(true);
          setTimeout(() => {
            if (!cancelled) {
              setShowIngestBanner(false);
              // Reload feed after local ingest finishes
              load();
            }
          }, 8000);
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load news. Tap to retry.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
}, [activeCategory, activeRegion, activeDate, searchQuery]);

  // ── Infinite scroll sentinel ─────────────────────────────────────────────────
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading || searchResults !== null) return;

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingMore) return;
        const nextPage = page + 1;
        setLoadingMore(true);
        try {
          const res = await newsAPI.getFeed(buildFeedParams(nextPage));
          const { feed } = res.data || {};
          if (!feed || feed.length === 0) {
            setHasMore(false);
            return;
          }
          const categoryKeys = categories.map((c) => c.key);
          const seen = new Set(articles.map((a) => a._id));
          const batch = buildInfiniteScrollBatch(feed, categoryKeys, seen);
          if (batch.length === 0) {
            setHasMore(false);
          } else {
            setArticles((prev) => [...prev, ...batch]);
            setPage(nextPage);
          }
        } catch { /* silent */ } finally {
          setLoadingMore(false);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
}, [hasMore, loading, loadingMore, page, articles, searchResults, buildFeedParams]);

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        {[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}
      </div>
    );
  }

  if (error) {
    return (
      <button
        className="w-full py-10 text-sm text-red-500 flex flex-col items-center gap-2"
        onClick={() => setLoading(true)} // re-trigger effect via loading state hack
      >
        <span className="material-symbols-outlined text-3xl">error_outline</span>
        {error}
      </button>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-2 text-gray-400">
        <span className="material-symbols-outlined text-4xl">newspaper</span>
        <p className="text-sm">No articles found</p>
      </div>
    );
  }

  return (
    <div>
      {showIngestBanner && <IngestBanner />}

      {searchResults !== null && (
        <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "<strong>{searchQuery}</strong>"
        </div>
      )}

      {articles.map((article) => (
        <ArticleRow
          key={article._id}
          article={article}
          onArticle={onArticle}
          onScrollPast={(id) => bufferImpression(id, 'scroll')}
          onClick={(id) => bufferImpression(id, 'click')}
        />
      ))}

      {/* Infinite scroll sentinel */}
      {hasMore && searchResults === null && (
        <div ref={sentinelRef}>
          {loadingMore && (
            <div>
              {[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}
            </div>
          )}
        </div>
      )}

      {!hasMore && !loading && (
        <p className="text-center py-8 text-xs text-gray-400">You're all caught up</p>
      )}
    </div>
  );
}
