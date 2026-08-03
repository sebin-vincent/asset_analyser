import { describe, expect, it } from 'vitest';
import { hasValue, seedNavPoints, simulate, type Purchase } from './counterfactual';
import { utc } from './__fixtures__/navData';
import type { NavPoint } from '../types/fund';

function navs(entries: [day: number, nav: number][]): NavPoint[] {
  return entries.map(([day, nav]) => ({ time: utc(2024, 1, day), nav }));
}

function buy(day: number, amount: number, units?: number): Purchase {
  return { time: utc(2024, 1, day), amount, units };
}

function input(points: NavPoint[]) {
  return { schemeCode: 1, name: 'Test Fund', points };
}

function valued(...args: Parameters<typeof simulate>) {
  const result = simulate(...args);
  if (!hasValue(result)) throw new Error(`expected a valued simulation, got "${result.kind}"`);
  return result;
}

describe('simulate', () => {
  // The identity the whole feature rests on: the reported value is the units you would hold,
  // priced at the latest NAV. If these diverge, every rupee figure on screen is wrong.
  it('reports a final value equal to units held at the final NAV', () => {
    const result = valued(input(navs([[1, 10], [2, 11], [3, 12]])), [buy(1, 1000), buy(2, 2200)]);

    // 100 units at ₹10, then 200 at ₹11.
    expect(result.units).toBeCloseTo(300, 9);
    expect(result.finalNav).toBe(12);
    expect(result.finalValue).toBeCloseTo(result.units * result.finalNav, 9);
    expect(result.finalValue).toBeCloseTo(3600, 9);
    expect(result.invested).toBeCloseTo(3200, 9);
    expect(result.gain).toBeCloseTo(400, 9);
  });

  // A purchase on a non-trading day must still move the line that day — otherwise the chart
  // shows money sitting outside the portfolio for a weekend.
  it('steps the value on the purchase date, not the next trading day', () => {
    // The 6th and 7th are a weekend; the fund is priced on the 5th and again on the 8th.
    const result = valued(input(navs([[5, 10], [8, 10]])), [buy(5, 1000), buy(6, 1000)]);

    const at5 = result.series.find((p) => p.time === utc(2024, 1, 5))!;
    const at6 = result.series.find((p) => p.time === utc(2024, 1, 6))!;

    expect(at6).toBeDefined();
    expect(at6.value).toBeCloseTo(2000, 9); // both purchases already counted
    expect(at5.value).toBeCloseTo(1000, 9);
  });

  it('prices a non-trading-day purchase at the last published NAV', () => {
    const result = valued(input(navs([[5, 10], [8, 20]])), [buy(6, 1000)]);

    // Bought on the 6th at the 5th's NAV of 10 — not at the 8th's 20.
    expect(result.units).toBeCloseTo(100, 9);
  });

  // The money-losing case that would be invisible: a fund that launched late simply cannot have
  // received the early purchases, and quietly investing less would make it look cheaper.
  it('records purchases made before the fund existed instead of dropping them', () => {
    const result = valued(input(navs([[10, 50]])), [buy(1, 9999), buy(10, 5000)]);

    expect(result.kind).toBe('partial');
    expect(result.skippedPurchases).toHaveLength(1);
    expect(result.skippedAmount).toBeCloseTo(9999, 9);
    expect(result.invested).toBeCloseTo(5000, 9); // only the money it could actually take
  });

  it('is unavailable, not a zero portfolio, when every purchase predates the fund', () => {
    const result = simulate(input(navs([[20, 50]])), [buy(1, 1000), buy(5, 1000)]);

    expect(result).toMatchObject({ kind: 'unavailable', reason: 'launched-after-all-purchases' });
    expect('finalValue' in result).toBe(false);
  });

  // Found in the browser against a real discontinued scheme (HDFC Focused Large-Cap Fund, whose
  // NAV history ends in June 2014). Every 2026 purchase resolved at-or-before to that final 2014
  // NAV, so units x nav came back as *exactly* the amount invested and the fund reported a
  // flawless +₹0 / +0.00%. Nothing on screen looked wrong.
  it('refuses a discontinued fund instead of pricing every purchase at its last stale NAV', () => {
    const stale = navs([[1, 12.265], [2, 12.265]]).map((p) => ({ ...p, time: utc(2014, 6, 20) }));

    const result = simulate(input(stale), [buy(1, 100000), buy(2, 200000)]);

    expect(result).toMatchObject({ kind: 'unavailable', reason: 'history-ends-before-purchases' });
  });

  it('accepts a fund whose history ends after the last purchase', () => {
    const result = valued(input(navs([[1, 10], [5, 12]])), [buy(1, 1000), buy(2, 1000)]);

    // Priced at the 1st for both purchases, then valued at the 5th — legitimate.
    expect(result.finalNav).toBe(12);
    expect(result.finalValue).toBeCloseTo(2400, 9);
  });

  it('is unavailable when the fund has no NAV data at all', () => {
    expect(simulate(input([]), [buy(1, 1000)])).toMatchObject({
      kind: 'unavailable',
      reason: 'no-nav-data',
    });
  });

  // Supplied for the tradebook's own fund, where the broker's allotment is the truth.
  it('uses supplied units in preference to deriving them from NAV', () => {
    const result = valued(input(navs([[1, 10], [2, 10]])), [buy(1, 1000, 123.456)]);

    expect(result.units).toBeCloseTo(123.456, 9);
    expect(result.finalValue).toBeCloseTo(1234.56, 9);
  });

  it('never emits a non-finite figure', () => {
    const result = valued(input(navs([[1, 10], [2, 12]])), [buy(1, 1000), buy(2, 500)]);

    for (const key of ['units', 'invested', 'finalValue', 'gain', 'returnPct'] as const) {
      expect(Number.isFinite(result[key])).toBe(true);
    }
    expect(result.series.every((p) => Number.isFinite(p.value))).toBe(true);
  });

  it('skips a purchase priced at a zero NAV rather than dividing by it', () => {
    const result = valued(input(navs([[1, 0], [2, 10]])), [buy(1, 1000), buy(2, 1000)]);

    expect(result.kind).toBe('partial');
    expect(Number.isFinite(result.units)).toBe(true);
    expect(result.units).toBeCloseTo(100, 9);
  });

  it('annualises with XIRR rather than treating the money as one lump sum', () => {
    // ₹1000 on day 1 and ₹1000 much later are not the same investment, and a single CAGR over
    // the whole span would credit them equally.
    const points: NavPoint[] = [
      { time: utc(2024, 1, 1), nav: 10 },
      { time: utc(2025, 1, 1), nav: 11 },
    ];
    const result = valued(input(points), [
      { time: utc(2024, 1, 1), amount: 1000 },
      { time: utc(2025, 1, 1), amount: 1000 },
    ]);

    expect(result.xirrPct).not.toBeNull();
    // Only the first ₹1000 was exposed for the year, so XIRR is ~10%, while the naive
    // return-on-total-invested is only ~4.8%.
    expect(result.xirrPct!).toBeCloseTo(10, 1);
    expect(result.returnPct).toBeLessThan(6);
  });
});

describe('seedNavPoints', () => {
  it('adds only the dates the published history is missing, keeping order', () => {
    const published = navs([[10, 50], [11, 51]]);
    const seeds = navs([[1, 40], [10, 999]]); // the 10th is already published

    const { points, seeded } = seedNavPoints(published, seeds);

    expect(seeded).toHaveLength(1);
    expect(seeded[0].time).toBe(utc(2024, 1, 1));
    expect(points.map((p) => p.nav)).toEqual([40, 50, 51]); // published 50 wins over the seed
    expect(points.map((p) => p.time)).toEqual([...points].sort((a, b) => a.time - b.time).map((p) => p.time));
  });

  it('returns the original points untouched when nothing is missing', () => {
    const published = navs([[10, 50]]);

    const { points, seeded } = seedNavPoints(published, navs([[10, 999]]));

    expect(seeded).toHaveLength(0);
    expect(points).toBe(published);
  });

  // The case it exists for: an NFO allotment that predates the scheme's published NAV history.
  it('lets a purchase before the published history be valued', () => {
    const published = navs([[10, 11]]);
    const { points } = seedNavPoints(published, navs([[1, 10]]));

    const result = valued(input(points), [buy(1, 1000), buy(10, 1100)]);

    expect(result.kind).toBe('ok'); // nothing skipped
    expect(result.units).toBeCloseTo(200, 9);
    expect(result.finalValue).toBeCloseTo(2200, 9);
  });
});
