import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Generic hook for mutation operations (create / update / delete).
 *
 * @param {Function} mutationFn  – (...args) => Promise<result>
 * @param {Object}   [options]
 * @param {Function} [options.onSuccess] – (result, ...args) => void
 * @param {Function} [options.onError]   – (error, ...args) => void
 * @param {string}   [options.errorMessage] – fallback error string
 *
 * @returns {{
 *   execute: (...args) => Promise<any>,
 *   loading: boolean,
 *   error: string|null,
 *   reset: () => void
 * }}
 */
export default function useMutationAction(mutationFn, options = {}) {
  const {
    onSuccess,
    onError,
    errorMessage = 'Action failed',
  } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await mutationFn(...args);
        if (mountedRef.current) setLoading(false);
        if (onSuccess) onSuccess(result, ...args);
        return result;
      } catch (err) {
        const msg = err?.response?.data?.error || errorMessage;
        if (mountedRef.current) {
          setError(msg);
          setLoading(false);
        }
        if (onError) onError(err, ...args);
        return undefined;
      }
    },
    [mutationFn, onSuccess, onError, errorMessage],
  );

  const reset = useCallback(() => setError(null), []);

  return { execute, loading, error, reset };
}
