import { useCallback, useEffect, useMemo, useState } from 'react';
import { FundSearch } from './components/FundSearch';
import { SelectedFundsList } from './components/SelectedFundsList';
import { DateRangePicker } from './components/DateRangePicker';
import { ComparisonChart } from './components/ComparisonChart';
import { ReturnsSummaryTable } from './components/ReturnsSummaryTable';
import { SelectionDeltaPanel } from './components/SelectionDeltaPanel';
import { EmptyState } from './components/EmptyStates';
import { useSelectedFunds } from './hooks/useSelectedFunds';
import { useFundHistories } from './hooks/useFundHistory';
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

function App() {
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
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-[#0b0b0b] dark:text-white">
          Mutual Fund Comparison
        </h1>
        <p className="mt-1 text-sm text-[#52514e] dark:text-[#c3c2b7]">
          Compare the historical performance of Indian mutual funds across any date range.
        </p>
      </header>

      <section className="mb-6 flex flex-col gap-4">
        <FundSearch onAdd={add} existingCodes={existingCodes} />
        <SelectedFundsList
          funds={selectedFunds}
          onRemove={remove}
          loading={loading}
          errors={errors}
          onRetry={retry}
          partialRangeNotes={partialRangeNotes}
        />
      </section>

      <section className="mb-6">
        <DateRangePicker range={dateRange} onChange={setDateRange} earliestAvailable={earliestAvailable} />
      </section>

      <section className="mb-6">
        {selectedFunds.length === 0 ? (
          <EmptyState
            title="No funds selected yet"
            description="Search for a mutual fund above and add a few to compare their performance."
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
        <p className="mb-4 text-sm text-[#898781]">
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
    </div>
  );
}

export default App;
