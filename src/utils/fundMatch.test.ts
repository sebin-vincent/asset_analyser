import { describe, expect, it } from 'vitest';
import { crossCheckPrices, deriveSearchQueries, isinMatches } from './fundMatch';
import { toAscendingNavPoints } from './dateUtils';
import { parseTradebook } from './tradebook';
import {
  ZERODHA_ISIN,
  ZERODHA_NAV_ROWS,
  ZERODHA_TRADEBOOK_CSV,
} from './__fixtures__/tradebookData';
import type { FundMeta } from '../types/fund';

function meta(over: Partial<FundMeta>): FundMeta {
  return {
    fund_house: 'X',
    scheme_type: 'Open Ended Schemes',
    scheme_category: 'Other',
    scheme_code: 1,
    scheme_name: 'X',
    isin_growth: null,
    isin_div_reinvestment: null,
    ...over,
  };
}

describe('deriveSearchQueries', () => {
  // The verbatim symbol returns [] from mfapi; the trimmed name returns the right scheme. If the
  // trimming ever stops producing that exact string, auto-identification silently stops working.
  it('trims the plan suffix that makes mfapi return nothing', () => {
    const queries = deriveSearchQueries('ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH');

    expect(queries).toContain('ZERODHA MULTI ASSET PASSIVE FOF');
    expect(queries[0]).toBe('ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH');
    expect(queries.indexOf('ZERODHA MULTI ASSET PASSIVE FOF')).toBe(1);
  });

  it.each([
    ['HDFC LARGE CAP FUND - DIRECT PLAN - GROWTH OPTION', 'HDFC LARGE CAP'],
    ['SBI BLUE CHIP FUND REGULAR IDCW PAYOUT', 'SBI BLUE CHIP'],
    ['AXIS MIDCAP FUND DIRECT GROWTH', 'AXIS MIDCAP'],
  ])('reduces %s to a searchable core', (symbol, expected) => {
    expect(deriveSearchQueries(symbol)).toContain(expected);
  });

  it('never strips a name down to nothing', () => {
    // Every token is a plan word; there must still be something left to search for.
    const queries = deriveSearchQueries('GROWTH DIRECT PLAN');

    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((q) => q.length >= 3)).toBe(true);
  });

  it('returns no duplicates and nothing for an empty symbol', () => {
    const queries = deriveSearchQueries('AXIS MIDCAP');

    expect(new Set(queries).size).toBe(queries.length);
    expect(deriveSearchQueries('   ')).toEqual([]);
  });
});

describe('isinMatches', () => {
  it('matches either ISIN field, case- and whitespace-insensitively', () => {
    expect(isinMatches(meta({ isin_growth: ZERODHA_ISIN }), ZERODHA_ISIN)).toBe(true);
    expect(isinMatches(meta({ isin_growth: ' inf0r8f01117 ' }), ZERODHA_ISIN)).toBe(true);
    expect(isinMatches(meta({ isin_div_reinvestment: ZERODHA_ISIN }), ZERODHA_ISIN)).toBe(true);
  });

  it.each([
    ['a different ISIN', meta({ isin_growth: 'INF000000000' }), ZERODHA_ISIN],
    ['both fields null', meta({}), ZERODHA_ISIN],
    ['an empty target', meta({ isin_growth: ZERODHA_ISIN }), ''],
    ['no meta at all', undefined, ZERODHA_ISIN],
  ])('rejects %s', (_label, m, isin) => {
    expect(isinMatches(m, isin)).toBe(false);
  });
});

describe('crossCheckPrices', () => {
  const trades = (() => {
    const parsed = parseTradebook(ZERODHA_TRADEBOOK_CSV);
    if (parsed.kind !== 'ok') throw new Error('fixture failed to parse');
    return parsed.funds[0].trades;
  })();
  const points = toAscendingNavPoints(ZERODHA_NAV_ROWS);

  // The evidence that turns a fuzzy name match into a confirmed one.
  it('matches every published trade price against the real fund\'s NAV', () => {
    const check = crossCheckPrices(trades, points);

    expect(check.total).toBe(9);
    expect(check.matched).toBe(8);
    expect(check.mismatches).toEqual([]);
    expect(check.unpublished).toBe(1); // the NFO allotment, before the published history starts
  });

  it('flags a wrong fund rather than quietly accepting it', () => {
    const wrongFund = points.map((p) => ({ ...p, nav: p.nav * 2 }));

    const check = crossCheckPrices(trades, wrongFund);

    expect(check.matched).toBe(0);
    expect(check.mismatches).toHaveLength(8);
  });

  it('reports every trade as unpublished when the fund has no history', () => {
    expect(crossCheckPrices(trades, [])).toMatchObject({ matched: 0, unpublished: 9 });
  });
});
