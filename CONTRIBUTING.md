# Contributing to Asset Analyser

Thanks for considering a contribution. This is a small, frontend-only project, and the bar for a good PR here is more about correctness than volume.

## Ways to contribute

- **Bug reports** — especially a fund or date range that shows a number that looks wrong. This app's stated failure mode is a *plausible wrong number*, not a visible crash, so these reports are the most valuable kind. See "Sharing tradebook data" below before attaching a CSV.
- **Fund-data edge cases** — a fund that behaves oddly (discontinued, renamed, sparse history) is useful even without a fix; it can become a fixture.
- **Features and doc fixes** — open an issue first for anything beyond a small change, so the direction can be agreed before you invest time.

## Dev setup

```bash
git clone git@github.com:sebin-vincent/asset_analyser.git
cd asset_analyser
npm install
npm run dev
```

See the [README](README.md#project-structure) for where things live.

## The gate

```bash
npm run check   # lint + tsc -b + test
```

This must pass before you push. CI runs exactly this command, so a green local run means a green PR — there's no separate CI-only step to guess at.

## Read CLAUDE.md before touching `src/utils/`

[CLAUDE.md](CLAUDE.md) records real bugs that shipped and were later caught in the browser, not in review, and the invariants it documents are load-bearing. Two edits are worth flagging explicitly because both silently produce a wrong-but-plausible number rather than a visible failure:

- Never compute a two-point change by subtracting the two plotted percentages in [selectionDelta.ts](src/utils/selectionDelta.ts). Both are ratios against the same range-start baseline, so their difference is not the change between them — on a real 2015→2024 span this overstated the result by 110–160 percentage points and inverted which fund won. Recompute from raw NAVs instead, and read the reasoning in the "Two-point comparison" section of CLAUDE.md.
- Never remove the stale-fund guards in `resolveEffectiveRange` ([normalize.ts](src/utils/normalize.ts)) or `simulate` ([counterfactual.ts](src/utils/counterfactual.ts)). A discontinued fund's NAV history can predate an entire selected range or a whole tradebook; without the guard it resolves to a flat `+0.00%` / `+₹0` instead of being reported as unavailable.

## Testing philosophy

The suite is deliberately narrow. The rule for adding a test: **it must fail for a reason a human wouldn't spot in review.** Prefer an independent oracle — a second route to the same number — over restating the implementation with literals; a test that recomputes `(end/start - 1) * 100` and asserts the function returns it will keep passing through the exact refactor that breaks the app.

- Pure math in `src/utils/*.test.ts` is covered thoroughly.
- Components, Recharts, `mfApi.ts`, `fundHistoryCache.ts`, and `colors.ts` are deliberately not — a bug there is either visible or the test would just assert a constant against itself.
- Fixtures in [src/utils/\_\_fixtures\_\_/](src/utils/__fixtures__/) are raw, mfapi/CSV-shaped rows (newest-first, string NAVs, `DD-MM-YYYY`), not pre-parsed structures, so tests exercise the real parsing path.

If you're touching a pure `utils` module, look for a mutation-testing table already in CLAUDE.md's "Tests" section before adding new coverage — it may already describe the exact mistake you're guarding against.

## Code conventions worth knowing before you send a PR

- Fetching is keyed only by `schemeCode`, never by date range. Changing the date range must never trigger a network call — range slicing happens client-side.
- Fund colors are assigned by a fixed slot index at add-time, not by list position; removing a fund must not repaint the others.
- Text never wears a series' color — identity comes from a swatch/line-key beside the text, not colored text (some palette hues are illegible on the light surface).
- Dates are parsed as UTC midnight (`Date.UTC`); keep any new date handling on that convention.
- Derived state is `useMemo`, not a state library — keep it that way.

## Sharing tradebook data in an issue

A real Zerodha tradebook shows exactly how much money moved and when. If you're attaching one to reproduce a bug, redact the `quantity`, `trade_id`, and `order_id` columns first — fund names, ISINs, dates and prices can stay, since those are what make the report reproducible. This mirrors how the committed test fixtures were built from a real export.

## PR process

1. Branch off `master`.
2. Keep the change focused — one bug fix or one feature per PR.
3. Run `npm run check` locally.
4. For UI changes, verify in the browser — the test suite intentionally doesn't cover components or Recharts, so it can't catch a UI regression for you.
5. Describe *why* the change is needed in the PR description, not just what changed.

## Commit style

Short, imperative subject line, matching the existing history — e.g. `Fix UI bugs`, `Add what if feature to fund analysis`.
