import { useEffect, useRef, useState } from 'react';
import { searchFunds } from '../api/mfApi';
import type { SchemeSearchResult } from '../types/fund';
import { useDebouncedValue } from './useDebouncedValue';

const MIN_QUERY_LENGTH = 3;

const resultCache = new Map<string, SchemeSearchResult[]>();

export function useFundSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const [results, setResults] = useState<SchemeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debouncedQuery.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const cached = resultCache.get(debouncedQuery);
    if (cached) {
      setResults(cached);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    searchFunds(debouncedQuery, controller.signal)
      .then((res) => {
        resultCache.set(debouncedQuery, res);
        setResults(res);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (abortRef.current === controller) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery]);

  const isQueryTooShort = debouncedQuery.length < MIN_QUERY_LENGTH;
  const isPending = !isQueryTooShort && query.trim() !== debouncedQuery;

  return { results, loading, error, isQueryTooShort, searching: isPending || loading };
}
