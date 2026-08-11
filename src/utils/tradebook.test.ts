import { describe, expect, it } from 'vitest';
import { parseTradebook, type TradebookParse } from './tradebook';
import {
  AXIS_ISIN,
  AXIS_TOTAL_INVESTED,
  AXIS_TOTAL_UNITS,
  MULTI_FUND_ISO_TRADEBOOK_CSV,
  MULTI_FUND_ZERODHA_TOTAL_INVESTED,
  MULTI_FUND_ZERODHA_TOTAL_UNITS,
  ZERODHA_ISIN,
  ZERODHA_TRADEBOOK_CSV,
} from './__fixtures__/tradebookData';

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
    expect(funds[0].totalUnits).toBeCloseTo(4596.02, 2);
    expect(funds[0].totalInvested).toBeCloseTo(49999.99, 2);
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

  // Both accepted trade_date shapes must land on the identical epoch, since parseTradebookDate
  // (not this file) is what parseTradebook now delegates to for date handling.
  it.each([
    ['DD-MM-YYYY', 'Fund|INF1|01-02-2024|buy|10|100'],
    ['YYYY-MM-DD', 'Fund|INF1|2024-02-01|buy|10|100'],
  ])('parses a %s trade_date as UTC midnight', (_label, row) => {
    const [fund] = okFunds(`${HEADER}\n${row}`);

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
    ['a blank ISIN', 'F||02-01-2024|buy|100|10'],
    // Both trade_date shapes are accepted (see parseTradebookDate), so a malformed date now has
    // to actually be malformed rather than just "the other format" — these are the ones
    // parseTradebookDate deliberately still refuses (dateUtils.test.ts has the full grammar).
    ['a slash-separated date', 'F|INF1|02/01/2024|buy|100|10'],
    ['a two-digit year', 'F|INF1|02-01-24|buy|100|10'],
    ['a calendar-invalid date', 'F|INF1|32-13-2024|buy|100|10'],
    ['a non-leap 29 February', 'F|INF1|29-02-2025|buy|100|10'],
    ['a blank date', 'F|INF1||buy|100|10'],
  ])('rejects %s by line number', (_label, row) => {
    const parsed = parseTradebook(`${HEADER}\n${row}`);

    expect(parsed).toMatchObject({ kind: 'bad-rows', lines: [2] });
  });

  it('tolerates a trailing newline and blank lines', () => {
    const [fund] = okFunds(`${HEADER}\nF|INF1|02-01-2024|buy|100|10\n\n`);

    expect(fund.trades).toHaveLength(1);
  });
});

// Comma-separated files must parse identically to pipe-separated ones. Delimiter is detected
// per-file from the header, not assumed, because a naive whole-file "which character occurs
// more" heuristic is fooled by a comma inside a fund name (see the mutation-killer test below).
describe('parseTradebook — comma-delimited support', () => {
  // Every case already covered for pipe files, reused here as an independent oracle: whichever
  // the delimiter, the parse result must be identical. Each has an expectedKind so two cases that
  // both fail can't pass by comparing "wrong" to "wrong".
  const PIPE_CASES: [label: string, text: string, expectedKind: TradebookParse['kind']][] = [
    ['the real Zerodha export', ZERODHA_TRADEBOOK_CSV, 'ok'],
    [
      'a reordered header with an extra column',
      [
        'price|trade_type|extra_column|quantity|trade_date|isin|symbol',
        '10.5|buy|ignored|100|15-01-2024|INF123|Some Fund',
      ].join('\n'),
      'ok',
    ],
    [
      'a file containing a sell',
      [HEADER, 'Fund A|INF1|02-01-2024|buy|100|10', 'Fund A|INF1|05-06-2024|sell|40|12'].join('\n'),
      'contains-sells',
    ],
    ['a non-numeric quantity', `${HEADER}\nF|INF1|02-01-2024|buy|abc|10`, 'bad-rows'],
    ['a missing required column', 'symbol|isin|trade_date|quantity\nF|INF1|02-01-2024|10', 'missing-columns'],
    ['an empty file', '', 'empty'],
    ['a header with no rows', HEADER, 'empty'],
  ];

  it.each(PIPE_CASES)('parses identically to its comma-delimited twin — %s', (_label, pipeText, expectedKind) => {
    // Guards the derivation below: if a future fixture edit introduces a comma, the naive
    // replace stops being a faithful "same file, different punctuation" twin.
    expect(pipeText).not.toContain(',');
    const pipeResult = parseTradebook(pipeText);
    expect(pipeResult.kind).toBe(expectedKind);
    expect(parseTradebook(pipeText.replace(/\|/g, ','))).toEqual(pipeResult);
  });

  // The mutation this rules out: detecting the delimiter by counting '|' vs ',' across the whole
  // file. Here the file is genuinely pipe-delimited, but the symbol contains more commas than
  // there are pipes, so that counting approach picks comma and mangles every column after
  // symbol. Header-only validation isn't fooled, because the header itself has zero commas.
  it('is not fooled by a comma-laden field into misdetecting the delimiter', () => {
    const text = `${HEADER}\nFUND,A,B,C,D,E,F,G,H,I,J,K,L|INF1|02-01-2024|buy|100|10`;

    const [fund] = okFunds(text);

    expect(fund.symbol).toBe('FUND,A,B,C,D,E,F,G,H,I,J,K,L');
    expect(fund.trades[0]).toMatchObject({ units: 100, nav: 10, amount: 1000 });
  });

  it('respects a quoted delimiter inside a comma-delimited field', () => {
    const text =
      'symbol,isin,trade_date,trade_type,quantity,price\n"HDFC Fund, Direct",INF1,02-01-2024,buy,100,10';

    const [fund] = okFunds(text);

    expect(fund.symbol).toBe('HDFC Fund, Direct');
    expect(fund.trades[0]).toMatchObject({ units: 100, nav: 10, amount: 1000 });
  });

  // A comma-stripping "fix" would silently misread the European form as 27.72345 — finite,
  // positive, and wrong by 1000x. Loud rejection is correct for every locale; only the message
  // changes.
  it.each([
    ['a US/IN-style thousands separator', 'F|INF1|02-01-2024|buy|1,234.5|10'],
    ['a European-style thousands separator', 'F|INF1|02-01-2024|buy|27.723,45|10'],
  ])('rejects %s in quantity rather than silently misparsing it', (_label, row) => {
    const parsed = parseTradebook(`${HEADER}\n${row}`);

    expect(parsed).toMatchObject({ kind: 'bad-rows', lines: [2] });
  });

  it('reports only the columns actually missing once the delimiter is identified', () => {
    const parsed = parseTradebook('symbol,isin,trade_date,trade_type,quantity\nF,INF1,02-01-2024,buy,100');

    expect(parsed).toMatchObject({ kind: 'missing-columns', columns: ['price'] });
  });

  // U+FEFF (the BOM Excel writes) is whitespace per the ECMAScript spec, so splitRow's own
  // `.trim()` absorbs it into the header's first cell — no dedicated stripping needed.
  it('tolerates a leading BOM, for either delimiter', () => {
    const pipeFunds = okFunds(`﻿${HEADER}\nF|INF1|02-01-2024|buy|100|10`);
    expect(pipeFunds).toHaveLength(1);

    const commaFunds = okFunds(
      '﻿symbol,isin,trade_date,trade_type,quantity,price\nF,INF1,02-01-2024,buy,100,10',
    );
    expect(commaFunds).toHaveLength(1);
  });

  it('keeps line numbers file-absolute across a blank line', () => {
    const text = [HEADER, 'F|INF1|02-01-2024|buy|100|10', '', 'F|INF1|03-01-2024|buy|abc|10'].join('\n');

    const parsed = parseTradebook(text);

    expect(parsed).toMatchObject({ kind: 'bad-rows', lines: [4] });
  });

  it('ignores a trailing all-delimiter line instead of treating it as a bad row', () => {
    const text = 'symbol,isin,trade_date,trade_type,quantity,price\nF,INF1,02-01-2024,buy,100,10\n,,,,,\n';

    expect(parseTradebook(text).kind).toBe('ok');
  });

  it('falls back to a loud missing-columns for an unsupported delimiter like semicolon', () => {
    const parsed = parseTradebook('symbol;isin;trade_date;trade_type;quantity;price\nF;INF1;02-01-2024;buy;100;10');

    expect(parsed).toMatchObject({
      kind: 'missing-columns',
      columns: ['symbol', 'isin', 'trade_date', 'trade_type', 'quantity', 'price'],
    });
  });
});

// ISO (YYYY-MM-DD) trade_date support, prompted by a real export that used it. Delimiter and date
// format are independent axes — this suite only varies dates; the comma-delimited suite above
// only varies delimiters — and MULTI_FUND_ISO_TRADEBOOK_CSV below is what proves the combination
// (comma + ISO + lowercase "false" + a "T" timestamp) actually works, since the bug that prompted
// this only reproduced with all four present together.
describe('parseTradebook — ISO-dated (YYYY-MM-DD) support', () => {
  const toIsoTwin = (text: string): string => text.replace(/(\d{2})-(\d{2})-(\d{4})/g, '$3-$2-$1');

  // Reuses the same cases as the comma-delimiter sweep, minus `contains-sells`: SellRow.date is
  // deliberately the verbatim file string, so its ISO twin legitimately reports a different date
  // string and a blanket toEqual would fail there for a reason that isn't a bug. Don't "fix" that
  // by normalizing SellRow.date — it's the point, per the module comment in tradebook.ts.
  const DMY_CASES: [label: string, text: string, expectedKind: TradebookParse['kind']][] = [
    ['the real Zerodha export', ZERODHA_TRADEBOOK_CSV, 'ok'],
    [
      'a reordered header with an extra column',
      [
        'price|trade_type|extra_column|quantity|trade_date|isin|symbol',
        '10.5|buy|ignored|100|15-01-2024|INF123|Some Fund',
      ].join('\n'),
      'ok',
    ],
    ['a non-numeric quantity', `${HEADER}\nF|INF1|02-01-2024|buy|abc|10`, 'bad-rows'],
    ['a missing required column', 'symbol|isin|trade_date|quantity\nF|INF1|02-01-2024|10', 'missing-columns'],
    ['an empty file', '', 'empty'],
    ['a header with no rows', HEADER, 'empty'],
  ];

  it.each(DMY_CASES)('parses identically whether trade_date is DD-MM-YYYY or its ISO twin — %s', (
    _label,
    dmyText,
    expectedKind,
  ) => {
    // Guards the derivation: if a future fixture edit removes every DD-MM-YYYY date, the regex
    // becomes a no-op and the assertion below would compare the file to itself while testing
    // nothing — the same vacuous-oracle trap the comma-twin sweep guards against. Only applies
    // when the input has a date to convert in the first place (the empty-file and header-only
    // cases legitimately have none).
    const isoText = toIsoTwin(dmyText);
    if (/\d{2}-\d{2}-\d{4}/.test(dmyText)) expect(isoText).not.toBe(dmyText);

    const dmyResult = parseTradebook(dmyText);
    expect(dmyResult.kind).toBe(expectedKind);
    expect(parseTradebook(isoText)).toEqual(dmyResult);
  });

  // Kills the tempting "sniff the format from the first data row and apply it file-wide" design:
  // under that design row 2's meaning would depend on row 1's format, which is exactly the kind
  // of behaviour that produces a plausible wrong date without any single row looking malformed.
  it('resolves DD-MM-YYYY and YYYY-MM-DD trade_dates to the same instant within one file', () => {
    const [fund] = okFunds(
      [HEADER, 'F|INF1|13-08-2025|buy|1|10', 'F|INF1|2025-08-13|buy|1|10'].join('\n'),
    );

    expect(fund.trades).toHaveLength(2);
    expect(fund.trades[0].time).toBe(1755043200000);
    expect(fund.trades[1].time).toBe(1755043200000);
  });

  // The actual regression: a real second user's export, comma-delimited, every trade_date in
  // ISO, `auction` lowercase, order_execution_time with a "T" — and two ISINs, which is what
  // originally surfaced the multi-fund picker's UX gaps in WhatIfView.
  it('reads a real comma-delimited, ISO-dated, two-fund export', () => {
    const funds = okFunds(MULTI_FUND_ISO_TRADEBOOK_CSV);

    expect(funds).toHaveLength(2);

    const axis = funds.find((f) => f.isin === AXIS_ISIN)!;
    expect(axis.trades).toHaveLength(5);
    expect(axis.totalUnits).toBeCloseTo(AXIS_TOTAL_UNITS, 3);
    expect(axis.totalInvested).toBeCloseTo(AXIS_TOTAL_INVESTED, 2);

    const zerodha = funds.find((f) => f.isin === ZERODHA_ISIN)!;
    expect(zerodha.trades).toHaveLength(9);
    expect(zerodha.totalUnits).toBeCloseTo(MULTI_FUND_ZERODHA_TOTAL_UNITS, 3);
    expect(zerodha.totalInvested).toBeCloseTo(MULTI_FUND_ZERODHA_TOTAL_INVESTED, 2);

    // First row, checked directly rather than only through the fund total: 1117.688 units at
    // 22.3676 confirmed against the fixture's own numbers.
    expect(axis.trades[0]).toMatchObject({ time: 1754438400000, units: 1117.688, nav: 22.3676 });
    expect(axis.trades[0].amount).toBeCloseTo(24999.9981, 4);
  });
});
