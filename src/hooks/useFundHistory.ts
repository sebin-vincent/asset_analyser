import { useEffect, useRef, useState } from 'react';
import { fetchFundHistoryCached } from '../cache/fundHistoryCache';
import type { FundHistoryResponse } from '../types/fund';

interface FundHistoriesState {
  histories: Record<number, FundHistoryResponse>;
  loading: Record<number, boolean>;
  errors: Record<number, string>;
}

// Fetches (cache-first) full NAV history for each schemeCode in the list.
// Fetching is keyed only by schemeCode — never re-runs due to date-range changes.
export function useFundHistories(schemeCodes: number[]) {
  const [state, setState] = useState<FundHistoriesState>({
    histories: {},
    loading: {},
    errors: {},
  });
  const inFlight = useRef<Set<number>>(new Set());

  useEffect(() => {
    schemeCodes.forEach((code) => {
      if (state.histories[code] || inFlight.current.has(code)) return;
      inFlight.current.add(code);
      setState((prev) => ({ ...prev, loading: { ...prev.loading, [code]: true } }));

      fetchFundHistoryCached(code)
        .then((data) => {
          setState((prev) => {
            const { [code]: _droppedError, ...restErrors } = prev.errors;
            return {
              histories: { ...prev.histories, [code]: data },
              loading: { ...prev.loading, [code]: false },
              errors: restErrors,
            };
          });
        })
        .catch((err: Error) => {
          setState((prev) => ({
            ...prev,
            loading: { ...prev.loading, [code]: false },
            errors: { ...prev.errors, [code]: err.message },
          }));
        })
        .finally(() => {
          inFlight.current.delete(code);
        });
    });
  }, [schemeCodes, state.histories]);

  const retry = (schemeCode: number) => {
    setState((prev) => {
      const { [schemeCode]: _dropped, ...restErrors } = prev.errors;
      return { ...prev, errors: restErrors };
    });
  };

  return { ...state, retry };
}
