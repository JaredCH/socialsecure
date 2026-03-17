import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
const REGISTRATION_PREFETCH_STATUS_KEY = 'registrationNewsPrefetchStatus';
const EMPTY_FEED_RETRY_DELAY_MS = 4000;
const EMPTY_FEED_RETRY_LIMIT = 4;

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

  // Impression buffer: { articleId?, articleLink?, locationKey?, type: 'scroll'|'click' }
  const impressionBuffer = useRef([]);
  const flushTimerRef    = useRef(null);
  const retryTimerRef    = useRef(null);

  const hasRegistrationPrefetchSeed = useCallback(() => {
    if (typeof window === 'undefined') return false;
    try {
      return Boolean(window.sessionStorage.getItem(REGISTRATION_PREFETCH_STATUS_KEY));
    } catch {
      return false;
    }
  }, []);

  const clearRegistrationPrefetchSeed = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(REGISTRATION_PREFETCH_STATUS_KEY);
    } catch {
      // Ignore storage failures in private browsing or locked-down contexts.
    }
  }, []);

  // Flush impressions to server
  const flushImpressions = useCallback(() => {
    const buf = impressionBuffer.current.splice(0);
    if (buf.length === 0) return;
    newsAPI.reportImpressions(buf).catch(() => {});
  }, []);

  // Buffer an impression; flush if threshold hit
  const bufferImpression = useCallback((article, type) => {
    if (!article) return;
    impressionBuffer.current.push({
      articleId: article._id,
      articleLink: article.link || article.url || '',
      locationKey: article.locationKey || '',
      type
    });
    if (impressionBuffer.current.length >= IMPRESSION_FLUSH_COUNT) flushImpressions();
  }, [flushImpressions]);

  // Interval flush on mount; flush on unmount
  useEffect(() => {
    flushTimerRef.current = setInterval(flushImpressions, IMPRESSION_FLUSH_INTERVAL);
    return () => {
      clearInterval(flushTimerRef.current);
      clearTimeout(retryTimerRef.current);
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

    clearTimeout(retryTimerRef.current);

    const load = async (attempt = 0) => {
      setLoading(true);
      setError(null);
      setHasMore(true);
      setPage(1);

      try {
        const res = await newsAPI.getFeed(buildFeedParams(1));
        if (cancelled) return;

        const { sections, feed, articles: pageArticles, triggeredIngest } = res.data || {};
        const initialArticles = Array.isArray(pageArticles) && pageArticles.length > 0 ? pageArticles : (feed || []);
        const ordered = buildAlgorithmicSequence(sections || {}, initialArticles, categories);
        setArticles(ordered);

        if (ordered.length > 0) {
          clearRegistrationPrefetchSeed();
        }

        const shouldRetryEmptyFeed =
          ordered.length === 0 &&
          attempt < EMPTY_FEED_RETRY_LIMIT &&
          hasRegistrationPrefetchSeed();

        if (triggeredIngest || shouldRetryEmptyFeed) {
          setShowIngestBanner(true);
          retryTimerRef.current = setTimeout(() => {
            if (!cancelled) {
              load(attempt + 1);
            }
          }, triggeredIngest ? 8000 : EMPTY_FEED_RETRY_DELAY_MS);
          return;
        }

        setShowIngestBanner(false);
        if (ordered.length === 0) {
          clearRegistrationPrefetchSeed();
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load news. Tap to retry.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(retryTimerRef.current);
    };
}, [activeCategory, activeRegion, activeDate, buildFeedParams, categories, clearRegistrationPrefetchSeed, hasRegistrationPrefetchSeed]);

  // ── Infinite scroll sentinel ─────────────────────────────────────────────────
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading || String(searchQuery || '').trim()) return;

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingMore) return;
        const nextPage = page + 1;
        setLoadingMore(true);
        try {
          const res = await newsAPI.getFeed(buildFeedParams(nextPage));
          const { feed, articles: pageArticles } = res.data || {};
          const batchSource = Array.isArray(pageArticles) && pageArticles.length > 0 ? pageArticles : (feed || []);
          if (!batchSource || batchSource.length === 0) {
            setHasMore(false);
            return;
          }
          const seen = new Set(articles.map((a) => a._id));
          const batch = buildInfiniteScrollBatch(batchSource, categories, seen);
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
}, [hasMore, loading, loadingMore, page, articles, buildFeedParams, searchQuery]);

  const normalizedSearch = useMemo(() => String(searchQuery || '').trim().toLowerCase(), [searchQuery]);
  const isSearchActive = normalizedSearch.length > 0;
  const filteredArticles = useMemo(() => {
    if (!isSearchActive) return articles;
    return articles.filter((article) => {
      const haystack = [
        article?.title,
        article?.description,
        article?.summary,
        article?.source,
        article?.category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [articles, isSearchActive, normalizedSearch]);

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

  if (filteredArticles.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-2 text-gray-400">
        <span className="material-symbols-outlined text-4xl">newspaper</span>
        <p className="text-sm">{isSearchActive ? 'No matching articles found' : 'No articles found'}</p>
      </div>
    );
  }

  return (
    <div>
      {showIngestBanner && <IngestBanner />}

      {isSearchActive && (
        <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
          {filteredArticles.length} result{filteredArticles.length !== 1 ? 's' : ''} for "<strong>{searchQuery}</strong>"
        </div>
      )}

      {filteredArticles.map((article) => (
        <ArticleRow
          key={article._id}
          article={article}
          onArticle={onArticle}
          onScrollPast={(id) => bufferImpression(id, 'scroll')}
          onClick={(id) => bufferImpression(id, 'click')}
        />
      ))}

      {/* Infinite scroll sentinel */}
      {hasMore && !isSearchActive && (
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
