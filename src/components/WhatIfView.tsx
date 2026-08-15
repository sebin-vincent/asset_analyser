import { useCallback, useMemo, useState } from 'react';
import { FundSearch } from './FundSearch';
import { TradebookUpload } from './TradebookUpload';
import { WhatIfChart, type WhatIfLine } from './WhatIfChart';
import { WhatIfSummaryTable, type WhatIfRow } from './WhatIfSummaryTable';
import { EmptyState, LoadingState } from './EmptyStates';
import { Spinner } from './Spinner';
import { useFundHistories } from '../hooks/useFundHistory';
import { useTradebookMatch } from '../hooks/useTradebookMatch';
import { toAscendingNavPoints } from '../utils/dateUtils';
import { crossCheckPrices } from '../utils/fundMatch';
import { formatInr } from '../utils/format';
import { mergeValueSeries } from '../utils/mergeSeries';
import {
  hasValue,
  seedNavPoints,
  simulate,
  type FundSimulation,
  type Purchase,
} from '../utils/counterfactual';
import type { TradebookFund } from '../utils/tradebook';
import type { SchemeSearchResult } from '../types/fund';

const MAX_ALTERNATIVES = 2;
const ACTUAL_COLOR_INDEX = 0;

export function WhatIfView() {
  const [tradebookFunds, setTradebookFunds] = useState<TradebookFund[]>([]);
  const [selectedIsin, setSelectedIsin] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<SchemeSearchResult[]>([]);

  const tradebookFund = useMemo(
    () => tradebookFunds.find((f) => f.isin === selectedIsin) ?? null,
    [tradebookFunds, selectedIsin],
  );

  const match = useTradebookMatch(tradebookFund);

  const alternativeCodes = useMemo(
    () => alternatives.map((a) => a.schemeCode),
    [alternatives],
  );
  const { histories, loading, errors } = useFundHistories(alternativeCodes);

  const handleLoad = useCallback((funds: TradebookFund[]) => {
    setTradebookFunds(funds);
    setSelectedIsin(funds.length === 1 ? funds[0].isin : null);
    setAlternatives([]);
  }, []);

  const handleClear = useCallback(() => {
    setTradebookFunds([]);
    setSelectedIsin(null);
    setAlternatives([]);
  }, []);

  // Returns to the picker without touching `alternatives` — they're chosen against the actual
  // fund's performance, not tied to which tradebook ISIN is currently selected, so a fund switch
  // shouldn't discard them.
  const handleSwitchFund = useCallback(() => setSelectedIsin(null), []);

  // Everything below is derived: parse the histories once, replay the same purchases against each
  // fund, and align the resulting rupee series onto one timeline.
  const { simulations, chartData, lines, actual, priceCheck } = useMemo(() => {
    const empty = {
      simulations: [] as FundSimulation[],
      chartData: [],
      lines: [] as WhatIfLine[],
      actual: null as FundSimulation | null,
      priceCheck: null as ReturnType<typeof crossCheckPrices> | null,
    };
    if (!tradebookFund || match.status !== 'matched') return empty;

    const published = toAscendingNavPoints(match.history.data);

    // The tradebook is authoritative for its own fund: its `price` column *is* that fund's NAV,
    // so it fills dates mfapi doesn't publish — such as an NFO allotment before the scheme's
    // history begins, which would otherwise drop that purchase entirely.
    const { points: actualPoints } = seedNavPoints(
      published,
      tradebookFund.trades.map((t) => ({ time: t.time, nav: t.nav })),
    );

    // Units come straight from the broker's allotment for the actual fund; alternatives have
    // theirs derived from their own NAV on the same dates.
    const actualPurchases: Purchase[] = tradebookFund.trades.map((t) => ({
      time: t.time,
      amount: t.amount,
      units: t.units,
    }));
    const alternativePurchases: Purchase[] = tradebookFund.trades.map((t) => ({
      time: t.time,
      amount: t.amount,
    }));

    const actualSim = simulate(
      { schemeCode: match.schemeCode, name: match.schemeName, points: actualPoints },
      actualPurchases,
    );

    const altSims: FundSimulation[] = [];
    alternatives.forEach((alt) => {
      const history = histories[alt.schemeCode];
      if (!history) return;
      altSims.push(
        simulate(
          {
            schemeCode: alt.schemeCode,
            name: alt.schemeName,
            points: toAscendingNavPoints(history.data),
          },
          alternativePurchases,
        ),
      );
    });

    const all = [actualSim, ...altSims];
    const plotted = all.filter(hasValue);

    return {
      simulations: all,
      // Purchase dates are forced into the timeline so each line steps on the day money went in.
      chartData: mergeValueSeries(
        plotted.map((s) => ({ schemeCode: s.schemeCode, series: s.series })),
        tradebookFund.trades.map((t) => t.time),
      ),
      lines: plotted.map((s, idx) => ({
        schemeCode: s.schemeCode,
        name: s.name,
        colorIndex: s.schemeCode === match.schemeCode ? ACTUAL_COLOR_INDEX : idx,
      })),
      actual: actualSim,
      priceCheck: crossCheckPrices(tradebookFund.trades, published),
    };
  }, [tradebookFund, match, alternatives, histories]);

  const rows: WhatIfRow[] = useMemo(() => {
    const actualCode = match.status === 'matched' ? match.schemeCode : -1;
    return simulations.map((simulation, idx) => ({
      simulation,
      colorIndex: simulation.schemeCode === actualCode ? ACTUAL_COLOR_INDEX : idx,
      isActual: simulation.schemeCode === actualCode,
    }));
  }, [simulations, match]);

  const actualSim = actual && hasValue(actual) ? actual : null;
  const actualFinalValue = actualSim ? actualSim.finalValue : null;

  // Same `versus` figure the table's "vs your fund" column shows for each alternative,
  // just hoisted so the chart header and the table can't disagree about which one is best.
  const bestAlternative = useMemo(() => {
    if (actualFinalValue === null) return null;
    let best: { schemeCode: number; name: string; versus: number } | null = null;
    for (const { simulation, isActual } of rows) {
      if (isActual || !hasValue(simulation)) continue;
      const versus = simulation.finalValue - actualFinalValue;
      if (!best || versus > best.versus) best = { schemeCode: simulation.schemeCode, name: simulation.name, versus };
    }
    return best;
  }, [rows, actualFinalValue]);
  const canAddMore = alternatives.length < MAX_ALTERNATIVES;
  const existingCodes = useMemo(
    () =>
      new Set([
        ...alternativeCodes,
        ...(match.status === 'matched' ? [match.schemeCode] : []),
      ]),
    [alternativeCodes, match],
  );

  // While the multi-fund picker is showing (funds loaded, none picked yet), the dropzone stays
  // hidden — otherwise "Drop your tradebook CSV here" and "Which one do you want to analyse?"
  // would render at once. The picker itself carries its own "upload a different file" escape.
  const showUploader = tradebookFunds.length === 0 || !!tradebookFund;

  return (
    <div className="flex flex-col gap-6">
      {showUploader && (
        <TradebookUpload
          onLoad={handleLoad}
          onClear={handleClear}
          loadedFund={tradebookFund}
        />
      )}

      {tradebookFunds.length > 1 && tradebookFund && (
        <button
          type="button"
          onClick={handleSwitchFund}
          className="self-start text-xs text-ink-3 underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          Switch fund ({tradebookFunds.length} in this file)
        </button>
      )}

      {tradebookFunds.length > 1 && !tradebookFund && (
        <div className="rounded-lg border border-line bg-plate p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="text-sm text-ink">
              That file has {tradebookFunds.length} funds in it. Which one do you want to analyse?
            </p>
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-plate-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
            >
              Upload a different file
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {tradebookFunds.map((fund) => (
              <li key={fund.isin}>
                <button
                  type="button"
                  onClick={() => setSelectedIsin(fund.isin)}
                  className="w-full rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-plate-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
                >
                  <span className="block truncate text-ink">{fund.symbol}</span>
                  <span className="font-mono text-xs text-ink-3">
                    {fund.trades.length} {fund.trades.length === 1 ? 'purchase' : 'purchases'} ·{' '}
                    {formatInr(fund.totalInvested)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tradebookFund && match.status === 'searching' && (
        <p className="text-sm text-ink-3">Identifying this fund on mfapi…</p>
      )}

      {tradebookFund && match.status === 'error' && (
        <p className="text-sm text-danger">Could not look up the fund: {match.message}</p>
      )}

      {tradebookFund && match.status === 'not-found' && (
        <p className="rounded-md border border-line px-3 py-2 text-sm text-ink-2">
          Couldn't match <span className="font-medium">{tradebookFund.symbol}</span> to a scheme on
          mfapi (tried: {match.triedQueries.join(', ')}). Its NAV history is needed to chart your
          actual portfolio.
        </p>
      )}

      {match.status === 'matched' && priceCheck && (
        <div className="flex items-start gap-3 rounded-lg border border-line border-l-2 border-l-acc bg-plate px-4 py-3 text-sm">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-acc">
            <circle cx="7.5" cy="7.5" r="6.6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4.6 7.7 6.6 9.7 10.4 5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <p className="text-ink">
              Matched to <span className="font-medium">{match.schemeName}</span>
            </p>
            <p className="mt-0.5 font-mono text-xs text-ink-3">
              Confirmed by ISIN {tradebookFund?.isin}. {priceCheck.matched} of {priceCheck.total}{' '}
              purchase prices match this fund's published NAV
              {priceCheck.unpublished > 0 &&
                ` (${priceCheck.unpublished} predate its published history and were taken from your tradebook)`}
              {priceCheck.mismatches.length > 0 &&
                ` · ${priceCheck.mismatches.length} did not match`}
              .
            </p>
          </div>
        </div>
      )}

      {match.status === 'matched' && (
        <div>
          <p className="mb-2 text-sm text-ink-2">
            Compare against {canAddMore ? 'up to two other funds' : 'these funds'}:
          </p>
          {canAddMore && (
            <FundSearch
              onAdd={(fund) => setAlternatives((prev) => [...prev, fund])}
              existingCodes={existingCodes}
            />
          )}
          {alternatives.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {alternatives.map((alt) => (
                <li
                  key={alt.schemeCode}
                  className="flex items-center gap-2 rounded-full border border-line bg-plate py-1 pr-2 pl-3 text-xs"
                >
                  <span className="max-w-xs truncate text-ink">{alt.schemeName}</span>
                  {loading[alt.schemeCode] && (
                    <span className="flex shrink-0 items-center gap-1 text-ink-2">
                      <Spinner className="h-3 w-3 text-acc" />
                      Loading NAV history…
                    </span>
                  )}
                  {errors[alt.schemeCode] && (
                    <span className="text-danger">failed</span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setAlternatives((prev) =>
                        prev.filter((a) => a.schemeCode !== alt.schemeCode),
                      )
                    }
                    aria-label={`Remove ${alt.schemeName}`}
                    className="rounded p-0.5 text-ink-3 hover:bg-plate-2 hover:text-ink"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!tradebookFund && tradebookFunds.length === 0 && (
        <EmptyState
          title="See what a different fund would have done"
          description="Upload your purchase history and pick up to two other funds. We replay the same money, on the same dates, into each of them."
        />
      )}

      {chartData.length === 0 &&
        alternatives.length > 0 &&
        alternatives.some((alt) => loading[alt.schemeCode]) && (
          <LoadingState
            title="Loading fund history…"
            description="Fetching NAV data from mfapi — this can take a few seconds for older funds."
          />
        )}

      {chartData.length > 0 && actualSim && (
        <>
          <WhatIfChart
            chartData={chartData}
            lines={lines}
            totalInvested={actualSim.invested + actualSim.skippedAmount}
            actual={actualSim}
            bestAlternative={bestAlternative}
          />
          <WhatIfSummaryTable
            rows={rows}
            actualFinalValue={actualFinalValue}
            bestAlternativeCode={bestAlternative?.schemeCode ?? null}
          />
          <p className="text-xs text-ink-3">
            Each fund receives the same money on the same dates, priced at its own NAV that day.
            XIRR annualises the return accounting for when each purchase was made — a plain
            percentage would credit money invested last month the same as money invested a year
            ago. Excludes exit loads, taxes and any dividends paid out rather than reinvested.
          </p>
        </>
      )}
    </div>
  );
}
