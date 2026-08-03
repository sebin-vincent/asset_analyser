import { describe, expect, it } from 'vitest';
import { toAscendingNavPoints } from './dateUtils';
import { hasValue, seedNavPoints, simulate, type Purchase } from './counterfactual';
import { mergeValueSeries } from './mergeSeries';
import { parseTradebook, type TradebookFund } from './tradebook';
import {
  ZERODHA_NAV_ROWS,
  ZERODHA_SCHEME_CODE,
  ZERODHA_SCHEME_NAME,
  ZERODHA_TRADEBOOK_CSV,
} from './__fixtures__/tradebookData';

// The cross-module contract for the what-if feature, mirroring what pipeline.test.ts does for the
// comparison chart. Real tradebook, real NAV history, whole chain:
//
//   parseTradebook -> seedNavPoints -> simulate -> mergeValueSeries

function realTradebook(): TradebookFund {
  const parsed = parseTradebook(ZERODHA_TRADEBOOK_CSV);
  if (parsed.kind !== 'ok') throw new Error(`fixture failed to parse: ${parsed.kind}`);
  return parsed.funds[0];
}

const published = toAscendingNavPoints(ZERODHA_NAV_ROWS);

function purchasesFrom(fund: TradebookFund, withUnits: boolean): Purchase[] {
  return fund.trades.map((t) => ({
    time: t.time,
    amount: t.amount,
    units: withUnits ? t.units : undefined,
  }));
}

describe('what-if pipeline', () => {
  // The heart of it: deriving units as `amount / NAV(trade date)` must land back on the exact
  // quantity the broker allotted. Since amount = quantity x price, this holds only if the NAV
  // lookup picks the right day — an off-by-one silently grabs a neighbouring NAV, the units
  // shift by a fraction of a percent, and nothing on screen looks wrong.
  it('reproduces the broker\'s own unit allotment from the cash flows', () => {
    const fund = realTradebook();
    const { points } = seedNavPoints(
      published,
      fund.trades.map((t) => ({ time: t.time, nav: t.nav })),
    );

    const derived = simulate(
      { schemeCode: ZERODHA_SCHEME_CODE, name: ZERODHA_SCHEME_NAME, points },
      purchasesFrom(fund, false), // no units supplied — force the NAV-derived path
    );

    expect(hasValue(derived)).toBe(true);
    if (!hasValue(derived)) throw new Error('unreachable');
    expect(derived.kind).toBe('ok'); // nothing skipped once the NFO date is seeded
    expect(derived.units).toBeCloseTo(fund.totalUnits, 6);
    expect(derived.units).toBeCloseTo(27723.45, 2);
  });

  // The NFO purchase on 13-08-2025 predates the fund's published history, which starts
  // 20-08-2025. Without the seed it is ₹9,999 — 3% of the portfolio — that vanishes.
  it('loses the first purchase without the seeded NAV point, and keeps it with one', () => {
    const fund = realTradebook();

    const unseeded = simulate(
      { schemeCode: ZERODHA_SCHEME_CODE, name: ZERODHA_SCHEME_NAME, points: published },
      purchasesFrom(fund, true),
    );
    if (!hasValue(unseeded)) throw new Error('expected a valued simulation');

    expect(unseeded.kind).toBe('partial');
    expect(unseeded.skippedAmount).toBeCloseTo(9999.5, 2);

    const { points, seeded } = seedNavPoints(
      published,
      fund.trades.map((t) => ({ time: t.time, nav: t.nav })),
    );
    expect(seeded).toHaveLength(1); // only the NFO date is missing from the published history

    const withSeed = simulate(
      { schemeCode: ZERODHA_SCHEME_CODE, name: ZERODHA_SCHEME_NAME, points },
      purchasesFrom(fund, true),
    );
    if (!hasValue(withSeed)) throw new Error('expected a valued simulation');

    expect(withSeed.kind).toBe('ok');
    expect(withSeed.skippedAmount).toBe(0);
    expect(withSeed.invested).toBeCloseTo(fund.totalInvested, 2);
  });

  // Hand-computed from the file and the published NAV history, independent of this code.
  it('lands on the portfolio figures computed by hand', () => {
    const fund = realTradebook();
    const { points } = seedNavPoints(
      published,
      fund.trades.map((t) => ({ time: t.time, nav: t.nav })),
    );

    const result = simulate(
      { schemeCode: ZERODHA_SCHEME_CODE, name: ZERODHA_SCHEME_NAME, points },
      purchasesFrom(fund, true),
    );
    if (!hasValue(result)) throw new Error('expected a valued simulation');

    expect(result.invested).toBeCloseTo(306984.65, 2);
    expect(result.finalNav).toBeCloseTo(11.4181, 4); // 31-07-2026
    expect(result.finalValue).toBeCloseTo(316549.12, 2);
    expect(result.gain).toBeCloseTo(9564.47, 2);
    expect(result.returnPct).toBeCloseTo(3.1156, 3);
    expect(result.xirrPct).not.toBeNull();
  });

  it('aligns two funds onto one timeline that includes every purchase date', () => {
    const fund = realTradebook();
    const { points } = seedNavPoints(
      published,
      fund.trades.map((t) => ({ time: t.time, nav: t.nav })),
    );

    const actual = simulate({ schemeCode: 1, name: 'Actual', points }, purchasesFrom(fund, true));
    // A hypothetical alternative that only started pricing partway through the timeline.
    const late = simulate(
      { schemeCode: 2, name: 'Late', points: points.filter((p) => p.time >= fund.trades[4].time) },
      purchasesFrom(fund, false),
    );
    if (!hasValue(actual) || !hasValue(late)) throw new Error('expected valued simulations');

    const chartData = mergeValueSeries(
      [
        { schemeCode: 1, series: actual.series },
        { schemeCode: 2, series: late.series },
      ],
      fund.trades.map((t) => t.time),
    );

    // Every purchase date has a row, so the line steps the day money went in.
    for (const trade of fund.trades) {
      expect(chartData.some((row) => row.date === trade.time)).toBe(true);
    }
    // The late fund is null until it starts, and never null again after.
    const lateStart = late.series[0].time;
    expect(chartData.filter((r) => r.date < lateStart).every((r) => r['2'] === null)).toBe(true);
    expect(chartData.filter((r) => r.date >= lateStart).every((r) => r['2'] !== null)).toBe(true);
    // And the actual fund, which was seeded back to the NFO, is never null.
    expect(chartData.every((r) => r['1'] !== null)).toBe(true);
  });
});
