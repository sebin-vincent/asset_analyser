import { describe, expect, it } from 'vitest';
import { computeXirrPct, npv, type CashFlow } from './xirr';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2024, 0, 1);

function flow(yearsFromStart: number, amount: number): CashFlow {
  return { time: T0 + yearsFromStart * YEAR_MS, amount };
}

describe('computeXirrPct', () => {
  it('returns the simple rate when there is one investment and one exit', () => {
    // ₹100 in, ₹110 back a year later. Nothing clever to do: that is 10%.
    const rate = computeXirrPct([flow(0, -100), flow(1, 110)]);

    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(10, 9);
  });

  // The independent check on any root-finder: put the answer back into the equation it claims to
  // have solved. This holds for flow patterns whose correct rate nobody can compute by hand.
  it.each([
    ['a lumpsum with a later top-up', [flow(0, -1000), flow(0.5, -500), flow(2, 1800)]],
    ['a monthly SIP over a year', [
      ...Array.from({ length: 12 }, (_, i) => flow(i / 12, -5000)),
      flow(1, 64000),
    ]],
    ['a loss-making portfolio', [flow(0, -10000), flow(1, -5000), flow(3, 11000)]],
    ['irregular, closely spaced flows', [
      flow(0, -100),
      flow(0.01, -2000),
      flow(0.03, -50),
      flow(0.9, 2300),
    ]],
  ])('solves %s to an NPV of zero', (_label, flows) => {
    const rate = computeXirrPct(flows);

    expect(rate).not.toBeNull();
    expect(npv(flows, rate! / 100)).toBeCloseTo(0, 6);
  });

  it('reports a loss as a negative rate', () => {
    const rate = computeXirrPct([flow(0, -1000), flow(1, 900)]);

    expect(rate!).toBeCloseTo(-10, 9);
  });

  // Null rather than a plausible-looking number: there is no rate to report in these cases, and
  // inventing one would put a confident figure next to someone's money.
  it.each([
    ['a single flow', [flow(0, -100)]],
    ['no flows', []],
    ['only investments, never an exit', [flow(0, -100), flow(1, -100)]],
    ['only returns, never an investment', [flow(0, 100), flow(1, 100)]],
    ['every flow on the same day', [
      { time: T0, amount: -100 },
      { time: T0, amount: 110 },
    ]],
  ])('returns null for %s', (_label, flows) => {
    expect(computeXirrPct(flows)).toBeNull();
  });

  it('does not depend on the order the flows are supplied in', () => {
    const ordered = [flow(0, -1000), flow(0.5, -500), flow(2, 1800)];
    const shuffled = [ordered[2], ordered[0], ordered[1]];

    expect(computeXirrPct(shuffled)!).toBeCloseTo(computeXirrPct(ordered)!, 9);
  });

  // A near-total loss drives the rate toward -100%, where the discount factor blows up. It has to
  // come back with a finite number or null, never NaN or Infinity.
  it('stays finite for a near-total loss', () => {
    const rate = computeXirrPct([flow(0, -10000), flow(1, 1)]);

    expect(rate === null || Number.isFinite(rate)).toBe(true);
    if (rate !== null) expect(rate).toBeLessThan(-90);
  });
});
