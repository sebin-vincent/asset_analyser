import { useCallback, useMemo, useState } from 'react';
import { FundSearch } from './FundSearch';
import { TradebookUpload } from './TradebookUpload';
import { WhatIfChart, type WhatIfLine } from './WhatIfChart';
import { WhatIfSummaryTable, type WhatIfRow } from './WhatIfSummaryTable';
import { EmptyState } from './EmptyStates';
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

  const actualFinalValue = actual && hasValue(actual) ? actual.finalValue : null;
  const canAddMore = alternatives.length < MAX_ALTERNATIVES;
  const existingCodes = useMemo(
    () =>
      new Set([
        ...alternativeCodes,
        ...(match.status === 'matched' ? [match.schemeCode] : []),
      ]),
    [alternativeCodes, match],
  );

  return (
    <div className="flex flex-col gap-6">
      <TradebookUpload
        onLoad={handleLoad}
        onClear={handleClear}
        loadedFund={tradebookFund}
      />

      {tradebookFunds.length > 1 && !tradebookFund && (
        <div className="rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] p-4 dark:border-[#2c2c2a] dark:bg-[#1a1a19]">
          <p className="mb-3 text-sm text-[#0b0b0b] dark:text-white">
            That file has {tradebookFunds.length} funds in it. Which one do you want to analyse?
          </p>
          <ul className="flex flex-col gap-1.5">
            {tradebookFunds.map((fund) => (
              <li key={fund.isin}>
                <button
                  type="button"
                  onClick={() => setSelectedIsin(fund.isin)}
                  className="w-full rounded-md border border-[#e1e0d9] px-3 py-2 text-left text-sm hover:bg-[#f0efec] dark:border-[#2c2c2a] dark:hover:bg-[#2c2c2a]"
                >
                  <span className="block truncate text-[#0b0b0b] dark:text-white">
                    {fund.symbol}
                  </span>
                  <span className="text-xs text-[#898781]">
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
        <p className="text-sm text-[#898781]">Identifying this fund on mfapi…</p>
      )}

      {tradebookFund && match.status === 'error' && (
        <p className="text-sm text-[#e34948]">Could not look up the fund: {match.message}</p>
      )}

      {tradebookFund && match.status === 'not-found' && (
        <p className="rounded-md border border-[#e1e0d9] px-3 py-2 text-sm text-[#52514e] dark:border-[#2c2c2a] dark:text-[#c3c2b7]">
          Couldn't match <span className="font-medium">{tradebookFund.symbol}</span> to a scheme on
          mfapi (tried: {match.triedQueries.join(', ')}). Its NAV history is needed to chart your
          actual portfolio.
        </p>
      )}

      {match.status === 'matched' && priceCheck && (
        <div className="rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] px-4 py-3 text-sm dark:border-[#2c2c2a] dark:bg-[#1a1a19]">
          <p className="text-[#0b0b0b] dark:text-white">
            Matched to <span className="font-medium">{match.schemeName}</span>
          </p>
          <p className="mt-0.5 text-xs text-[#898781]">
            Confirmed by ISIN {tradebookFund?.isin}. {priceCheck.matched} of {priceCheck.total}{' '}
            purchase prices match this fund's published NAV
            {priceCheck.unpublished > 0 &&
              ` (${priceCheck.unpublished} predate its published history and were taken from your tradebook)`}
            {priceCheck.mismatches.length > 0 &&
              ` · ${priceCheck.mismatches.length} did not match`}
            .
          </p>
        </div>
      )}

      {match.status === 'matched' && (
        <div>
          <p className="mb-2 text-sm text-[#52514e] dark:text-[#c3c2b7]">
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
                  className="flex items-center gap-2 rounded-md border border-[#e1e0d9] px-2.5 py-1.5 text-xs dark:border-[#2c2c2a]"
                >
                  <span className="max-w-xs truncate text-[#0b0b0b] dark:text-white">
                    {alt.schemeName}
                  </span>
                  {loading[alt.schemeCode] && <span className="text-[#898781]">loading…</span>}
                  {errors[alt.schemeCode] && (
                    <span className="text-[#e34948]">failed</span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setAlternatives((prev) =>
                        prev.filter((a) => a.schemeCode !== alt.schemeCode),
                      )
                    }
                    aria-label={`Remove ${alt.schemeName}`}
                    className="text-[#898781] hover:text-[#0b0b0b] dark:hover:text-white"
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

      {chartData.length > 0 && actual && hasValue(actual) && (
        <>
          <WhatIfChart
            chartData={chartData}
            lines={lines}
            totalInvested={actual.invested + actual.skippedAmount}
          />
          <WhatIfSummaryTable rows={rows} actualFinalValue={actualFinalValue} />
          <p className="text-xs text-[#898781]">
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
