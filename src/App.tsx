import { useCallback, useEffect, useMemo, useState } from 'react';
import { FundSearch } from './components/FundSearch';
import { SelectedFundsList } from './components/SelectedFundsList';
import { DateRangePicker } from './components/DateRangePicker';
import { ComparisonChart } from './components/ComparisonChart';
import { ReturnsSummaryTable } from './components/ReturnsSummaryTable';
import { SelectionDeltaPanel } from './components/SelectionDeltaPanel';
import { EmptyState, LoadingState } from './components/EmptyStates';
import { WhatIfView } from './components/WhatIfView';
import { useSelectedFunds } from './hooks/useSelectedFunds';
import { useFundHistories } from './hooks/useFundHistory';
import { useThemePreference } from './hooks/useThemePreference';
import type { ThemePreference } from './hooks/themeStore';
import { toAscendingNavPoints, formatAxisDate } from './utils/dateUtils';
import { resolveEffectiveRange, computePctGrowthSeries, type EffectiveRange } from './utils/normalize';
import { mergeToChartData, type FundSeriesInput } from './utils/mergeSeries';
import { buildReturnSummary } from './utils/returns';
import { computeNavsAt, computeSelectionDeltas, type FundDeltaInput } from './utils/selectionDelta';
import type { ChartSelection, DateRange, FundReturnSummary } from './types/fund';

function defaultRange(): DateRange {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  return { start, end };
}

type Mode = 'compare' | 'what-if';

const MODES: { id: Mode; label: string }[] = [
  { id: 'what-if', label: 'What if?' },
  { id: 'compare', label: 'Compare funds' },
];

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-line bg-plate p-0.5">
      {MODES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          onClick={() => onChange(id)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc ${
            mode === id ? 'bg-plate-2 font-medium text-ink' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'auto', label: 'Auto' },
];

function ThemeControl() {
  const [preference, setPreference] = useThemePreference();
  return (
    <div role="group" aria-label="Theme" className="inline-flex rounded-lg border border-line bg-plate-2 p-0.5">
      {THEME_OPTIONS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={preference === id}
          onClick={() => setPreference(id)}
          title={label}
          className={`rounded-md px-2 py-1 font-mono text-[10px] tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc ${
            preference === id ? 'bg-plate text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
          }`}
        >
          {id === 'light' && (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="inline">
              <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.3" />
              <path
                d="M7 1v1.6M7 11.4V13M1 7h1.6M11.4 7H13M2.8 2.8l1.1 1.1M10.1 10.1l1.1 1.1M2.8 11.2l1.1-1.1M10.1 3.9l1.1-1.1"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          )}
          {id === 'dark' && (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="inline">
              <path
                d="M12.2 8.4A5.2 5.2 0 0 1 5.6 1.8a5.4 5.4 0 1 0 6.6 6.6Z"
                fill="currentColor"
              />
            </svg>
          )}
          {id === 'auto' && (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="inline">
              <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 1.8A5.2 5.2 0 0 0 7 12.2Z" fill="currentColor" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
      <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <rect width="32" height="32" rx="8" fill="var(--acc)" />
        <path
          d="M7 21 L13 13 L18 17 L25 8"
          fill="none"
          stroke="var(--plate)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="25" cy="8" r="2.3" fill="var(--plate)" />
      </svg>
      Asset Analyser
    </span>
  );
}

function App() {
  const [mode, setMode] = useState<Mode>('what-if');
  const { selectedFunds, add, remove } = useSelectedFunds();
  const schemeCodes = useMemo(() => selectedFunds.map((f) => f.schemeCode), [selectedFunds]);
  const { histories, loading, errors, retry } = useFundHistories(schemeCodes);
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange());

  const existingCodes = useMemo(() => new Set(schemeCodes), [schemeCodes]);

  // Parsed, ascending NAV points per fund (pure, derived from cached raw history).
  const pointsByCode = useMemo(() => {
    const map = new Map<number, ReturnType<typeof toAscendingNavPoints>>();
    for (const fund of selectedFunds) {
      const history = histories[fund.schemeCode];
      if (history) map.set(fund.schemeCode, toAscendingNavPoints(history.data));
    }
    return map;
  }, [selectedFunds, histories]);

  const earliestAvailable = useMemo(() => {
    let earliest: number | null = null;
    for (const points of pointsByCode.values()) {
      if (points.length === 0) continue;
      if (earliest === null || points[0].time < earliest) earliest = points[0].time;
    }
    return earliest === null ? null : new Date(earliest);
  }, [pointsByCode]);

  const rangeStart = dateRange.start.getTime();
  const rangeEnd = dateRange.end.getTime();

  const { chartData, summaries, partialRangeNotes, noDataFunds, effectiveRangeByCode } = useMemo(() => {
    const seriesInputs: FundSeriesInput[] = [];
    const summaries: FundReturnSummary[] = [];
    const partialRangeNotes: Record<number, string> = {};
    const noDataFunds: number[] = [];
    // Shared so the chart, the summary table and the selection panel provably agree on which
    // slice of each fund's history is in play.
    const effectiveRangeByCode = new Map<number, EffectiveRange>();

    for (const fund of selectedFunds) {
      const points = pointsByCode.get(fund.schemeCode);
      if (!points) continue; // still loading or errored

      const effectiveRange = resolveEffectiveRange(points, rangeStart, rangeEnd);
      if (!effectiveRange) {
        noDataFunds.push(fund.schemeCode);
        continue;
      }

      effectiveRangeByCode.set(fund.schemeCode, effectiveRange);
      const pctSeries = computePctGrowthSeries(points, effectiveRange);
      seriesInputs.push({ schemeCode: fund.schemeCode, series: pctSeries });
      summaries.push(buildReturnSummary(fund.schemeCode, fund.name, effectiveRange));

      if (effectiveRange.isPartialRange) {
        partialRangeNotes[fund.schemeCode] = `Data from ${formatAxisDate(effectiveRange.effectiveStart)}`;
      }
    }

    return {
      chartData: mergeToChartData(seriesInputs),
      summaries,
      partialRangeNotes,
      noDataFunds,
      effectiveRangeByCode,
    };
  }, [selectedFunds, pointsByCode, rangeStart, rangeEnd]);

  const fundsWithData = selectedFunds.filter((f) => !noDataFunds.includes(f.schemeCode));
  const anyHistoryLoading = selectedFunds.some((f) => loading[f.schemeCode]);

  // --- Two-point comparison selection ---------------------------------------------------
  const [selection, setSelection] = useState<ChartSelection>({ phase: 'idle' });

  // Any change to the plotted rows invalidates the selection: the x-domain it was picked
  // against no longer exists. Covers the date range changing and the chart emptying out.
  useEffect(() => {
    setSelection({ phase: 'idle' });
  }, [chartData]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection({ phase: 'idle' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handlePick = (time: number) => {
    setSelection((prev) => {
      if (prev.phase === 'picking') {
        // Re-clicking the anchor cancels rather than refusing — a refusal strands the user
        // mid-pick, which is also what a double-click would produce.
        if (time === prev.anchor) return { phase: 'idle' };
        return {
          phase: 'locked',
          start: Math.min(prev.anchor, time),
          end: Math.max(prev.anchor, time),
        };
      }
      return { phase: 'picking', anchor: time };
    });
  };

  // Shared by the committed panel and by the chart's tooltip, so both resolve every number
  // through the same module and cannot disagree.
  const deltaInputs = useMemo(() => {
    const inputs: FundDeltaInput[] = [];
    for (const fund of selectedFunds) {
      const points = pointsByCode.get(fund.schemeCode);
      const effectiveRange = effectiveRangeByCode.get(fund.schemeCode);
      if (!points || !effectiveRange) continue;
      inputs.push({ fund, points, effectiveRange });
    }
    return inputs;
  }, [selectedFunds, pointsByCode, effectiveRangeByCode]);

  const navsAt = useCallback((time: number) => computeNavsAt(deltaInputs, time), [deltaInputs]);
  const deltasBetween = useCallback(
    (start: number, end: number) => computeSelectionDeltas(deltaInputs, start, end),
    [deltaInputs],
  );

  const selectionDeltas = useMemo(() => {
    if (selection.phase !== 'locked') return null;
    return computeSelectionDeltas(deltaInputs, selection.start, selection.end);
  }, [selection, deltaInputs]);

  return (
    <div className="min-h-screen bg-ground">
      <div className="sticky top-0 z-20 border-b border-line bg-plate">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <Wordmark />
          <div className="ml-auto flex items-center gap-3">
            <ModeToggle mode={mode} onChange={setMode} />
            <ThemeControl />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-ink">Asset Analyser</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            {mode === 'compare'
              ? 'Compare the historical performance of Indian mutual funds across any date range.'
              : 'Replay your actual purchases into a different fund and see what they would be worth.'}
          </p>
        </header>

        {mode === 'what-if' ? (
          <WhatIfView />
        ) : (
          <>
            <section className="mb-6 overflow-hidden rounded-lg border border-line bg-plate shadow-sm">
              <div className="flex flex-col gap-3 border-b border-line p-4">
                <FundSearch onAdd={add} existingCodes={existingCodes} />
                <SelectedFundsList
                  funds={selectedFunds}
                  onRemove={remove}
                  loading={loading}
                  errors={errors}
                  onRetry={retry}
                  partialRangeNotes={partialRangeNotes}
                />
              </div>
              <div className="p-3">
                <DateRangePicker range={dateRange} onChange={setDateRange} earliestAvailable={earliestAvailable} />
              </div>
            </section>

            <section className="mb-6">
              {selectedFunds.length === 0 ? (
                <EmptyState
                  title="No funds selected yet"
                  description="Search for a mutual fund above and add a few to compare their performance."
                />
              ) : chartData.length === 0 && anyHistoryLoading ? (
                <LoadingState
                  title="Loading fund history…"
                  description="Fetching NAV data from mfapi — this can take a few seconds for older funds."
                />
              ) : chartData.length === 0 ? (
                <EmptyState
                  title="No trading data in this range"
                  description="Try widening the date range — the selected funds have no priced trading days in this window."
                />
              ) : (
                <ComparisonChart
                  chartData={chartData}
                  funds={fundsWithData}
                  summaries={summaries}
                  selection={selection}
                  onPick={handlePick}
                  navsAt={navsAt}
                  deltasBetween={deltasBetween}
                />
              )}
            </section>

            {selection.phase === 'locked' && selectionDeltas && selectionDeltas.length > 0 && (
              <section className="mb-6">
                <SelectionDeltaPanel
                  deltas={selectionDeltas}
                  funds={selectedFunds}
                  startTime={selection.start}
                  endTime={selection.end}
                  onClear={() => setSelection({ phase: 'idle' })}
                />
              </section>
            )}

            {noDataFunds.length > 0 && (
              <p className="mb-4 text-sm text-ink-3">
                No data available in this range for:{' '}
                {selectedFunds
                  .filter((f) => noDataFunds.includes(f.schemeCode))
                  .map((f) => f.name)
                  .join(', ')}
              </p>
            )}

            <section>
              <ReturnsSummaryTable summaries={summaries} funds={selectedFunds} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
