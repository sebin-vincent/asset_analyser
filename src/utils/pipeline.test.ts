import { describe, expect, it } from 'vitest';
import { toAscendingNavPoints } from './dateUtils';
import { computePctGrowthSeries, resolveEffectiveRange } from './normalize';
import { mergeToChartData, type FundSeriesInput } from './mergeSeries';
import { computeSelectionDeltas, type FundDeltaInput } from './selectionDelta';
import type { ChartPoint } from '../types/fund';
import { FUND_A, FUND_B, FUND_LATE, toFund, utc, type FundFixture } from './__fixtures__/navData';

// The cross-module contract. Every other spec pins one module in isolation; this one runs the
// real chain end to end and checks that the numbers the panel reports still agree with the
// numbers the chart drew. It is the test that catches a refactor rather than a typo.
//
//   raw mfapi rows -> toAscendingNavPoints -> resolveEffectiveRange
//                  -> computePctGrowthSeries -> mergeToChartData

const JAN_1 = utc(2024, 1, 1);
const JAN_15 = utc(2024, 1, 15);

interface Pipeline {
  inputs: FundDeltaInput[];
  chartData: ChartPoint[];
}

function runPipeline(fixtures: FundFixture[], rangeStart: number, rangeEnd: number): Pipeline {
  const inputs: FundDeltaInput[] = [];
  const seriesInputs: FundSeriesInput[] = [];

  for (const fixture of fixtures) {
    const points = toAscendingNavPoints(fixture.rows);
    const effectiveRange = resolveEffectiveRange(points, rangeStart, rangeEnd);
    if (!effectiveRange) continue; // App drops these funds from the chart entirely
    inputs.push({ fund: toFund(fixture), points, effectiveRange });
    seriesInputs.push({
      schemeCode: fixture.schemeCode,
      series: computePctGrowthSeries(points, effectiveRange),
    });
  }

  return { inputs, chartData: mergeToChartData(seriesInputs) };
}

function rowAt(chartData: ChartPoint[], time: number): ChartPoint {
  const row = chartData.find((r) => r.date === time);
  if (!row) throw new Error(`no chart row at ${new Date(time).toISOString()}`);
  return row;
}

describe('chart pipeline', () => {
  it('reports deltas consistent with the percentages it plotted', () => {
    const t1 = utc(2024, 1, 4);
    const t2 = utc(2024, 1, 12);
    const { inputs, chartData } = runPipeline([FUND_A, FUND_B, FUND_LATE], JAN_1, JAN_15);

    const deltas = computeSelectionDeltas(inputs, t1, t2);
    const startRow = rowAt(chartData, t1);
    const endRow = rowAt(chartData, t2);

    let checked = 0;
    for (const delta of deltas) {
      if (delta.kind !== 'ok') continue; // 'partial' has no plotted value at t1 by definition
      const p1 = startRow[String(delta.schemeCode)];
      const p2 = endRow[String(delta.schemeCode)];
      expect(p1).not.toBeNull();
      expect(p2).not.toBeNull();

      // Both plotted values share the range-start baseline, so it divides out.
      const oracle = ((1 + p2! / 100) / (1 + p1! / 100) - 1) * 100;
      expect(delta.pctChange).toBeCloseTo(oracle, 9);
      checked++;
    }

    expect(checked).toBe(2); // FUND_A and FUND_B; FUND_LATE is 'partial' here
  });

  // FUND_A and FUND_B have divergent gaps, so the union contains a day each of them missed. The
  // flat segment the chart draws across such a day must be the same fact the panel reports as
  // 'no-update' — if these two ever disagree, the chart is showing a change the panel denies.
  it('agrees with its own forward-fill about which fund was repriced', () => {
    const jan5 = utc(2024, 1, 5);
    const jan8 = utc(2024, 1, 8); // FUND_A has no entry
    const jan9 = utc(2024, 1, 9); // FUND_B has no entry
    const { inputs, chartData } = runPipeline([FUND_A, FUND_B], JAN_1, JAN_15);

    const a = String(FUND_A.schemeCode);
    const b = String(FUND_B.schemeCode);

    // Forward-filled, not interpolated: the carried value is exactly the previous one.
    expect(rowAt(chartData, jan8)[a]).toBe(rowAt(chartData, jan5)[a]);
    expect(rowAt(chartData, jan9)[b]).toBe(rowAt(chartData, jan8)[b]);

    const deltas = computeSelectionDeltas(inputs, jan8, jan9);
    const forA = deltas.find((d) => d.schemeCode === FUND_A.schemeCode);
    const forB = deltas.find((d) => d.schemeCode === FUND_B.schemeCode);

    // A was repriced on the 9th; B's line is flat across both days.
    expect(forA?.kind).toBe('ok');
    expect(forB?.kind).toBe('no-update');
    expect(rowAt(chartData, jan8)[b]).toBe(rowAt(chartData, jan9)[b]);
  });

  // What makes connectNulls={false} start a later-launching fund's line partway across.
  it('leaves a late-launching fund null until its first point, then never again', () => {
    const { chartData } = runPipeline([FUND_A, FUND_B, FUND_LATE], JAN_1, JAN_15);
    const late = String(FUND_LATE.schemeCode);
    const launch = utc(2024, 1, 10);

    const beforeLaunch = chartData.filter((row) => row.date < launch);
    const fromLaunch = chartData.filter((row) => row.date >= launch);

    expect(beforeLaunch.length).toBeGreaterThan(0);
    expect(fromLaunch.length).toBeGreaterThan(0);
    expect(beforeLaunch.every((row) => row[late] === null)).toBe(true);
    expect(fromLaunch.every((row) => row[late] !== null)).toBe(true);
    expect(rowAt(chartData, launch)[late]).toBe(0); // baselined on its own launch NAV
  });
});
