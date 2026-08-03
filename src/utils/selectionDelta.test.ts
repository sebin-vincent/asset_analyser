import { describe, expect, it } from 'vitest';
import { toAscendingNavPoints } from './dateUtils';
import { computePctGrowthSeries, type EffectiveRange } from './normalize';
import {
  computeNavsAt,
  computeSelectionDeltas,
  resolveNavAt,
  type FundDelta,
  type FundDeltaInput,
} from './selectionDelta';
import {
  FUND_A,
  FUND_B,
  FUND_LATE,
  FUND_ZERO_START,
  INVERSION_A,
  INVERSION_B,
  makeInput,
  utc,
  type FundFixture,
} from './__fixtures__/navData';

const JAN_1 = utc(2024, 1, 1);
const JAN_15 = utc(2024, 1, 15);

function byCode(deltas: FundDelta[], schemeCode: number): FundDelta {
  const found = deltas.find((d) => d.schemeCode === schemeCode);
  if (!found) throw new Error(`no delta for scheme ${schemeCode}`);
  return found;
}

function expectValued(delta: FundDelta): Extract<FundDelta, { kind: 'ok' | 'partial' }> {
  if (delta.kind !== 'ok' && delta.kind !== 'partial') {
    throw new Error(`expected a valued delta for ${delta.name}, got "${delta.kind}"`);
  }
  return delta;
}

// The percentage the chart actually plots for this fund at `time` — i.e. what the eye reads off
// the y-axis. Deliberately a linear scan rather than findIndexAtOrBefore: reusing the binary
// search under test would let an off-by-one cancel out on both sides of the comparison.
function plottedPctAt(input: FundDeltaInput, time: number): number {
  const series = computePctGrowthSeries(input.points, input.effectiveRange);
  let pct: number | null = null;
  for (const point of series) {
    if (point.time <= time) pct = point.pct;
  }
  if (pct === null) throw new Error(`no plotted value at ${new Date(time).toISOString()}`);
  return pct;
}

// Derives the answer from the two plotted percentages instead of from raw NAVs. Both plotted
// values are ratios against the same range-start baseline, so the baseline divides out:
//   (nav2/nav0) / (nav1/nav0) = nav2/nav1
// A different route to the same number, which is the whole point of an oracle.
function oracleFromPlotted(p1: number, p2: number): number {
  return ((1 + p2 / 100) / (1 + p1 / 100) - 1) * 100;
}

describe('computeSelectionDeltas', () => {
  it('agrees with the percentages the chart plots', () => {
    const t1 = utc(2024, 1, 4);
    const t2 = utc(2024, 1, 12);
    const inputs = [FUND_A, FUND_B].map((f) => makeInput(f, JAN_1, JAN_15));

    const deltas = computeSelectionDeltas(inputs, t1, t2);

    for (const input of inputs) {
      const expected = oracleFromPlotted(plottedPctAt(input, t1), plottedPctAt(input, t2));
      const delta = expectValued(byCode(deltas, input.fund.schemeCode));
      expect(delta.pctChange).toBeCloseTo(expected, 9);
    }
  });

  // The bug this guards against shipped once in review and would have been invisible on screen:
  // both plotted values share a baseline, so their difference is not the change between them.
  it('is not the difference of the plotted percentages, and does not invert the ranking', () => {
    const rangeEnd = utc(2024, 1, 3);
    const t1 = utc(2024, 1, 2);
    const t2 = rangeEnd;
    const inputs = [INVERSION_A, INVERSION_B].map((f) => makeInput(f, JAN_1, rangeEnd));

    const deltas = computeSelectionDeltas(inputs, t1, t2);
    const a = expectValued(byCode(deltas, INVERSION_A.schemeCode));
    const b = expectValued(byCode(deltas, INVERSION_B.schemeCode));

    expect(a.pctChange).toBeCloseTo(25, 9);
    expect(b.pctChange).toBeCloseTo(90, 9);

    // What the naive subtraction would have produced, spelled out.
    const naiveA = plottedPctAt(inputs[0], t2) - plottedPctAt(inputs[0], t1); // +100pp
    const naiveB = plottedPctAt(inputs[1], t2) - plottedPctAt(inputs[1], t1); // +90pp
    expect(naiveA).toBeCloseTo(100, 9);
    expect(a.pctChange).not.toBeCloseTo(naiveA, 1);

    // And the part that actually misleads a reader: naive ranks A first, the truth ranks B first.
    expect(naiveA).toBeGreaterThan(naiveB);
    const ranked = [a, b].sort((x, y) => y.pctChange - x.pctChange);
    expect(ranked[0].schemeCode).toBe(INVERSION_B.schemeCode);
  });

  // Both endpoints landing on one NAV entry means the fund published nothing in the window.
  // mergeToChartData forward-fills a flat line there, indistinguishable from a genuinely flat
  // one, so "+0.00%" would be a confident lie. This bug class has already recurred twice.
  it('reports no-update rather than a zero when the fund was never repriced in the window', () => {
    const inputs = [makeInput(FUND_A, JAN_1, JAN_15)];

    // Saturday to Sunday: both resolve back to Friday the 5th.
    const deltas = computeSelectionDeltas(inputs, utc(2024, 1, 6), utc(2024, 1, 7));
    const delta = byCode(deltas, FUND_A.schemeCode);

    expect(delta.kind).toBe('no-update');
    expect(delta).toMatchObject({ atTime: utc(2024, 1, 5), nav: 110 });
    // Asserting the *absence* of the field is what makes a regression to +0.00% fail here.
    expect('pctChange' in delta).toBe(false);
  });

  it('flags a fund that enters partway through the window and measures from its own first point', () => {
    const inputs = [makeInput(FUND_LATE, JAN_1, JAN_15)];

    const deltas = computeSelectionDeltas(inputs, utc(2024, 1, 4), utc(2024, 1, 12));
    const delta = expectValued(byCode(deltas, FUND_LATE.schemeCode));

    expect(delta.kind).toBe('partial');
    expect(delta.startTime).toBe(utc(2024, 1, 10)); // its launch, not the requested 4th
    expect(delta.startNav).toBe(50);
    expect(delta.pctChange).toBeCloseTo(4, 9); // 50 -> 52
  });

  it('reports unavailable when the window sits entirely before the fund has data', () => {
    const inputs = [makeInput(FUND_LATE, JAN_1, JAN_15)];

    const deltas = computeSelectionDeltas(inputs, utc(2024, 1, 2), utc(2024, 1, 4));

    expect(byCode(deltas, FUND_LATE.schemeCode).kind).toBe('unavailable');
  });

  it('reports unavailable for reversed endpoints instead of a negated change', () => {
    const inputs = [makeInput(FUND_A, JAN_1, JAN_15)];

    const deltas = computeSelectionDeltas(inputs, utc(2024, 1, 12), utc(2024, 1, 4));

    expect(byCode(deltas, FUND_A.schemeCode).kind).toBe('unavailable');
  });

  // A zero start NAV survives parsing (toAscendingNavPoints filters NaN, not zero), so without
  // the guard this divides to Infinity and renders as "Infinity%".
  it('never emits a non-finite percentage', () => {
    const zeroInputs = [makeInput(FUND_ZERO_START, JAN_1, utc(2024, 1, 3))];
    expect(byCode(computeSelectionDeltas(zeroInputs, JAN_1, utc(2024, 1, 3)), 500).kind).toBe(
      'unavailable',
    );

    // Blanket sweep: every fixture against every pair of days in the range.
    const fixtures: FundFixture[] = [FUND_A, FUND_B, FUND_LATE, FUND_ZERO_START];
    const inputs = fixtures.map((f) => makeInput(f, JAN_1, JAN_15));
    for (let startDay = 1; startDay <= 15; startDay++) {
      for (let endDay = 1; endDay <= 15; endDay++) {
        const deltas = computeSelectionDeltas(inputs, utc(2024, 1, startDay), utc(2024, 1, endDay));
        for (const delta of deltas) {
          if (delta.kind === 'ok' || delta.kind === 'partial') {
            expect(Number.isFinite(delta.pctChange)).toBe(true);
          }
        }
      }
    }
  });
});

describe('resolveNavAt', () => {
  const points = toAscendingNavPoints(FUND_A.rows);

  function rangeFor(start: number, end: number): EffectiveRange {
    const input = makeInput(FUND_A, start, end);
    return input.effectiveRange;
  }

  it('resolves to the nearest entry at or before the requested time', () => {
    const resolved = resolveNavAt(points, rangeFor(JAN_1, JAN_15), utc(2024, 1, 6));

    // The 6th is a Saturday; the chart forward-fills Friday's value across it.
    expect(resolved).toMatchObject({ time: utc(2024, 1, 5), nav: 110 });
  });

  it('clamps to the end of the charted range rather than reading past it', () => {
    const resolved = resolveNavAt(points, rangeFor(JAN_1, utc(2024, 1, 12)), JAN_15);

    expect(resolved).toMatchObject({ time: utc(2024, 1, 12), nav: 125 });
  });

  it('returns null before the start of the charted range', () => {
    const resolved = resolveNavAt(points, rangeFor(utc(2024, 1, 5), JAN_15), utc(2024, 1, 2));

    expect(resolved).toBeNull();
  });

  it('returns null for a fund with no points', () => {
    expect(resolveNavAt([], rangeFor(JAN_1, JAN_15), utc(2024, 1, 5))).toBeNull();
  });
});

// CLAUDE.md calls this load-bearing: the tooltip's mid-pick preview and the committed panel must
// be the same computation, so they can never disagree about a number the user just saw.
describe('tooltip and panel consistency', () => {
  const t1 = utc(2024, 1, 4);
  const t2 = utc(2024, 1, 12);
  const inputs = [FUND_A, FUND_B, FUND_LATE].map((f) => makeInput(f, JAN_1, JAN_15));

  it('derives the same change from the NAVs the tooltip displays', () => {
    const navsAtStart = new Map(computeNavsAt(inputs, t1).map((n) => [n.schemeCode, n.nav]));
    const navsAtEnd = new Map(computeNavsAt(inputs, t2).map((n) => [n.schemeCode, n.nav]));

    for (const delta of computeSelectionDeltas(inputs, t1, t2)) {
      if (delta.kind !== 'ok') continue;
      const startNav = navsAtStart.get(delta.schemeCode);
      const endNav = navsAtEnd.get(delta.schemeCode);
      expect(startNav).toBeDefined();
      expect(endNav).toBeDefined();
      expect((endNav! / startNav! - 1) * 100).toBeCloseTo(delta.pctChange, 9);
    }
  });

  it('omits funds whose line has not started yet, matching the chart', () => {
    const before = computeNavsAt(inputs, t1).map((n) => n.schemeCode);
    const after = computeNavsAt(inputs, t2).map((n) => n.schemeCode);

    expect(before).not.toContain(FUND_LATE.schemeCode);
    expect(after).toContain(FUND_LATE.schemeCode);
  });
});
