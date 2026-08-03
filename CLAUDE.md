# Mutual Fund Comparison

Frontend-only React app for comparing the historical performance of Indian mutual funds. Search for funds, add several to a comparison list, pick a date range, and see their normalized % growth overlaid on one chart plus a returns/CAGR table.

## Commands

```bash
npm run dev      # Vite dev server on :5173
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

There is no test suite yet. `src/utils/` is written as pure functions specifically so it can be unit-tested without React or Recharts — that's the natural place to start if adding tests.

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

## Conventions worth preserving

- **Fetching is keyed only by `schemeCode`, never by date range.** The full history is fetched once and all range slicing happens client-side in `useMemo`. Changing the date range must never trigger a network call.
- **Cache is two-tier** ([fundHistoryCache.ts](src/cache/fundHistoryCache.ts)): in-memory `Map`, then `localStorage` under `mf-cache:{schemeCode}`. An entry is reused as-is if fetched today, otherwise fully refetched — historical NAVs are immutable, only the latest entry changes, and there's no delta endpoint. Removing a fund does **not** evict its cache, so re-adding is instant.
- **Colors are assigned by fixed slot index, never by list position.** `SelectedFund.colorIndex` is set at add-time to the next unused slot and stored; removing a fund must not repaint the survivors. The palette in [colors.ts](src/utils/colors.ts) is a CVD-validated fixed order with separate light/dark steps — assign in order, don't cycle or generate hues.
- **Text never wears the series color.** Identity comes from a colored swatch/line-key *beside* the text; labels and values use the ink tokens. Light hues (yellow, aqua) are illegible as text on the light surface.
- Colors are hardcoded as Tailwind arbitrary values (`text-[#0b0b0b]`, `dark:text-white`) rather than theme tokens. Fine at this size; if the palette grows, promote them to CSS custom properties.

## State

`App.tsx` owns three pieces of state: `selectedFunds` (persisted to `localStorage` under `mf-selected-funds`), `dateRange`, and the committed two-point `selection`. Everything else — parsed points, chart data, summaries, per-fund deltas, the "Max" preset bound — is derived via `useMemo`. Keep it that way; there's no reason for this app to need a state library.

Two deliberate placements:
- The selection's **hover preview** state lives inside `ComparisonChart`, not `App` — it updates at pointer rate, and in `App` it would re-render the search box, fund list, date picker and table on every mouse move.
- `effectiveRangeByCode` is computed once in `App`'s main `useMemo` and passed to both the summary table and the delta panel, so the chart and the panel cannot disagree about which slice of a fund's history is in play. The selection clears whenever `chartData` changes identity (covers range changes, fund removal, and the chart emptying), which is what prevents a locked selection from stranding against a domain that no longer contains it.

## Verifying changes

The dev server is wired for the browser preview via `.claude/launch.json`. Screenshots and coordinate-based `computer` clicks don't work in that pane — drive interactions with `form_input` on a `ref`, a JS-dispatched `.click()`, or synthetic `PointerEvent`s at computed offsets, and read results with `get_page_text`. React state updates are async, so `await` a short sleep before asserting on the DOM or you'll read pre-render text.

Vite serves the TS modules directly, so the real (not reimplemented) pure modules can be unit-tested from the browser console: `await import('/src/utils/selectionDelta.ts')`. That's the cheapest way to exercise `selectionDelta`'s branches with synthetic data.

A good smoke test: add two large-cap funds from different houses (e.g. "HDFC Large Cap Fund Growth Direct" and "SBI Large Cap Fund Direct Growth"), check 1Y and Max render distinct lines with a legend, then set the range to a weekend to confirm the empty/degenerate-range handling. For the selection feature, cross-check one fund's delta against the returns table by setting the date range to the two selected dates — they must agree exactly.

Two browser-pane quirks that will cost you an hour each if you don't know them:

- **`requestAnimationFrame` never fires** — the pane doesn't composite (which is also why screenshots fail). Recharts rAF-throttles `mousemove`, so **the tooltip cannot be activated by a synthetic hover** until you shim it: `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 0)`. Clicks are unaffected because the selection resolver is deliberately synchronous. Nothing is broken in the app when this happens — don't go looking for a tooltip bug.
- The emulated `prefers-color-scheme` toggle changes `matchMedia().matches` but does **not** dispatch `change` to existing listeners, so already-mounted components keep their old theme. Reload after switching, or you'll chase a phantom `useColorScheme` bug.
