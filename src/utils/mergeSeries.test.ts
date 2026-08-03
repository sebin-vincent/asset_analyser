import { describe, expect, it } from 'vitest';
import { buildUnionDates, mergeToChartData, type FundSeriesInput } from './mergeSeries';

// Small synthetic series rather than the NAV fixtures: this module only sees percentages, and
// hand-written times make the alignment behaviour readable.
function series(schemeCode: number, entries: [time: number, pct: number][]): FundSeriesInput {
  return { schemeCode, series: entries.map(([time, pct]) => ({ time, pct })) };
}

describe('buildUnionDates', () => {
  it('returns every fund\'s dates once, in ascending order', () => {
    const dates = buildUnionDates([
      series(1, [
        [30, 0],
        [10, 0],
      ]),
      series(2, [
        [20, 0],
        [10, 0],
      ]),
    ]);

    expect(dates).toEqual([10, 20, 30]);
  });

  it('returns an empty list when there are no funds', () => {
    expect(buildUnionDates([])).toEqual([]);
  });
});

describe('mergeToChartData', () => {
  // The honest reading of a missing day: the fund simply wasn't priced, so it still holds its
  // last known value. Interpolating would invent a NAV it never published.
  it('forward-fills a missing date with the previous value, never an interpolated one', () => {
    const chartData = mergeToChartData([
      series(1, [
        [10, 10],
        [30, 30],
      ]),
      series(2, [
        [10, 0],
        [20, 0],
        [30, 0],
      ]),
    ]);

    const gapRow = chartData.find((row) => row.date === 20)!;

    expect(gapRow['1']).toBe(10); // carried from t=10
    expect(gapRow['1']).not.toBe(20); // the midpoint an interpolation would have produced
  });

  it('leaves a fund null before its first data point', () => {
    const chartData = mergeToChartData([
      series(1, [
        [10, 0],
        [20, 5],
        [30, 8],
      ]),
      series(2, [[30, 0]]),
    ]);

    expect(chartData.map((row) => row['2'])).toEqual([null, null, 0]);
  });

  // Load-bearing for selectionDelta: a fund whose NAV lags keeps drawing a flat line to the end
  // of the range rather than stopping. That flat line is exactly what 'no-update' exists to
  // describe. If this ever emits trailing nulls, 'no-update' silently changes meaning.
  it('never emits a trailing null for a fund whose data ends early', () => {
    const chartData = mergeToChartData([
      series(1, [
        [10, 0],
        [20, 5],
        [30, 8],
        [40, 12],
      ]),
      series(2, [
        [10, 0],
        [20, 3],
      ]),
    ]);

    expect(chartData.map((row) => row['2'])).toEqual([0, 3, 3, 3]);
  });

  it('keeps one row per union date, carrying the date through as the key', () => {
    const chartData = mergeToChartData([
      series(1, [
        [10, 0],
        [20, 1],
      ]),
      series(2, [
        [15, 0],
        [20, 2],
      ]),
    ]);

    expect(chartData.map((row) => row.date)).toEqual([10, 15, 20]);
  });

  it('returns no rows when no fund has data', () => {
    expect(mergeToChartData([])).toEqual([]);
  });
});
