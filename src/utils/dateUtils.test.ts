import { describe, expect, it } from 'vitest';
import { findIndexAtOrBefore, parseDDMMYYYY, parseTradebookDate, toAscendingNavPoints } from './dateUtils';
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

describe('parseTradebookDate', () => {
  // Zerodha exports have been observed in both shapes. Hardcoded literals, not Date.UTC-recomputed
  // expectations, matching the convention parseDDMMYYYY's own test already sets — so a switch to
  // new Date(str) fails on any machine west of UTC. Asymmetric day/month (1 Feb, 6 Aug) so a
  // group swap between the two formats can't hide behind a symmetric date.
  it.each([
    ['01-02-2024', 1706745600000],
    ['2024-02-01', 1706745600000],
    ['06-08-2025', 1754438400000],
    ['2025-08-06', 1754438400000],
  ])('parses %s as the expected UTC-midnight epoch', (input, expected) => {
    expect(parseTradebookDate(input)).toBe(expected);
  });

  // The attractive-but-wrong implementation is an else-branch dispatch ("not 4-digits-first, so
  // it must be DD-MM-YYYY"). Verified that sends '06-08-25' to Date.UTC(25, 7, 6) = 1925-08-06:
  // finite, an exact UTC midnight, and a perfectly plausible wrong date. Two disjoint anchored
  // shapes with no fallback is what rules this out.
  it.each(['06-08-25', '25-08-06', '2025-8-6', '6-8-2025'])(
    'rejects the two-digit-year / unpadded form %s rather than guessing',
    (input) => {
      expect(parseTradebookDate(input)).toBeNull();
    },
  );

  // A shape-only validator lets Date.UTC silently roll these over to a different, equally
  // plausible-looking date (2024-13-32 -> 2025-02-01, 2025-04-31 -> 2025-05-01).
  it.each(['32-13-2024', '2024-13-32', '00-01-2024', '2024-00-01', '31-04-2025', '2025-04-31'])(
    'rejects the calendar-invalid date %s rather than letting it roll over',
    (input) => {
      expect(parseTradebookDate(input)).toBeNull();
    },
  );

  // The sharpest case: a hand-rolled `day <= 31 && month <= 12` validator accepts 29 Feb on a
  // non-leap year as a valid shape, and Date.UTC quietly turns it into 1 Mar — one day off, which
  // is exactly the error crossCheckPrices' exact epoch-equality can't see (it just silently
  // reclassifies a matched price as unpublished). The 1900/2000 pair pins that century rules come
  // from Date.UTC's own arithmetic, not a hand-rolled `year % 4 === 0`.
  it.each([
    ['29-02-2025', null], // 2025 is not a leap year
    ['2025-02-29', null],
    ['29-02-2024', 1709164800000], // 2024 is a leap year
    ['2024-02-29', 1709164800000],
    ['29-02-1900', null], // divisible by 100 but not 400
    ['29-02-2000', 951782400000], // divisible by 400
  ])('resolves the leap-year edge case %s correctly', (input, expected) => {
    expect(parseTradebookDate(input)).toBe(expected);
  });

  // Both strings are literally the order_execution_time values found in real exports, so this is
  // the most likely accidental tolerance to creep in. Measured: new Date('2025-08-06T00:00:00')
  // is *local* midnight per spec, not UTC — an off-by-one on any machine behind UTC — which is
  // exactly the trap a "just hand it to new Date" tolerance would fall into.
  it.each(['2025-08-06T00:00:00', '2025-08-06 00:00', '13-08-2025 00:00'])(
    'rejects the timestamp-bearing value %s rather than truncating it',
    (input) => {
      expect(parseTradebookDate(input)).toBeNull();
    },
  );

  // '06/08/2025' is the one genuinely ambiguous near-miss in this space: it's exactly the shape
  // Excel writes on a locale round-trip, and en-IN's 6 Aug and en-US's 8 Jun are indistinguishable
  // from the string alone. Rejecting the whole slash family, rather than adding a locale guess,
  // is the point — pinning it here means a future "be more lenient" change has to argue with it.
  it.each(['06/08/2025', '2025/08/06', '06-Aug-2025', '', 'abc', '2025-08-06-01', '-2025-08-06'])(
    'rejects the near-miss %s',
    (input) => {
      expect(parseTradebookDate(input)).toBeNull();
    },
  );
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
