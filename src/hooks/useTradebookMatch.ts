import { useEffect, useState } from 'react';
import { searchFunds } from '../api/mfApi';
import { fetchFundHistoryCached } from '../cache/fundHistoryCache';
import { deriveSearchQueries, isinMatches } from '../utils/fundMatch';
import type { TradebookFund } from '../utils/tradebook';
import type { FundHistoryResponse } from '../types/fund';

export type TradebookMatch =
  | { status: 'idle' }
  | { status: 'searching' }
  // ISIN-confirmed: mfapi's own meta carries the ISIN from the CSV, so this is not a guess.
  | { status: 'matched'; schemeCode: number; schemeName: string; history: FundHistoryResponse }
  | { status: 'not-found'; triedQueries: string[] }
  | { status: 'error'; message: string };

// How many search hits are worth fetching to check their ISIN. mfapi's search is unranked, so a
// broad query can return dozens; fetching all of them would be a burst of requests for nothing.
const MAX_CANDIDATES = 8;

// Resolves which mfapi scheme a tradebook fund is, by searching on progressively broader
// name fragments and confirming each candidate against the CSV's ISIN. See fundMatch.ts for why
// it has to work in that order — mfapi can confirm an ISIN but cannot search for one.
export function useTradebookMatch(fund: TradebookFund | null): TradebookMatch {
  const [match, setMatch] = useState<TradebookMatch>({ status: 'idle' });

  useEffect(() => {
    if (!fund) {
      setMatch({ status: 'idle' });
      return;
    }

    let cancelled = false;
    const queries = deriveSearchQueries(fund.symbol);
    setMatch({ status: 'searching' });

    (async () => {
      const checked = new Set<number>();
      try {
        for (const query of queries) {
          const results = await searchFunds(query);
          if (cancelled) return;

          for (const candidate of results.slice(0, MAX_CANDIDATES)) {
            if (checked.has(candidate.schemeCode)) continue;
            checked.add(candidate.schemeCode);

            const history = await fetchFundHistoryCached(candidate.schemeCode).catch(() => null);
            if (cancelled) return;
            if (!history || !isinMatches(history.meta, fund.isin)) continue;

            setMatch({
              status: 'matched',
              schemeCode: candidate.schemeCode,
              schemeName: history.meta.scheme_name || candidate.schemeName,
              history,
            });
            return;
          }
        }
        if (!cancelled) setMatch({ status: 'not-found', triedQueries: queries });
      } catch (err) {
        if (!cancelled) setMatch({ status: 'error', message: (err as Error).message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fund]);

  return match;
}
