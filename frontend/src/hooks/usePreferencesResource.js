import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Generic hook for a preferences / settings resource.
 *
 * Handles load → display → save → refresh for any preference domain.
 *
 * @param {Function} fetchFn  – () => Promise<response>
 * @param {Function} saveFn   – (data) => Promise<response>
 * @param {Object}   [options]
 * @param {Function} [options.extractData]  – (response) => data   (default: res => res.data)
 * @param {Function} [options.extractSaved] – (response) => data   (default: res => res.data)
 * @param {string}   [options.loadError]    – fallback load error string
 * @param {string}   [options.saveError]    – fallback save error string
 * @param {boolean}  [options.autoLoad=true]– fetch on mount
 *
 * @returns {{
 *   data: any,
 *   loading: boolean,
 *   saving: boolean,
 *   error: string|null,
 *   save: (payload) => Promise<boolean>,
 *   refresh: () => void,
 *   setData: Function
 * }}
 */
export default function usePreferencesResource(fetchFn, saveFn, options = {}) {
  const {
    extractData = (res) => res.data ?? null,
    extractSaved = (res) => res.data ?? null,
    loadError = 'Failed to load preferences',
    saveError = 'Failed to save preferences',
    autoLoad = true,
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  // Store callback refs so they never trigger useCallback/useEffect re-runs
  const fetchFnRef = useRef(fetchFn);
  const saveFnRef = useRef(saveFn);
  const extractDataRef = useRef(extractData);
  const extractSavedRef = useRef(extractSaved);
  const loadErrorRef = useRef(loadError);
  const saveErrorRef = useRef(saveError);
  fetchFnRef.current = fetchFn;
  saveFnRef.current = saveFn;
  extractDataRef.current = extractData;
  extractSavedRef.current = extractSaved;
  loadErrorRef.current = loadError;
  saveErrorRef.current = saveError;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFnRef.current();
      if (mountedRef.current) setData(extractDataRef.current(res));
    } catch (err) {
      if (mountedRef.current)
        setError(err?.response?.data?.error || loadErrorRef.current);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) load();
  }, [load, autoLoad]);

  const save = useCallback(
    async (payload) => {
      setSaving(true);
      setError(null);
      try {
        const res = await saveFnRef.current(payload);
        if (mountedRef.current) {
          const saved = extractSavedRef.current(res);
          if (saved != null) setData(saved);
        }
        return true;
      } catch (err) {
        if (mountedRef.current)
          setError(err?.response?.data?.error || saveErrorRef.current);
        return false;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [],
  );

  return { data, loading, saving, error, save, refresh: load, setData };
}
