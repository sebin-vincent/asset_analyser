import type { RawNavPoint } from '../../types/fund';

// Based on a real Zerodha tradebook export: the fund, ISIN, dates, and every `price` are
// unchanged (`price` must equal the real published NAV for the pipeline tests to hold, and the
// dates drive which NAV rows apply), but `quantity` — the actual money invested — has been
// replaced with round synthetic amounts (₹10,000 on the NFO date, ₹5,000 on each of the rest), and
// `trade_id`/`order_id` swapped for synthetic sequential values. Nothing in the app reads the
// latter two columns (confirmed: `cellAt` is never called for either), and swapping `quantity`
// doesn't disturb any invariant: since `amount = quantity × price` and `price === NAV(trade_date)`,
// `amount / NAV(trade_date)` reproduces whatever `quantity` is, for any `quantity`.
// Pipe-delimited, nine buys, no sells. Kept as a string rather than a file read so the tests stay
// pure and run anywhere. tradebook.test.ts derives a comma-delimited twin from this in-test
// (`.replace(/\|/g, ',')`) to exercise comma-delimited support, rather than maintaining a second
// fixture.
export const ZERODHA_TRADEBOOK_CSV = `symbol|isin|trade_date|exchange|segment|series|trade_type|auction|quantity|price|trade_id|order_id|order_execution_time
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|13-08-2025|BSE|MF||buy|FALSE|1000|10|9000000001|9000000001|13-08-2025 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|26-09-2025|BSE|MF||buy|FALSE|484.233|10.3256|9000000002|9000000002|26-09-2025 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|04-11-2025|BSE|MF||buy|FALSE|463.499|10.7875|9000000003|9000000003|04-11-2025 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|04-12-2025|BSE|MF||buy|FALSE|455.071|10.9873|9000000004|9000000004|04-12-2025 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|02-01-2026|BSE|MF||buy|FALSE|444.622|11.2455|9000000005|9000000005|02-01-2026 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|29-01-2026|BSE|MF||buy|FALSE|423.058|11.8187|9000000006|9000000006|29-01-2026 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|29-06-2026|BSE|MF||buy|FALSE|444.405|11.251|9000000007|9000000007|29-06-2026 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|09-07-2026|BSE|MF||buy|FALSE|441.466|11.3259|9000000008|9000000008|09-07-2026 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|27-07-2026|BSE|MF||buy|FALSE|439.669|11.3722|9000000009|9000000009|27-07-2026 00:00`;

// Real NAV history for Zerodha Multi Asset Passive FoF - Direct - Growth (scheme 153757),
// thinned to the entries within four days of a trade date plus month boundaries. Newest-first
// and string-valued, exactly as mfapi returns it. Untouched by the anonymization above — NAVs
// are public fund data, not anyone's personal information, and the pipeline tests need them real.
//
// Two properties of this data are load-bearing for the tests:
//   - eight of the nine trade prices match a NAV here to four decimals
//   - the first trade (13-08-2025, an NFO allotment at 10.0000) predates the whole history,
//     which starts 01-09-2025
export const ZERODHA_NAV_ROWS: RawNavPoint[] = [
  { date: '31-07-2026', nav: '11.41810' },
  { date: '30-07-2026', nav: '11.39840' },
  { date: '29-07-2026', nav: '11.38910' },
  { date: '28-07-2026', nav: '11.32780' },
  { date: '27-07-2026', nav: '11.37220' },
  { date: '24-07-2026', nav: '11.29050' },
  { date: '23-07-2026', nav: '11.31670' },
  { date: '15-07-2026', nav: '11.34660' },
  { date: '13-07-2026', nav: '11.38190' },
  { date: '10-07-2026', nav: '11.41190' },
  { date: '09-07-2026', nav: '11.32590' },
  { date: '08-07-2026', nav: '11.24920' },
  { date: '07-07-2026', nav: '11.37740' },
  { date: '06-07-2026', nav: '11.45210' },
  { date: '03-07-2026', nav: '11.42890' },
  { date: '02-07-2026', nav: '11.34620' },
  { date: '01-07-2026', nav: '11.27100' },
  { date: '30-06-2026', nav: '11.25810' },
  { date: '29-06-2026', nav: '11.25100' },
  { date: '25-06-2026', nav: '11.23450' },
  { date: '15-06-2026', nav: '11.38210' },
  { date: '01-06-2026', nav: '11.33460' },
  { date: '15-05-2026', nav: '11.37930' },
  { date: '15-04-2026', nav: '11.23410' },
  { date: '01-04-2026', nav: '10.68260' },
  { date: '02-02-2026', nav: '11.12710' },
  { date: '30-01-2026', nav: '11.53710' },
  { date: '29-01-2026', nav: '11.81870' },
  { date: '28-01-2026', nav: '11.58450' },
  { date: '27-01-2026', nav: '11.39210' },
  { date: '06-01-2026', nav: '11.26490' },
  { date: '05-01-2026', nav: '11.26130' },
  { date: '02-01-2026', nav: '11.24550' },
  { date: '01-01-2026', nav: '11.15850' },
  { date: '31-12-2025', nav: '11.13660' },
  { date: '30-12-2025', nav: '11.11210' },
  { date: '29-12-2025', nav: '11.18050' },
  { date: '15-12-2025', nav: '11.10910' },
  { date: '08-12-2025', nav: '10.94970' },
  { date: '05-12-2025', nav: '11.03570' },
  { date: '04-12-2025', nav: '10.98730' },
  { date: '03-12-2025', nav: '10.99450' },
  { date: '02-12-2025', nav: '11.01420' },
  { date: '01-12-2025', nav: '11.05570' },
  { date: '07-11-2025', nav: '10.75560' },
  { date: '06-11-2025', nav: '10.74390' },
  { date: '04-11-2025', nav: '10.78750' },
  { date: '03-11-2025', nav: '10.81750' },
  { date: '31-10-2025', nav: '10.77880' },
  { date: '15-10-2025', nav: '10.82570' },
  { date: '01-10-2025', nav: '10.47680' },
  { date: '30-09-2025', nav: '10.36180' },
  { date: '26-09-2025', nav: '10.32560' },
  { date: '25-09-2025', nav: '10.41880' },
  { date: '24-09-2025', nav: '10.47370' },
  { date: '23-09-2025', nav: '10.53610' },
  { date: '22-09-2025', nav: '10.48410' },
  { date: '15-09-2025', nav: '10.38240' },
  { date: '01-09-2025', nav: '10.11600' },
];

export const ZERODHA_ISIN = 'INF0R8F01117';
export const ZERODHA_SCHEME_CODE = 153757;
export const ZERODHA_SCHEME_NAME = 'Zerodha Multi Asset Passive FoF - Direct - Growth';

// Based on a second real tradebook export, anonymized the same way as the fixture above: fund
// names, ISINs, dates and prices unchanged, `quantity` replaced with round synthetic amounts
// (₹25,000 on the first Axis purchase, ₹10,000 on the rest), `trade_id`/`order_id` replaced with
// random 10-digit values. Nothing in the app reads those two columns.
//
// This file is the reason comma-delimited and ISO-dated (YYYY-MM-DD) support exist: it's
// comma-delimited, every trade_date is ISO, `auction` is lowercase "false" (never read), and
// order_execution_time has a "T" separator (also never read). It also has TWO ISINs — Axis
// Nifty 100 Index Fund and the same Zerodha Multi Asset fund as the fixture above — which is
// what exercises the multi-fund picker in WhatIfView against a realistically-shaped export
// rather than a synthetic one.
export const MULTI_FUND_ISO_TRADEBOOK_CSV = `symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time
AXIS NIFTY 100 INDEX FUND - DIRECT PLAN,INF846K01S29,2025-08-06,BSE,MF,,buy,false,1117.688000,22.367600,5651614664,7617977796,2025-08-06T00:00:00
ZERODHA MULTI ASSET PASSIVE FOF,INF0R8F01117,2025-08-13,BSE,MF,,buy,false,1000.000000,10.000000,8991171682,6603861779,2025-08-13T00:00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH,INF0R8F01117,2025-09-26,BSE,MF,,buy,false,484.233000,10.325600,8739305570,3117193637,2025-09-26T00:00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH,INF0R8F01117,2025-11-04,BSE,MF,,buy,false,463.499000,10.787500,2597492363,1091463410,2025-11-04T00:00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH,INF0R8F01117,2025-12-04,BSE,MF,,buy,false,455.071000,10.987300,7687386051,9035051000,2025-12-04T00:00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH,INF0R8F01117,2026-01-02,BSE,MF,,buy,false,444.622000,11.245500,2934132797,1542278142,2026-01-02T00:00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH,INF0R8F01117,2026-01-29,BSE,MF,,buy,false,423.058000,11.818700,7033275747,9912487404,2026-01-29T00:00:00
AXIS NIFTY 100 INDEX FUND DIRECT GROWTH,INF846K01S29,2026-03-02,BSE,MF,,buy,false,438.810000,22.788900,6815819806,1027513396,2026-03-02T00:00:00
AXIS NIFTY 100 INDEX FUND DIRECT GROWTH,INF846K01S29,2026-03-13,BSE,MF,,buy,false,470.301000,21.263000,1977169238,6385193893,2026-03-13T00:00:00
AXIS NIFTY 100 INDEX FUND DIRECT GROWTH,INF846K01S29,2026-06-01,BSE,MF,,buy,false,459.202000,21.776900,9102336947,6594595419,2026-06-01T00:00:00
AXIS NIFTY 100 INDEX FUND DIRECT GROWTH,INF846K01S29,2026-06-29,BSE,MF,,buy,false,447.465000,22.348100,5720978613,2757378152,2026-06-29T00:00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH,INF0R8F01117,2026-06-29,BSE,MF,,buy,false,444.405000,11.251000,6442605686,1001765611,2026-06-29T00:00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH,INF0R8F01117,2026-07-09,BSE,MF,,buy,false,441.466000,11.325900,8741862952,5394852717,2026-07-09T00:00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH,INF0R8F01117,2026-07-27,BSE,MF,,buy,false,439.669000,11.372200,1374799732,8785993219,2026-07-27T00:00:00`;

// Independently summed from the rows above (not read off the parser), for the totals assertion.
export const AXIS_ISIN = 'INF846K01S29';
export const AXIS_TOTAL_UNITS = 2933.466;
export const AXIS_TOTAL_INVESTED = 64999.9940811;
export const MULTI_FUND_ZERODHA_TOTAL_UNITS = 4596.023;
export const MULTI_FUND_ZERODHA_TOTAL_INVESTED = 49999.98983739999;
