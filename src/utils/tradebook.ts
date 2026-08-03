import { parseDDMMYYYY } from './dateUtils';

// Parses a Zerodha tradebook export: pipe-delimited, one header row, one row per trade.
//
//   symbol|isin|trade_date|exchange|segment|series|trade_type|auction|quantity|price|trade_id|...
//
// `quantity` is units and `price` is the NAV paid, so a row's invested amount is their product.
// Verified against mfapi: for a scheme's own history, `price` matches the published NAV to four
// decimal places, which is what lets the UI cross-check a name match rather than trust it.

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

const DD_MM_YYYY = /^\d{2}-\d{2}-\d{4}$/;

function splitLines(text: string): { line: number; cells: string[] }[] {
  return text
    .split(/\r?\n/)
    .map((raw, idx) => ({ line: idx + 1, cells: raw.split('|').map((c) => c.trim()) }))
    .filter(({ cells }) => cells.some((c) => c.length > 0));
}

export function parseTradebook(text: string): TradebookParse {
  const rows = splitLines(text);
  if (rows.length < 2) return { kind: 'empty' };

  // Indexed by header name rather than position: Zerodha adds and reorders columns between
  // exports, and a positional parser would read the wrong field without failing.
  const header = rows[0].cells.map((c) => c.toLowerCase());
  const columnIndex = new Map(header.map((name, idx) => [name, idx]));
  const missing = REQUIRED_COLUMNS.filter((name) => !columnIndex.has(name));
  if (missing.length > 0) return { kind: 'missing-columns', columns: missing };

  const cellAt = (cells: string[], column: string): string => cells[columnIndex.get(column)!] ?? '';

  const sells: SellRow[] = [];
  const badLines: number[] = [];
  const byIsin = new Map<string, TradebookFund>();

  for (const { line, cells } of rows.slice(1)) {
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

    const units = Number(cellAt(cells, 'quantity'));
    const nav = Number(cellAt(cells, 'price'));
    const wellFormed =
      symbol.length > 0 &&
      isin.length > 0 &&
      tradeType === 'buy' &&
      DD_MM_YYYY.test(date) &&
      Number.isFinite(units) &&
      Number.isFinite(nav) &&
      units > 0 &&
      nav > 0;

    if (!wellFormed) {
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
    fund.trades.push({ isin, symbol, time: parseDDMMYYYY(date), units, nav, amount: units * nav });
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
