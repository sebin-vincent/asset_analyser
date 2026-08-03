import type { RawNavPoint } from '../../types/fund';

// The user's real Zerodha tradebook export, verbatim. Pipe-delimited, nine buys, no sells.
// Kept as a string rather than a file read so the tests stay pure and run anywhere.
export const ZERODHA_TRADEBOOK_CSV = `symbol|isin|trade_date|exchange|segment|series|trade_type|auction|quantity|price|trade_id|order_id|order_execution_time
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|13-08-2025|BSE|MF||buy|FALSE|999.95|10|9000000001|9000000001|13-08-2025 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|26-09-2025|BSE|MF||buy|FALSE|3776.831|10.3256|9000000002|9000000002|26-09-2025 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|04-11-2025|BSE|MF||buy|FALSE|3707.81|10.7875|9000000003|9000000003|04-11-2025 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|04-12-2025|BSE|MF||buy|FALSE|4550.481|10.9873|9000000004|9000000004|04-12-2025 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|02-01-2026|BSE|MF||buy|FALSE|6135.481|11.2455|9000000005|9000000005|02-01-2026 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|29-01-2026|BSE|MF||buy|FALSE|4568.802|11.8187|9000000006|9000000006|29-01-2026 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|29-06-2026|BSE|MF||buy|FALSE|2221.914|11.251|9000000007|9000000007|29-06-2026 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|09-07-2026|BSE|MF||buy|FALSE|882.888|11.3259|9000000008|9000000008|09-07-2026 00:00
ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH|INF0R8F01117|27-07-2026|BSE|MF||buy|FALSE|879.293|11.3722|9000000009|9000000009|27-07-2026 00:00`;

// Real NAV history for Zerodha Multi Asset Passive FoF - Direct - Growth (scheme 153757),
// thinned to the entries within four days of a trade date plus month boundaries. Newest-first
// and string-valued, exactly as mfapi returns it.
//
// Two properties of this data are load-bearing for the tests:
//   - eight of the nine trade prices match a NAV here to four decimals
//   - the first trade (13-08-2025, an NFO allotment at 10.0000) predates the whole history,
//     which starts 20-08-2025
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
