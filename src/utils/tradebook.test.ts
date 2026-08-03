import { describe, expect, it } from 'vitest';
import { parseTradebook } from './tradebook';
import { ZERODHA_ISIN, ZERODHA_TRADEBOOK_CSV } from './__fixtures__/tradebookData';

function okFunds(text: string) {
  const parsed = parseTradebook(text);
  if (parsed.kind !== 'ok') throw new Error(`expected ok, got "${parsed.kind}"`);
  return parsed.funds;
}

const HEADER = 'symbol|isin|trade_date|trade_type|quantity|price';

describe('parseTradebook', () => {
  it('reads the real Zerodha export', () => {
    const funds = okFunds(ZERODHA_TRADEBOOK_CSV);

    expect(funds).toHaveLength(1);
    expect(funds[0].isin).toBe(ZERODHA_ISIN);
    expect(funds[0].trades).toHaveLength(9);
    // Totalled independently from the file: sum of quantity, and of quantity x price.
    expect(funds[0].totalUnits).toBeCloseTo(27723.45, 2);
    expect(funds[0].totalInvested).toBeCloseTo(306984.65, 2);
  });

  it('reads columns by header name, not position', () => {
    // Same six fields, reordered, with an extra column Zerodha might add later.
    const reordered = [
      'price|trade_type|extra_column|quantity|trade_date|isin|symbol',
      '10.5|buy|ignored|100|15-01-2024|INF123|Some Fund',
    ].join('\n');

    const [fund] = okFunds(reordered);

    expect(fund.trades[0]).toMatchObject({ units: 100, nav: 10.5, amount: 1050 });
    expect(fund.isin).toBe('INF123');
  });

  it('parses trade_date as UTC midnight', () => {
    const [fund] = okFunds(`${HEADER}\nFund|INF1|01-02-2024|buy|10|100`);

    // 1 Feb 2024, not 2 Jan, and not shifted by the machine's timezone.
    expect(fund.trades[0].time).toBe(1706745600000);
  });

  it('sorts trades ascending regardless of file order', () => {
    const [fund] = okFunds(
      [HEADER, 'F|INF1|15-03-2024|buy|1|10', 'F|INF1|02-01-2024|buy|1|10'].join('\n'),
    );

    expect(fund.trades[0].time).toBeLessThan(fund.trades[1].time);
  });

  // Simulating a redemption is out of scope, and treating one as a buy — or quietly skipping it —
  // would overstate the portfolio. Refusing the file is the only honest option.
  it('refuses a file containing a sell instead of ignoring the row', () => {
    const withSell = [
      HEADER,
      'Fund A|INF1|02-01-2024|buy|100|10',
      'Fund A|INF1|05-06-2024|sell|40|12',
    ].join('\n');

    const parsed = parseTradebook(withSell);

    expect(parsed.kind).toBe('contains-sells');
    if (parsed.kind !== 'contains-sells') throw new Error('unreachable');
    // The message has to be able to point at the row.
    expect(parsed.rows).toEqual([{ line: 3, symbol: 'Fund A', date: '05-06-2024' }]);
  });

  it('groups by ISIN so a renamed scheme stays one holding', () => {
    // SEBI's 2021 recategorisation renamed many schemes mid-history; the ISIN did not change.
    const renamed = [
      HEADER,
      'HDFC Top 100|INF1|02-01-2020|buy|100|10',
      'HDFC Large Cap Fund|INF1|02-01-2022|buy|100|20',
      'Other Fund|INF2|02-01-2022|buy|50|30',
    ].join('\n');

    const funds = okFunds(renamed);

    expect(funds).toHaveLength(2);
    expect(funds.find((f) => f.isin === 'INF1')!.trades).toHaveLength(2);
  });

  it.each([
    ['a missing required column', 'symbol|isin|trade_date|quantity\nF|INF1|02-01-2024|10'],
    ['an empty file', ''],
    ['a header with no rows', HEADER],
  ])('reports %s', (_label, text) => {
    expect(parseTradebook(text).kind).not.toBe('ok');
  });

  it('names the missing columns', () => {
    const parsed = parseTradebook('symbol|isin|trade_date\nF|INF1|02-01-2024');

    expect(parsed).toMatchObject({ kind: 'missing-columns' });
    if (parsed.kind !== 'missing-columns') throw new Error('unreachable');
    expect(parsed.columns).toEqual(['trade_type', 'quantity', 'price']);
  });

  // A row that parses to NaN would propagate silently into the portfolio value.
  it.each([
    ['a non-numeric quantity', 'F|INF1|02-01-2024|buy|abc|10'],
    ['a zero price', 'F|INF1|02-01-2024|buy|100|0'],
    ['a malformed date', 'F|INF1|2024-01-02|buy|100|10'],
    ['a blank ISIN', 'F||02-01-2024|buy|100|10'],
  ])('rejects %s by line number', (_label, row) => {
    const parsed = parseTradebook(`${HEADER}\n${row}`);

    expect(parsed).toMatchObject({ kind: 'bad-rows', lines: [2] });
  });

  it('tolerates a trailing newline and blank lines', () => {
    const [fund] = okFunds(`${HEADER}\nF|INF1|02-01-2024|buy|100|10\n\n`);

    expect(fund.trades).toHaveLength(1);
  });
});
