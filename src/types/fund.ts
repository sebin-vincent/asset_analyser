export interface SchemeSearchResult {
  schemeCode: number;
  schemeName: string;
}

export interface FundMeta {
  fund_house: string;
  scheme_type: string;
  scheme_category: string;
  scheme_code: number;
  scheme_name: string;
  isin_growth: string | null;
  isin_div_reinvestment: string | null;
}

export interface RawNavPoint {
  date: string; // "DD-MM-YYYY"
  nav: string;
}

export interface FundHistoryResponse {
  meta: FundMeta;
  data: RawNavPoint[];
  status?: string;
}

// Parsed, ascending-chronological-order NAV point.
export interface NavPoint {
  time: number; // epoch ms, midnight local
  nav: number;
}

export interface SelectedFund {
  schemeCode: number;
  name: string;
  colorIndex: number; // fixed categorical-palette slot assigned at add-time; resolved to a hex at render time
}

export interface DateRange {
  start: Date;
  end: Date;
}

// Two-point comparison on the chart. Timestamps are always snapped to a real chartData row.
export type ChartSelection =
  | { phase: 'idle' }
  | { phase: 'picking'; anchor: number }
  | { phase: 'locked'; start: number; end: number };

// One point in the merged, chart-ready dataset.
// `date` is an epoch-ms key; each fund's schemeCode (stringified) maps to its % growth, or null/undefined if not yet started.
export interface ChartPoint {
  date: number;
  [schemeCode: string]: number | null;
}

export interface FundReturnSummary {
  schemeCode: number;
  name: string;
  startDate: number;
  endDate: number;
  startNav: number;
  endNav: number;
  absoluteReturnPct: number;
  cagrPct: number | null; // null when range is too short (<1 day) or negative time span
  isPartialRange: boolean; // true if fund's data didn't cover the full requested range
}
