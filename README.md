# Asset Analyser

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/sebin-vincent/asset_analyser/actions/workflows/ci.yml/badge.svg)](https://github.com/sebin-vincent/asset_analyser/actions/workflows/ci.yml)

Compare Indian mutual funds side by side across any date range, or replay your real Zerodha purchases into a different fund to see what they'd be worth.

<!-- TODO: live demo link once hosted, e.g. **[asset-analyser.example.com](https://asset-analyser.example.com)** -->

<!--
  TODO: screenshots
  ![Compare funds mode](docs/compare.png)
  ![What if? mode](docs/what-if.png)
  Capture with the dev server running (`npm run dev`), both light and dark
  look reasonable — pick whichever renders better for the README.
-->

## Features

**Compare funds**
- Search mutual funds and add several to one chart
- Pick a date range (including a "Max" preset bound to the earliest overlapping fund)
- Normalized % growth overlay so funds with wildly different NAVs are directly comparable
- Returns / CAGR summary table
- Click two points on the chart to see every fund's change between exactly those two dates
- Light and dark mode

**What if?**
- Upload a Zerodha tradebook CSV
- Pick up to two alternative funds
- See what your actual purchases would be worth had the same money gone into them on the same dates
- Rupee-value chart plus an invested / value / gain / **XIRR** table

## Privacy

There is no backend. NAV data is fetched directly from [mfapi.in](https://www.mfapi.in/) in your browser, and an uploaded tradebook CSV is parsed entirely client-side — it is never sent anywhere. The only persistence is your browser's `localStorage` (selected funds, theme preference, and a per-fund NAV history cache).

## Disclaimer

This tool is for information and education only — it is **not investment advice**. NAV data comes from a free third-party API and may be incomplete, delayed, or wrong. Past performance does not indicate future returns.

## Quick start

Requires Node.js ≥ 20.19 and npm.

```bash
git clone git@github.com:sebin-vincent/asset_analyser.git
cd asset_analyser
npm install
npm run dev      # http://localhost:5173
```

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server on `:5173` |
| `npm run build` | Type-check (`tsc -b`) then production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | oxlint |
| `npm test` | Run the test suite once (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run check` | lint + type-check + test — the gate CI and pre-push both run |

## How it works

- **Data source**: [mfapi.in](https://www.mfapi.in/), a free, unauthenticated, CORS-open API — the browser calls it directly. Its history is newest-first, NAVs are strings, and dates are `DD-MM-YYYY`; it also has gaps for weekends/holidays and a weak, non-relevance-ranked search (worth knowing if you go looking for a fund and get nothing — many funds were renamed in SEBI's 2021 recategorization).
- **Chart math**: funds have wildly different absolute NAVs, so the chart always plots **% growth relative to the start of the selected range**, never raw NAV.
- **What if? mode**: every alternative fund receives the same money on the same dates as your real purchases, priced at its own NAV that day — identical cash flows are what make plotting rupee values directly comparable.

Design decisions and the traps behind them — stale/discontinued funds silently reporting a misleading `+0.00%`, why the two-point delta can't be computed by subtracting plotted percentages, tradebook CSV quirks, and the reasoning behind every pinned test — are documented in depth in [CLAUDE.md](CLAUDE.md). It's written for an AI coding agent but is equally useful as an engineering deep-dive for human contributors.

## Project structure

```
src/
  api/        mfapi.in client
  cache/      two-tier (memory + localStorage) NAV history cache
  components/ chart, tables, search, upload, and other UI
  hooks/      fund search, fund history, theme, tradebook matching
  types/      shared TypeScript types
  utils/      pure functions — date/NAV parsing, the chart pipeline,
              tradebook parsing, XIRR, and fund identification;
              __fixtures__/ holds realistic sample API and CSV data
```

## Tech stack

React 19 + Vite + TypeScript, Tailwind CSS v4 (via `@tailwindcss/vite` — there is no `tailwind.config.js`), Recharts for the chart, Vitest for tests, oxlint for linting. No backend, no state library, and no data-fetching library — all derived state is `useMemo`, which is deliberate given the app's scope.

## Deploying

It's a static site: `npm run build` produces `dist/`, which can be served from anywhere.

- **Netlify**: build command `npm run build`, publish directory `dist`.
- **Vercel**: framework preset "Vite" — it will infer the same build command and output directory.
- Deploying to a subpath (e.g. a GitHub Pages *project* site) additionally needs `base` set in [vite.config.ts](vite.config.ts); not needed on Netlify/Vercel's root domains.

## Contributing

Contributions are welcome — bug reports (especially a fund showing a number that looks wrong), new features, and doc fixes alike. See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, the testing philosophy, and what a good PR looks like here.

## License

[MIT](LICENSE)

## Acknowledgements

Thanks to [mfapi.in](https://www.mfapi.in/) for the free, open mutual fund NAV API this project runs on.
