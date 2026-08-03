import type { NavPoint } from '../types/fund';
import { findIndexAtOrBefore } from './dateUtils';
import type { ValuePoint } from './mergeSeries';
import { computeXirrPct, type CashFlow } from './xirr';

// Replays a real purchase timeline against some fund's NAV history: "if this money had gone into
// that fund instead, on the same dates, what would it be worth now?"
//
// Every fund receives identical cash flows on identical dates, which is what makes plotting
// rupee values directly comparable between them.

export interface Purchase {
  time: number;
  amount: number;
  // The broker's actual allotment, when known. Supplied for the fund the tradebook is *from*,
  // where the CSV is authoritative; omitted for alternatives, whose units we derive from NAV.
  units?: number;
}

export type FundSimulation =
  | {
      kind: 'ok' | 'partial';
      schemeCode: number;
      name: string;
      units: number;
      invested: number; // only what actually got invested
      series: ValuePoint[];
      finalTime: number;
      finalNav: number;
      finalValue: number;
      gain: number;
      returnPct: number;
      xirrPct: number | null;
      // Non-empty only for 'partial'. Purchases the fund could not have received because it
      // didn't exist yet — surfaced in rupees, never silently dropped, because a fund that
      // "invested" less would otherwise look artificially cheap.
      skippedPurchases: Purchase[];
      skippedAmount: number;
    }
  | {
      kind: 'unavailable';
      schemeCode: number;
      name: string;
      reason: 'no-nav-data' | 'launched-after-all-purchases' | 'history-ends-before-purchases';
    };

export interface SimulationInput {
  schemeCode: number;
  name: string;
  points: NavPoint[]; // ascending
}

// Fills gaps in a fund's published history from NAV points we know independently. Used for the
// tradebook's own fund: the CSV's `price` column *is* that fund's NAV on the trade date (verified
// to four decimals against mfapi), so it is a valid source for dates mfapi doesn't cover — such
// as an NFO allotment that predates the scheme's published history.
export function seedNavPoints(
  points: NavPoint[],
  seeds: NavPoint[],
): { points: NavPoint[]; seeded: NavPoint[] } {
  const known = new Set(points.map((p) => p.time));
  const seeded = seeds.filter((s) => !known.has(s.time));
  if (seeded.length === 0) return { points, seeded };

  const merged = [...points, ...seeded].sort((a, b) => a.time - b.time);
  return { points: merged, seeded };
}

export function simulate(input: SimulationInput, purchases: Purchase[]): FundSimulation {
  const { schemeCode, name, points } = input;
  const identity = { schemeCode, name };

  if (points.length === 0 || purchases.length === 0) {
    return { kind: 'unavailable', ...identity, reason: 'no-nav-data' };
  }

  const ordered = [...purchases].sort((a, b) => a.time - b.time);

  // A discontinued scheme's history ends long before these purchases. Resolving at-or-before
  // would price every one of them at that final stale NAV, so units x nav returns exactly the
  // amount invested and the fund reports a flawless +0.00% — the same misleading zero
  // resolveEffectiveRange guards against, and just as invisible on screen.
  if (points[points.length - 1].time < ordered[ordered.length - 1].time) {
    return { kind: 'unavailable', ...identity, reason: 'history-ends-before-purchases' };
  }

  const invested: { purchase: Purchase; units: number }[] = [];
  const skippedPurchases: Purchase[] = [];

  for (const purchase of ordered) {
    // Same at-or-before convention as the rest of the app: a purchase on a non-trading day is
    // priced at the last published NAV, which is what actually happens.
    const idx = findIndexAtOrBefore(points, purchase.time);
    if (idx === -1) {
      // The fund did not exist yet. It cannot have received this money.
      skippedPurchases.push(purchase);
      continue;
    }
    const nav = points[idx].nav;
    if (nav <= 0) {
      skippedPurchases.push(purchase);
      continue;
    }
    invested.push({ purchase, units: purchase.units ?? purchase.amount / nav });
  }

  if (invested.length === 0) {
    return { kind: 'unavailable', ...identity, reason: 'launched-after-all-purchases' };
  }

  const firstTime = invested[0].purchase.time;

  // Rows at every NAV date from the first investment onward, plus every purchase date — so the
  // line steps up on the day money went in rather than on the next trading day.
  const dates = new Set<number>();
  for (const { purchase } of invested) dates.add(purchase.time);
  for (const point of points) if (point.time >= firstTime) dates.add(point.time);
  const timeline = Array.from(dates).sort((a, b) => a - b);

  const series: ValuePoint[] = [];
  let cumulativeUnits = 0;
  let investedIdx = 0;
  let navIdx = -1;

  for (const time of timeline) {
    while (investedIdx < invested.length && invested[investedIdx].purchase.time <= time) {
      cumulativeUnits += invested[investedIdx].units;
      investedIdx++;
    }
    while (navIdx + 1 < points.length && points[navIdx + 1].time <= time) navIdx++;
    if (navIdx < 0) continue;
    series.push({ time, value: cumulativeUnits * points[navIdx].nav });
  }

  const totalUnits = invested.reduce((sum, i) => sum + i.units, 0);
  const totalInvested = invested.reduce((sum, i) => sum + i.purchase.amount, 0);
  const last = series[series.length - 1];
  const finalNav = points[navIdx].nav;
  const finalValue = last.value;

  const flows: CashFlow[] = invested.map(({ purchase }) => ({
    time: purchase.time,
    amount: -purchase.amount,
  }));
  flows.push({ time: last.time, amount: finalValue });

  const skippedAmount = skippedPurchases.reduce((sum, p) => sum + p.amount, 0);

  return {
    kind: skippedPurchases.length > 0 ? 'partial' : 'ok',
    ...identity,
    units: totalUnits,
    invested: totalInvested,
    series,
    finalTime: last.time,
    finalNav,
    finalValue,
    gain: finalValue - totalInvested,
    returnPct: (finalValue / totalInvested - 1) * 100,
    xirrPct: computeXirrPct(flows),
    skippedPurchases,
    skippedAmount,
  };
}

export function hasValue(
  simulation: FundSimulation,
): simulation is Extract<FundSimulation, { kind: 'ok' | 'partial' }> {
  return simulation.kind === 'ok' || simulation.kind === 'partial';
}
