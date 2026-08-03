import { describe, expect, it } from 'vitest';
import { findIndexAtOrBefore, parseDDMMYYYY, toAscendingNavPoints } from './dateUtils';
import type { NavPoint } from '../types/fund';

describe('parseDDMMYYYY', () => {
  // Two failure modes, both silent: reading the string as MM-DD (every date wrong by months),
  // and parsing in local time (every date off by one on machines behind UTC).
  it('reads day first, not month first', () => {
    const parsed = new Date(parseDDMMYYYY('01-02-2024'));

    expect(parsed.getUTCDate()).toBe(1);
    expect(parsed.getUTCMonth()).toBe(1); // February
  });

  it('lands on UTC midnight regardless of the machine timezone', () => {
    // A hardcoded epoch literal on purpose: rebuilding the expectation with Date.UTC would just
    // restate the implementation and would still pass if it switched to local-time parsing.
    expect(parseDDMMYYYY('01-02-2024')).toBe(1706745600000);
    expect(parseDDMMYYYY('15-01-2024')).toBe(1705276800000);
  });
});

describe('toAscendingNavPoints', () => {
  it('reverses mfapi\'s newest-first order and coerces the string NAVs', () => {
    const points = toAscendingNavPoints([
      { date: '03-01-2024', nav: '102.5000' },
      { date: '02-01-2024', nav: '101.0000' },
      { date: '01-01-2024', nav: '100.0000' },
    ]);

    expect(points.map((p) => p.nav)).toEqual([100, 101, 102.5]);
    expect(points[0].time).toBeLessThan(points[2].time);
  });

  // mfapi occasionally returns non-numeric NAVs for a scheme's earliest rows.
  it('drops unparseable NAVs but keeps a legitimate zero', () => {
    const points = toAscendingNavPoints([
      { date: '03-01-2024', nav: '12.0000' },
      { date: '02-01-2024', nav: 'N.A.' },
      { date: '01-01-2024', nav: '0.0000' },
    ]);

    // Keeping the zero is why selectionDelta carries its own `start.nav <= 0` guard — if this
    // ever starts filtering zeros, that guard becomes dead code rather than a live contract.
    expect(points.map((p) => p.nav)).toEqual([0, 12]);
  });
});

describe('findIndexAtOrBefore', () => {
  const points: NavPoint[] = [
    { time: 10, nav: 1 },
    { time: 20, nav: 2 },
    { time: 30, nav: 3 },
  ];

  // A binary search breaks off-by-one under refactor and the symptom is a plausible wrong NAV,
  // not a crash — so the boundaries are enumerated rather than sampled.
  it.each([
    ['an exact match', 20, 1],
    ['a time between entries', 25, 1],
    ['a time before every entry', 5, -1],
    ['a time after every entry', 100, 2],
    ['the first entry exactly', 10, 0],
    ['the last entry exactly', 30, 2],
  ])('resolves %s', (_label, target, expected) => {
    expect(findIndexAtOrBefore(points, target)).toBe(expected);
  });

  it('handles a single-entry history', () => {
    const single: NavPoint[] = [{ time: 10, nav: 1 }];

    expect(findIndexAtOrBefore(single, 10)).toBe(0);
    expect(findIndexAtOrBefore(single, 11)).toBe(0);
    expect(findIndexAtOrBefore(single, 9)).toBe(-1);
  });

  it('handles an empty history', () => {
    expect(findIndexAtOrBefore([], 10)).toBe(-1);
  });
});
