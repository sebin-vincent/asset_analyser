import type { FundMeta, NavPoint } from '../types/fund';
import { findIndexAtOrBefore } from './dateUtils';
import type { Trade } from './tradebook';

// Identifying which mfapi scheme a tradebook row refers to.
//
// The CSV carries an ISIN, and mfapi exposes one in `meta.isin_growth` — but its search endpoint
// does *not* index ISIN (`?q=INF0R8F01117` returns []). So the ISIN can confirm a match, never
// find one. Names have to do the finding, and the search endpoint is weak at that: the verbatim
// symbol "ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH" returns nothing, while the same
// name with the plan/option suffix trimmed returns exactly the right scheme.

// Words that describe the *plan*, not the fund. Trailing runs of these are what break search.
const PLAN_WORDS = new Set([
  'direct',
  'regular',
  'plan',
  'growth',
  'idcw',
  'dividend',
  'payout',
  'reinvestment',
  'option',
  'fund',
  '-',
  '–',
]);

// Search queries to try, most specific first. Callers stop at the first one that yields an
// ISIN-confirmed match.
export function deriveSearchQueries(symbol: string): string[] {
  const tokens = symbol.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  // Trim trailing plan words: that suffix is what makes the search return nothing.
  const core = [...tokens];
  while (core.length > 1 && PLAN_WORDS.has(core[core.length - 1].toLowerCase())) core.pop();

  const candidates = [
    tokens.join(' '), // verbatim, in case the scheme is named exactly that
    core.join(' '),
    core.slice(0, 4).join(' '), // the search caps results, so a shorter query casts wider
    core.slice(0, 3).join(' '),
  ];

  const seen = new Set<string>();
  return candidates.filter((q) => {
    const key = q.toLowerCase();
    if (q.length < 3 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isinMatches(meta: FundMeta | undefined, isin: string): boolean {
  if (!meta || !isin) return false;
  const target = isin.trim().toUpperCase();
  return (
    meta.isin_growth?.trim().toUpperCase() === target ||
    meta.isin_div_reinvestment?.trim().toUpperCase() === target
  );
}

export interface PriceCheck {
  matched: number;
  total: number;
  unpublished: number; // trade dates the fund's published history doesn't reach
  mismatches: { time: number; tradeNav: number; fundNav: number }[];
}

// Cross-checks every trade's price against the fund's published NAV on that date.
//
// This is evidence, not decoration: for the real sample, eight of nine prices match to four
// decimals and the ninth is an NFO allotment predating the published history. A name match that
// fails this check is the wrong scheme, whatever the search returned.
export function crossCheckPrices(trades: Trade[], points: NavPoint[]): PriceCheck {
  const check: PriceCheck = { matched: 0, total: trades.length, unpublished: 0, mismatches: [] };
  if (points.length === 0) {
    check.unpublished = trades.length;
    return check;
  }

  for (const trade of trades) {
    const idx = findIndexAtOrBefore(points, trade.time);
    if (idx === -1 || points[idx].time !== trade.time) {
      // No published NAV for that exact date — an NFO allotment, or a gap in mfapi's history.
      check.unpublished++;
      continue;
    }
    const fundNav = points[idx].nav;
    // Tradebook prices carry four decimals; mfapi publishes five.
    if (Math.abs(fundNav - trade.nav) < 5e-5) {
      check.matched++;
    } else {
      check.mismatches.push({ time: trade.time, tradeNav: trade.nav, fundNav });
    }
  }
  return check;
}
