import { describe, expect, it } from 'vitest';
import { computeAbsoluteReturnPct, computeCagrPct } from './returns';

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365.25 * DAY_MS;
const T0 = Date.UTC(2020, 0, 1);

describe('computeCagrPct', () => {
  // Hand-computed known answer: doubling over two years is an annualised sqrt(2) - 1.
  // A wrong CAGR is the most quietly dangerous number in the app — it looks authoritative and
  // nobody recomputes it.
  it('annualises a doubling over two years to sqrt(2) - 1', () => {
    const cagr = computeCagrPct(100, 200, T0, T0 + 2 * YEAR_MS);

    expect(cagr).not.toBeNull();
    expect(cagr!).toBeCloseTo((Math.SQRT2 - 1) * 100, 9);
    expect(cagr!).toBeCloseTo(41.4213562373, 9);
  });

  it('equals the absolute return over exactly one year', () => {
    const cagr = computeCagrPct(100, 110, T0, T0 + YEAR_MS);

    expect(cagr!).toBeCloseTo(computeAbsoluteReturnPct(100, 110), 9);
  });

  it('annualises a loss to a negative figure', () => {
    const cagr = computeCagrPct(200, 100, T0, T0 + 2 * YEAR_MS);

    expect(cagr!).toBeCloseTo((1 / Math.SQRT2 - 1) * 100, 9);
    expect(cagr!).toBeLessThan(0);
  });

  // Under a day, annualising raises a near-1 ratio to a huge power and produces a number in the
  // thousands of percent. Returning null is the only honest answer.
  it('returns null for a span shorter than a day', () => {
    expect(computeCagrPct(100, 101, T0, T0 + DAY_MS / 2)).toBeNull();
    expect(computeCagrPct(100, 101, T0, T0)).toBeNull();
  });

  it('still reports at a span of exactly one day', () => {
    expect(computeCagrPct(100, 101, T0, T0 + YEAR_MS / 365.25)).not.toBeNull();
  });
});
