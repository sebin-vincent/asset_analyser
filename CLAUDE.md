# Asset Analyser

Frontend-only React app for comparing Indian mutual funds, in two modes toggled at the top of the page:

- **Compare funds** — search for funds, add several, pick a date range, see their normalized % growth overlaid on one chart plus a returns/CAGR table.
- **What if?** — upload a Zerodha tradebook CSV, pick up to two alternative funds, and see what your actual purchases would be worth had the same money gone into them on the same dates. Rupee-value chart plus an invested/value/gain/XIRR table.

## Commands

```bash
npm run dev      # Vite dev server on :5173
npm run build    # tsc -b && vite build
npm run lint     # oxlint
npm test         # vitest run
npm run check    # lint + tsc -b + test — the pre-push gate
```

## Stack

React 19 + Vite + TypeScript, Tailwind CSS v4 (via `@tailwindcss/vite`, configured in `vite.config.ts` — there is no `tailwind.config.js`), Recharts for the chart. No backend, no state library, no data-fetching library — all deliberate, given the scope.

## Data source: mfapi.in

Free public API, no auth, CORS open (`Access-Control-Allow-Origin: *`) so the browser calls it directly.

- `GET https://api.mfapi.in/mf/search?q={query}` → `[{schemeCode, schemeName}, ...]`
- `GET https://api.mfapi.in/mf/{schemeCode}` → `{meta: {...}, data: [{date: "DD-MM-YYYY", nav: "123.4560"}, ...]}`

Things that will bite you:

- **`data` is newest-first**, NAV values are **strings**, and dates are **`DD-MM-YYYY`**. `toAscendingNavPoints()` in [dateUtils.ts](src/utils/dateUtils.ts) normalizes all three; always go through it.
- **Dates are parsed as UTC midnight** (`Date.UTC`) so date arithmetic doesn't drift with local timezone. Keep any new date handling on the same convention.
- **There are gaps** — no entries for weekends, market holidays, or before a fund's inception. This is the source of most complexity in the chart pipeline.
- **The search endpoint is weak.** It's substring-ish matching, not relevance-ranked, and caps results. `q=HDFC` returns 15 mostly-irrelevant results; `q=HDFC Top 100` returns `[]`. Queries need to be fairly specific to be useful.
- **Many well-known fund names changed** in SEBI's 2021 recategorization — "HDFC Top 100" is now "HDFC Large Cap Fund", "SBI Blue Chip" is now "SBI Large Cap Fund". Searching the old name finds nothing. Worth remembering when testing.
- **Some schemes are stale/discontinued** and their entire NAV history predates any recent date range. That case is handled explicitly (see below) — don't let it silently produce a 0% reading.

## Core algorithm

Funds have wildly different absolute NAVs, so the chart plots **% growth relative to the start of the selected range**, never raw NAV. Three pure steps, all in `src/utils/`:

1. **[normalize.ts](src/utils/normalize.ts) `resolveEffectiveRange()`** — binary-searches for the nearest NAV entry at-or-before `rangeStart` (the picked date is often a weekend/holiday). Falls back to the fund's own first date if it launched mid-range, flagging `isPartialRange`. Returns `null` when the fund doesn't overlap the range at all — including the case where its *entire* history predates `rangeStart`, which is checked up front. That guard matters: without it a stale fund collapses to a single point and reports a misleading `+0.00%`.
2. **`computePctGrowthSeries()`** — `(nav / nav0 - 1) * 100` for each point in the effective range.
3. **[mergeSeries.ts](src/utils/mergeSeries.ts) `mergeToChartData()`** — builds the union of all funds' dates, then for each fund **forward-fills** its last known value across dates where it has no entry (honest: the fund simply wasn't priced that day) and leaves `null` before its first data point, so `connectNulls={false}` makes a later-launching fund's line start partway across.

## Two-point comparison (click two dates on the chart)

Clicking two points on the chart shades the span and shows every fund's change between exactly those two dates in [SelectionDeltaPanel.tsx](src/components/SelectionDeltaPanel.tsx). Two things about it are load-bearing:

**Never subtract the plotted percentages.** Both plotted values are ratios against the *same* range-start baseline, so their difference is not the change between them. [selectionDelta.ts](src/utils/selectionDelta.ts) recomputes from raw NAVs — `(navAt(t2) / navAt(t1) - 1) * 100`. This is not a rounding-level concern: on a real 2015→2024 span the naive subtraction overstated by 110–160 percentage points *and inverted which fund won*. If you touch this module, the check that catches the mistake is that the result must equal `((1 + p2/100) / (1 + p1/100) - 1) * 100` computed from the two plotted percentages.

**Don't resolve the clicked date from Recharts' `activeLabel`.** It's derived from hover state that `mouseMoveMiddleware` writes on a `requestAnimationFrame` deferral, while `click` is unthrottled — so it can be a frame stale, and the first touch tap reads `undefined`. [ComparisonChart.tsx](src/components/ComparisonChart.tsx) instead resolves the pointer's own `clientX` through `usePlotArea()` + `useXAxisInverseDataSnapScale()`, read from a probe component rendered inside the chart (those hooks only work in chart context). The same resolver's plot-area bounds check is what stops clicks on the legend and axis gutters from committing, and pointerdown/pointerup are compared so a drag doesn't register as a click.

`computeSelectionDeltas` returns a **discriminated union**, not a nullable number. The case that matters is `no-update` (both endpoints land on the same NAV entry): `mergeToChartData` forward-fills indefinitely, so a fund with a lagging NAV draws a flat line indistinguishable from a genuinely flat one, and reporting `+0.00%` would resurface the same misleading zero that `resolveEffectiveRange` already guards against.

Recharts gotchas hit here: `ReferenceArea`/`ReferenceLine` default to `ifOverflow="discard"`, which *silently* drops the element when an endpoint leaves the domain — always set `"hidden"`. `ReferenceLine` defaults to `zIndex:400`, tying with `<Line>` and resolving by DOM order, so it's set explicitly to 450.

## Tooltip: NAV by default, delta only mid-pick

The hover tooltip switches on the selection phase, and this is deliberate — the range-start percentage is an artefact of how the chart is normalized, not a number anyone asked for:

| Phase | Tooltip shows |
|---|---|
| `idle` / `locked` | each fund's **NAV** (fund-list order — NAVs at 104 vs 1247 don't rank meaningfully) |
| `picking` | each fund's **% change since the anchor**, sorted descending, headed `{date} · vs {anchor date}` |

Both readouts come from [selectionDelta.ts](src/utils/selectionDelta.ts) via `navsAt` / `deltasBetween` callbacks that `App` builds over one shared `deltaInputs` memo. That's the point: the mid-pick preview and the panel that appears on the second click are the *same computation*, so they can't drift. Verified by hovering a date, committing there, and diffing the two — they must be identical. `resolveNavAt` is the shared primitive; don't add a second NAV-lookup path.

Two traps here:
- **Recharts renders custom tooltip `content` even when the box is invisible.** With the default `filterNull: true`, a row where every series is `null` gives `payload: []` and the wrapper gets `visibility: hidden` — but your component still mounts and runs. Keep the `if (!active || !payload?.length) return null` guard.
- Props you set on the `content` element are **overwritten** by Recharts' injected ones on name collision (`active`, `payload`, `label`, `coordinate`, and every resolved Tooltip prop such as `formatter`, `offset`, `separator`). The current custom prop names avoid all of them.

Hovering the anchor itself falls back to NAV mode rather than rendering a column of `+0.00%`, and `no-update` rows render as "no update" for the same reason the panel does.

## "What if?" mode — replaying a tradebook into another fund

Upload a Zerodha tradebook, pick alternatives, and every fund receives **the same money on the same dates**, priced at its own NAV that day. Identical cash flows are what make plotting rupee values directly comparable, which is why this chart's y-axis is ₹ and not %.

**Buys only.** A sell row makes [tradebook.ts](src/utils/tradebook.ts) refuse the whole file and name the offending lines. Simulating a redemption is out of scope, and ignoring one overstates the portfolio — so refusing loudly is the design, not a gap.

Facts about the CSV that the code depends on:

- Pipe- or comma-delimited, with a header row. The delimiter is detected per file from the header — whichever of `|`/`,` lets the header identify more of the required columns wins, not whichever character occurs more often, which a comma inside a fund name would fool. Columns are indexed **by header name, never by position** — Zerodha adds and reorders columns between exports, and a positional parser reads the wrong field without failing. Quoted fields (`"HDFC Fund, Direct"`) are unquoted like a spreadsheet would; a number with a thousand separator (`"4,596.02"`) is rejected as a bad row rather than normalized, since stripping commas would silently misread a European-format `"4.596,02"` as 1000x too small.
- **`trade_date` has been observed as both `DD-MM-YYYY` and `YYYY-MM-DD`** across different real exports, and `parseTradebookDate()` in [dateUtils.ts](src/utils/dateUtils.ts) accepts both — as two disjoint anchored regexes, never an "else it must be the other format" dispatch, since that dispatch sends a 2-digit year like `06-08-25` into the wrong branch and `Date.UTC` silently produces a plausible wrong date a century off. Validated by round-trip (parse, then read the components back) rather than a month-length table, which is what catches a rolled-over date like `31-04-2025` and a non-leap `29-02-2025` — both otherwise finite, plausible, and wrong by a day, which is exactly what `fundMatch.ts`'s exact epoch-equality check can't see. Slashes and trailing time components are rejected on purpose: `06/08/2025` is the one genuinely ambiguous shape in this space (Excel writes it on a locale round-trip, and en-IN's 6 Aug and en-US's 8 Jun are indistinguishable from the string alone).
- `quantity` is units, `price` is the NAV paid, so a row's invested amount is their product.
- **`price` *is* the fund's published NAV** — verified to four decimals against mfapi for 8 of the sample's 9 rows. That makes the CSV cross-checkable, and authoritative for its own fund's NAV on those dates.
- Trades group by **ISIN, not symbol**: a scheme renamed mid-history would otherwise split into two holdings.

**Identification is confirmed, not guessed** ([fundMatch.ts](src/utils/fundMatch.ts)). mfapi's search does *not* index ISIN (`?q=INF0R8F01117` → `[]`) but `meta.isin_growth` carries it, so ISIN can verify a match while only names can find one. And the search is weak: the verbatim symbol `ZERODHA MULTI ASSET PASSIVE FOF - DIRECT PLAN GROWTH` returns `[]`, while trimming the plan/option suffix returns the right scheme. Hence `deriveSearchQueries` → search → ISIN-confirm. The UI then shows the price-vs-NAV tally as evidence.

**The actual fund is simulated differently from the alternatives, deliberately.** Its units come straight from the CSV's `quantity` (the broker's real allotment), and `seedNavPoints` fills its NAV series from the CSV's own `(trade_date, price)` pairs wherever mfapi has none. Both follow from the tradebook being authoritative for its own fund. Without the seed, the sample's NFO allotment on 13-08-2025 — ₹10,000, 20% of the portfolio — vanishes, because the scheme's published history only starts 01-09-2025.

**The misleading zero, fourth appearance.** A discontinued scheme (e.g. HDFC Focused Large-Cap Fund, NAV history ending June 2014) resolves *every* 2026 purchase at-or-before to its final stale NAV. `units × nav` then returns exactly the amount invested and the fund reports a flawless **+₹0 / +0.00%** — found in the browser, not in review. `simulate()` now carries the same guard `resolveEffectiveRange` has: if the fund's last NAV predates the last purchase, it is `unavailable`, not zero. A fund that merely stops reporting a few days early is still valued, but the table prints "as of <date>" under it rather than claiming "value today".

**XIRR, not CAGR** ([xirr.ts](src/utils/xirr.ts)). `computeCagrPct` assumes one lump sum held start to end; money paid in across nine dates needs the rate that zeroes the discounted flows. Newton–Raphson with a bisection fallback, `null` when it doesn't converge or all flows share a sign — never a fabricated number next to someone's money.

[mergeSeries.ts](src/utils/mergeSeries.ts) serves both charts from one alignment algorithm: `mergeToChartData` for percentages, `mergeValueSeries` for rupees. The latter takes `extraDates` so purchase dates are forced into the timeline and each line steps on the day money went in, not the next trading day.

## Conventions worth preserving

- **Fetching is keyed only by `schemeCode`, never by date range.** The full history is fetched once and all range slicing happens client-side in `useMemo`. Changing the date range must never trigger a network call.
- **Cache is two-tier** ([fundHistoryCache.ts](src/cache/fundHistoryCache.ts)): in-memory `Map`, then `localStorage` under `aa-cache:{schemeCode}`. An entry is reused as-is if fetched today, otherwise fully refetched — historical NAVs are immutable, only the latest entry changes, and there's no delta endpoint. Removing a fund does **not** evict its cache, so re-adding is instant.
- **Colors are assigned by fixed slot index, never by list position.** `SelectedFund.colorIndex` is set at add-time to the next unused slot and stored; removing a fund must not repaint the survivors. The palette in [colors.ts](src/utils/colors.ts) is a CVD-validated fixed order with separate light/dark steps — assign in order, don't cycle or generate hues.
- **Text never wears the series color.** Identity comes from a colored swatch/line-key *beside* the text; labels and values use the ink tokens. Light hues (yellow, aqua) are illegible as text on the light surface.
- Colors are hardcoded as Tailwind arbitrary values (`text-[#0b0b0b]`, `dark:text-white`) rather than theme tokens. Fine at this size; if the palette grows, promote them to CSS custom properties.

## State

`App.tsx` owns three pieces of state: `selectedFunds` (persisted to `localStorage` under `aa-selected-funds`), `dateRange`, and the committed two-point `selection`. Everything else — parsed points, chart data, summaries, per-fund deltas, the "Max" preset bound — is derived via `useMemo`. Keep it that way; there's no reason for this app to need a state library.

Two deliberate placements:
- The selection's **hover preview** state lives inside `ComparisonChart`, not `App` — it updates at pointer rate, and in `App` it would re-render the search box, fund list, date picker and table on every mouse move.
- `effectiveRangeByCode` is computed once in `App`'s main `useMemo` and passed to both the summary table and the delta panel, so the chart and the panel cannot disagree about which slice of a fund's history is in play. The selection clears whenever `chartData` changes identity (covers range changes, fund removal, and the chart emptying), which is what prevents a locked selection from stranding against a domain that no longer contains it.

## Tests

Vitest, node environment, `src/utils/*.test.ts` only — configured in `vitest.config.ts` (kept separate from `vite.config.ts` so the react/tailwind plugins don't load). `tsconfig.app.json` includes `src`, so `tsc -b` type-checks the specs too.

The suite is deliberately narrow, and the selection rule matters more than the coverage: **this app's failure mode is a plausible wrong number, not a visible break.** A chart reading `+367%` instead of `+256%` renders perfectly. So the tests cover the pure math where a bug is invisible, and skip components, Recharts, `mfApi.ts`, `fundHistoryCache.ts` and `colors.ts`, where a bug is either visible or the test would just assert a constant against itself.

The rule for adding one: **it must fail for a reason a human wouldn't spot in review.** Prefer an independent oracle — a second route to the same number — over restating the implementation with literals. A test that recomputes `(end/start - 1) * 100` and asserts the function returns it will keep passing through the exact refactor that breaks the app.

What's pinned, and why each earns its place:

- **[pipeline.test.ts](src/utils/pipeline.test.ts)** — the cross-module contract, and the highest-value file. Runs the real chain (`toAscendingNavPoints` → `resolveEffectiveRange` → `computePctGrowthSeries` → `mergeToChartData`), then asserts `computeSelectionDeltas` agrees with an oracle derived from the *actual plotted values in `chartData`*. Four modules have to stay mutually consistent for it to pass. It also pins that the chart's flat forward-filled segment and the panel's `no-update` verdict describe the same fact.
- **[selectionDelta.test.ts](src/utils/selectionDelta.test.ts)** — the oracle `((1 + p2/100) / (1 + p1/100) - 1) * 100`; a fixture where the naive `p2 - p1` **inverts which fund won** (`INVERSION_A`/`INVERSION_B`); `no-update` asserted via the *absence* of a `pctChange` key; `partial`/`unavailable`; a sweep proving no non-finite percentage ever escapes; and the tooltip↔panel agreement that `computeNavsAt` and `computeSelectionDeltas` can't drift.
- **[normalize.test.ts](src/utils/normalize.test.ts)** — the stale-fund guard (the original `+0.00%` bug), weekend snapping vs. genuine partial range, baseline is exactly `0`.
- **[mergeSeries.test.ts](src/utils/mergeSeries.test.ts)** — forward-fill is the *previous* value, not an interpolated midpoint; leading nulls; and **no trailing nulls**, which `no-update` depends on for its meaning.
- **[dateUtils.test.ts](src/utils/dateUtils.test.ts)** — `DD-MM` order, UTC-midnight pinned to a hardcoded epoch literal (so a switch to local-time parsing fails on any machine), zero NAVs kept while `NaN` is dropped, and every `findIndexAtOrBefore` boundary. Plus `parseTradebookDate`: both accepted shapes land on the same hardcoded epoch, 2-digit years and unpadded components are rejected (kills an else-branch dispatch), rollovers and non-leap `29-02` are rejected (kills shape-only validation), and timestamp-bearing and slash-separated values are rejected.
- **[returns.test.ts](src/utils/returns.test.ts)** — CAGR against a hand-computed answer, and `null` under a day.
- **[whatIf.pipeline.test.ts](src/utils/whatIf.pipeline.test.ts)** — the what-if cross-module contract, run against the tradebook and NAV-history fixtures (real dates, real NAVs; purchase amounts are synthetic — see the fixture file). Its sharpest assertion: units derived as `amount / NAV(trade date)` must reproduce the broker's own `quantity` column. Since `amount = quantity × price`, that holds only if the NAV date resolution picks the right day — an off-by-one grabs a neighbouring NAV, units shift by a fraction of a percent, and nothing looks wrong. Also pins that dropping the seeded NAV point loses ₹10,000.
- **[tradebook.test.ts](src/utils/tradebook.test.ts)** — header-name indexing survives reordered columns, sells are refused rather than ignored, ISIN grouping, bad rows by line number. Plus comma-delimited support: every pipe fixture is asserted identical to its comma-converted twin, a pipe file with a comma-laden fund name still detects as pipe, quoted commas and thousand separators (both locales), BOM tolerance, and line numbers staying file-absolute across a blank line. Plus ISO-dated (`YYYY-MM-DD`) support: the same twin-oracle sweep for dates, a file mixing both date shapes resolving to the same instant, and a second export (comma + ISO + lowercase `false` + a `T` timestamp, two ISINs) that reproduces the bug this all started from.
- **[counterfactual.test.ts](src/utils/counterfactual.test.ts)** — value equals units × final NAV, the line steps on the purchase date, pre-inception purchases are recorded in rupees rather than dropped, and the discontinued-fund guard.
- **[xirr.test.ts](src/utils/xirr.test.ts)** — a known 10% answer, plus the **NPV oracle**: feed the returned rate back into the equation it claims to have solved and assert ≈ 0. Independent of any root-finder.
- **[fundMatch.test.ts](src/utils/fundMatch.test.ts)** — the suffix trimming still produces the exact query mfapi answers to, and the price cross-check flags a wrong fund instead of accepting it.

Fixtures live in [navData.ts](src/utils/__fixtures__/navData.ts) and [tradebookData.ts](src/utils/__fixtures__/tradebookData.ts) as **raw mfapi-shaped rows** (newest-first, string NAVs, `DD-MM-YYYY`) and the tradebook CSVs (based on real exports — fund names, ISINs, dates and prices unchanged; `quantity`, `trade_id` and `order_id` replaced with synthetic values, since the first is the one column that discloses how much real money moved and the latter two are read by nothing), not pre-parsed structures, so tests exercise the real parse and can't drift from the real input shapes.

**A passing suite proves nothing until you've watched it fail.** These mutations were each applied and reverted; if you change this code, they should still go red:

| Mutation | Expected failures |
|---|---|
| `pctChange` becomes the difference of the two range-baselined percentages | 5, incl. the oracle, the ranking-inversion test and the pipeline contract |
| Delete the `points[last].time < rangeStart` guard in `resolveEffectiveRange` | 1 — the stale-fund test |
| `start.index === end.index` returns `pctChange: 0` instead of `no-update` | 2 — the `no-update` test and the pipeline contract |
| Delimiter detection in `tradebook.ts` replaced by whole-file `|` vs `,` character counting | 1 — the comma-laden-symbol test |
| `quantity`/`price` parsed with `.replace(/,/g, '')` before `Number()` | 2 — both thousand-separator tests |
| `isBlankLine` in `tradebook.ts` uses `line.trim().length === 0` instead of stripping `|`/`,` too | 1 — the trailing all-delimiter-line test |
| `toRows` in `tradebook.ts` filters blank lines before numbering instead of after | 1 — the file-absolute line number test |
| `parseTradebookDate` dispatches with an else-branch (not-4-digits-first ⇒ DMY) instead of a second anchored regex | 2 — the unpadded-form tests |
| `utcMidnight` validates shape only, letting `Date.UTC` roll over instead of round-tripping | 11 — the rollover, leap-year, and matching `tradebook.ts` bad-rows tests |
| `wellFormed` keeps the old `DD_MM_YYYY` shape check alongside the new date parser | 5 — the ISO twin sweep, the mixed-format test, and the real second export |
| `parseTradebookDate` hands the raw string to `new Date()` instead of parsed integer components | 15 — every hardcoded-epoch test, visible on any machine east of UTC |

## Verifying changes

The dev server is wired for the browser preview via `.claude/launch.json`. Screenshots and coordinate-based `computer` clicks don't work in that pane — drive interactions with `form_input` on a `ref`, a JS-dispatched `.click()`, or synthetic `PointerEvent`s at computed offsets, and read results with `get_page_text`. React state updates are async, so `await` a short sleep before asserting on the DOM or you'll read pre-render text.

Vite serves the TS modules directly, so the real (not reimplemented) pure modules can be unit-tested from the browser console: `await import('/src/utils/selectionDelta.ts')`. That's the cheapest way to exercise `selectionDelta`'s branches with synthetic data.

A good smoke test: add two large-cap funds from different houses (e.g. "HDFC Large Cap Fund Growth Direct" and "SBI Large Cap Fund Direct Growth"), check 1Y and Max render distinct lines with a legend, then set the range to a weekend to confirm the empty/degenerate-range handling. For the selection feature, cross-check one fund's delta against the returns table by setting the date range to the two selected dates — they must agree exactly.

Two browser-pane quirks that will cost you an hour each if you don't know them:

- **`requestAnimationFrame` never fires** — the pane doesn't composite (which is also why screenshots fail). Recharts rAF-throttles `mousemove`, so **the tooltip cannot be activated by a synthetic hover** until you shim it: `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 0)`. Clicks are unaffected because the selection resolver is deliberately synchronous. Nothing is broken in the app when this happens — don't go looking for a tooltip bug.
- The emulated `prefers-color-scheme` toggle changes `matchMedia().matches` but does **not** dispatch `change` to existing listeners, so already-mounted components keep their old theme. Reload after switching, or you'll chase a phantom `useColorScheme` bug.
