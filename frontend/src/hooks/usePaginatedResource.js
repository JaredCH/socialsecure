import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Generic hook for paginated server‑state resources.
 *
 * @param {Function} fetcher  – (page, pageSize) => Promise<response>
 * @param {Object}   [options]
 * @param {number}   [options.pageSize=20]         – items per page
 * @param {Function} [options.extractItems]         – (response) => item[]  (default: res => res.data?.items ?? [])
 * @param {Function} [options.extractHasMore]       – (response) => bool    (default: res => res.data?.hasMore ?? false)
 * @param {boolean}  [options.autoLoad=true]        – fetch page 1 on mount
 * @param {string}   [options.errorMessage]         – fallback error string
 *
 * @returns {{
 *   items: any[],
 *   loading: boolean,
 *   error: string|null,
 *   hasMore: boolean,
 *   page: number,
 *   loadMore: () => void,
 *   refresh: () => void,
 *   setItems: Function
 * }}
 */
export default function usePaginatedResource(fetcher, options = {}) {
  const {
    pageSize = 20,
    extractItems = (res) => res.data?.items ?? [],
    extractHasMore = (res) => res.data?.hasMore ?? false,
    autoLoad = true,
    errorMessage = 'Failed to load data',
  } = options;

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  // Store callback refs so they never trigger useCallback/useEffect re-runs
  const fetcherRef = useRef(fetcher);
  const extractItemsRef = useRef(extractItems);
  const extractHasMoreRef = useRef(extractHasMore);
  const errorMessageRef = useRef(errorMessage);
  fetcherRef.current = fetcher;
  extractItemsRef.current = extractItems;
  extractHasMoreRef.current = extractHasMore;
  errorMessageRef.current = errorMessage;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchPage = useCallback(
    async (p, replace = false) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetcherRef.current(p, pageSize);
        if (!mountedRef.current) return;
        const newItems = extractItemsRef.current(result);
        const more = extractHasMoreRef.current(result);

        setItems((prev) => (replace ? newItems : [...prev, ...newItems]));
        setPage(p);
        setHasMore(more);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err?.response?.data?.error || errorMessageRef.current);
        if (replace) setItems([]);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    if (autoLoad) fetchPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) fetchPage(page + 1, false);
  }, [loading, hasMore, page, fetchPage]);

  const refresh = useCallback(() => {
    fetchPage(1, true);
  }, [fetchPage]);

  return { items, loading, error, hasMore, page, loadMore, refresh, setItems };
}
