import { describe, expect, it } from 'vitest';
import { toAscendingNavPoints } from './dateUtils';
import { computePctGrowthSeries, resolveEffectiveRange } from './normalize';
import { FUND_A, FUND_LATE, FUND_STALE, utc } from './__fixtures__/navData';

const JAN_1 = utc(2024, 1, 1);
const JAN_15 = utc(2024, 1, 15);

describe('resolveEffectiveRange', () => {
  // The original production bug: a discontinued scheme whose whole history predates the range
  // collapsed to a single point and reported "+0.00%" — a confident, wrong, plausible number.
  it('returns null for a fund whose entire history predates the range', () => {
    const points = toAscendingNavPoints(FUND_STALE.rows);

    expect(resolveEffectiveRange(points, JAN_1, JAN_15)).toBeNull();
  });

  it('snaps a non-trading start date back to the previous entry without calling it partial', () => {
    const points = toAscendingNavPoints(FUND_A.rows);

    // The 6th is a Saturday. The fund existed well before it; the range just landed off-market.
    const range = resolveEffectiveRange(points, utc(2024, 1, 6), JAN_15);

    expect(range).not.toBeNull();
    expect(range!.effectiveStart).toBe(utc(2024, 1, 5));
    expect(range!.startNav).toBe(110);
    expect(range!.isPartialRange).toBe(false);
  });

  it('falls back to the fund\'s own first point when it launched mid-range', () => {
    const points = toAscendingNavPoints(FUND_LATE.rows);

    const range = resolveEffectiveRange(points, JAN_1, JAN_15);

    expect(range).not.toBeNull();
    expect(range!.isPartialRange).toBe(true);
    expect(range!.effectiveStartIdx).toBe(0);
    expect(range!.effectiveStart).toBe(utc(2024, 1, 10));
  });

  it('returns null when the range ends before the fund has any data', () => {
    const points = toAscendingNavPoints(FUND_LATE.rows);

    expect(resolveEffectiveRange(points, JAN_1, utc(2024, 1, 5))).toBeNull();
  });

  it('returns null for an empty history', () => {
    expect(resolveEffectiveRange([], JAN_1, JAN_15)).toBeNull();
  });
});

describe('computePctGrowthSeries', () => {
  // Every other number on the chart is read relative to this one, so it has to be exactly zero —
  // not 1e-14, which would render as -0.00% for a fund that did nothing.
  it('starts at exactly zero', () => {
    const points = toAscendingNavPoints(FUND_A.rows);
    const range = resolveEffectiveRange(points, JAN_1, JAN_15)!;

    const series = computePctGrowthSeries(points, range);

    expect(series[0].pct).toBe(0);
    expect(series[0].time).toBe(range.effectiveStart);
    expect(series[series.length - 1].time).toBe(range.effectiveEnd);
  });

  it('is baselined on the effective start, not the fund\'s first ever NAV', () => {
    const points = toAscendingNavPoints(FUND_A.rows);
    // Starts on the 5th (NAV 110), not the 1st (NAV 100).
    const range = resolveEffectiveRange(points, utc(2024, 1, 5), utc(2024, 1, 15))!;

    const series = computePctGrowthSeries(points, range);
    const last = series[series.length - 1];

    expect(last.pct).toBeCloseTo((130 / 110 - 1) * 100, 9);
  });
});
