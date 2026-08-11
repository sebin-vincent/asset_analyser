import { parseTradebookDate } from './dateUtils';

// Parses a Zerodha tradebook export: one header row, one row per trade, pipe- OR
// comma-delimited — whichever the file uses is detected from the header (see
// `detectDelimiter`), not assumed.
//
//   symbol|isin|trade_date|exchange|segment|series|trade_type|auction|quantity|price|trade_id|...
//
// `quantity` is units and `price` is the NAV paid, so a row's invested amount is their product.
// Verified against mfapi: for a scheme's own history, `price` matches the published NAV to four
// decimal places, which is what lets the UI cross-check a name match rather than trust it.
//
// `trade_date` has been observed as both DD-MM-YYYY and YYYY-MM-DD across different exports —
// see `parseTradebookDate` in dateUtils.ts for the accepted grammar and why slashes and trailing
// time components are refused rather than tolerated.
//
// Embedded newlines inside a quoted field are NOT supported. That's safe only because of a
// specific invariant: such a record always leaves at least one fragment that fails `wellFormed`
// (e.g. a truncated ISIN), and a single bad row refuses the *whole* file (`bad-rows` is
// file-fatal, never skip-and-continue). If that ever changes to skip-and-continue, this
// assumption breaks and embedded newlines would need real support.

export interface Trade {
  isin: string;
  symbol: string;
  time: number; // UTC midnight, matching every other date in the app
  units: number;
  nav: number; // the NAV paid, i.e. the fund's NAV that day
  amount: number; // units * nav
}

export interface TradebookFund {
  isin: string;
  symbol: string;
  trades: Trade[]; // ascending by time
  totalUnits: number;
  totalInvested: number;
}

export interface SellRow {
  line: number; // 1-based line in the file, so the message can point at it
  symbol: string;
  date: string; // as written in the file
}

// Failure cases are distinct facts, not one null — the UI has something specific to say about
// each, and a silently-dropped row here would misstate someone's portfolio by real money.
export type TradebookParse =
  | { kind: 'ok'; funds: TradebookFund[] }
  | { kind: 'empty' }
  | { kind: 'missing-columns'; columns: string[] }
  | { kind: 'contains-sells'; rows: SellRow[] }
  | { kind: 'no-buys' }
  | { kind: 'bad-rows'; lines: number[] };

const REQUIRED_COLUMNS = ['symbol', 'isin', 'trade_date', 'trade_type', 'quantity', 'price'];

type Delimiter = '|' | ',';
// Order doubles as tie-break priority when a header scores equally on both (see detectDelimiter).
const DELIMITERS: readonly Delimiter[] = ['|', ','];

// Quote-aware split (RFC 4180-ish): quoting only opens at the start of a field, `""` inside a
// quoted field is a literal quote, and an unquoted `"` is an ordinary character. Needed because
// Excel wraps any field containing the delimiter (or the delimiter itself, per-cell) in quotes —
// without this, a quoted comma in a fund name would shift every column after it.
function splitRow(line: string, delimiter: Delimiter): string[] {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell.trim().length === 0) {
      // Quoting only opens at field start (after any leading whitespace already collected).
      inQuotes = true;
      cell = '';
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      cells.push(cell.trim());
      cell = '';
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  cells.push(cell.trim());
  return cells;
}

// Splits into raw lines, unfiltered — filtering blank lines requires knowing the delimiter
// first, so it happens later in toRows. No explicit BOM handling: a leading UTF-8 BOM (Excel
// writes one) becomes the first character of the header's first cell, and splitRow's own
// `.trim()` already strips it — U+FEFF is whitespace per the ECMAScript spec, same as a stray
// space would be. Confirmed by mutation test: adding a dedicated strip here changes nothing.
function toLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

// Delimiter-independent: true only for a line that is nothing but whitespace and/or candidate
// delimiters (e.g. Excel's trailing ",,,,,,"). Must not depend on which delimiter the file uses,
// since that isn't known until after the header line is found.
function isBlankLine(line: string): boolean {
  return !/[^\s|,]/.test(line);
}

// Picks whichever delimiter's header contains more of REQUIRED_COLUMNS — not whichever character
// occurs more often in the line, which a comma-laden fund name or ISIN would fool. The winner is
// used even when its score is below 6, and its missing list is what gets reported, so the
// "which delimiter" decision and the "what's missing" message can never disagree.
function detectDelimiter(headerLine: string): {
  delimiter: Delimiter;
  header: string[];
  missing: string[];
} {
  let best = { delimiter: DELIMITERS[0], header: [] as string[], missing: REQUIRED_COLUMNS, score: -1 };
  for (const delimiter of DELIMITERS) {
    const header = splitRow(headerLine, delimiter).map((c) => c.toLowerCase());
    const columnIndex = new Set(header);
    const missing = REQUIRED_COLUMNS.filter((name) => !columnIndex.has(name));
    const score = REQUIRED_COLUMNS.length - missing.length;
    if (score > best.score) {
      best = { delimiter, header, missing, score };
    }
  }
  return { delimiter: best.delimiter, header: best.header, missing: best.missing };
}

function toRows(lines: string[], delimiter: Delimiter, startLine: number): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  lines.forEach((raw, idx) => {
    if (isBlankLine(raw)) return;
    rows.push({ line: startLine + idx, cells: splitRow(raw, delimiter) });
  });
  return rows;
}

export function parseTradebook(text: string): TradebookParse {
  const lines = toLines(text);
  const headerIdx = lines.findIndex((l) => !isBlankLine(l));
  if (headerIdx === -1) return { kind: 'empty' };

  // Indexed by header name rather than position: Zerodha adds and reorders columns between
  // exports, and a positional parser would read the wrong field without failing.
  const { delimiter, header, missing } = detectDelimiter(lines[headerIdx]);
  const rows = toRows(lines.slice(headerIdx + 1), delimiter, headerIdx + 2);
  if (rows.length === 0) return { kind: 'empty' };
  if (missing.length > 0) return { kind: 'missing-columns', columns: missing };

  const columnIndex = new Map(header.map((name, idx) => [name, idx]));
  const cellAt = (cells: string[], column: string): string => cells[columnIndex.get(column)!] ?? '';

  const sells: SellRow[] = [];
  const badLines: number[] = [];
  const byIsin = new Map<string, TradebookFund>();

  for (const { line, cells } of rows) {
    const symbol = cellAt(cells, 'symbol');
    const isin = cellAt(cells, 'isin');
    const date = cellAt(cells, 'trade_date');
    const tradeType = cellAt(cells, 'trade_type').toLowerCase();

    // Collected rather than thrown on: the caller refuses the whole file and names them, because
    // simulating a redemption is out of scope and ignoring one overstates the portfolio.
    if (tradeType && tradeType !== 'buy') {
      sells.push({ line, symbol, date });
      continue;
    }

    const time = parseTradebookDate(date);
    const units = Number(cellAt(cells, 'quantity'));
    const nav = Number(cellAt(cells, 'price'));
    const wellFormed =
      symbol.length > 0 &&
      isin.length > 0 &&
      tradeType === 'buy' &&
      Number.isFinite(units) &&
      Number.isFinite(nav) &&
      units > 0 &&
      nav > 0;

    // `time === null` is checked separately from `wellFormed` rather than folded into it, so
    // TypeScript narrows `time` to `number` at the push below. A boolean flag doesn't narrow, and
    // the tempting fix for the resulting type error is `time!` — which is exactly how a null date
    // would reach a Trade: findIndexAtOrBefore(points, null) returns -1 for every comparison, so
    // simulate() would silently book the purchase as skippedAmount instead of refusing the file.
    if (time === null || !wellFormed) {
      badLines.push(line);
      continue;
    }

    // Grouped by ISIN, not symbol: a scheme can be renamed mid-history (SEBI's 2021
    // recategorisation), which would split one holding into two under a symbol key.
    let fund = byIsin.get(isin);
    if (!fund) {
      fund = { isin, symbol, trades: [], totalUnits: 0, totalInvested: 0 };
      byIsin.set(isin, fund);
    }
    fund.trades.push({ isin, symbol, time, units, nav, amount: units * nav });
  }

  if (sells.length > 0) return { kind: 'contains-sells', rows: sells };
  if (badLines.length > 0) return { kind: 'bad-rows', lines: badLines };
  if (byIsin.size === 0) return { kind: 'no-buys' };

  const funds = Array.from(byIsin.values()).map((fund) => {
    const trades = [...fund.trades].sort((a, b) => a.time - b.time);
    return {
      ...fund,
      trades,
      totalUnits: trades.reduce((sum, t) => sum + t.units, 0),
      totalInvested: trades.reduce((sum, t) => sum + t.amount, 0),
    };
  });

  return { kind: 'ok', funds };
}
