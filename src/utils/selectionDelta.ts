import type { NavPoint, SelectedFund } from '../types/fund';
import { findIndexAtOrBefore } from './dateUtils';
import type { EffectiveRange } from './normalize';

// The four distinct outcomes of asking "how did this fund change between two dates?".
// Deliberately not `number | null` — three of these would collapse into one ambiguous dash.
export type FundDelta =
  | {
      kind: 'ok';
      schemeCode: number;
      name: string;
      startTime: number; // resolved NAV date, not the clicked date
      endTime: number;
      startNav: number;
      endNav: number;
      pctChange: number;
    }
  | {
      kind: 'partial'; // fund's data begins inside the selected window
      schemeCode: number;
      name: string;
      startTime: number;
      endTime: number;
      startNav: number;
      endNav: number;
      pctChange: number;
    }
  | {
      kind: 'no-update'; // both endpoints resolve to the same NAV entry — the fund wasn't repriced in this window
      schemeCode: number;
      name: string;
      atTime: number;
      nav: number;
    }
  | {
      kind: 'unavailable'; // no usable NAV data in this window at all
      schemeCode: number;
      name: string;
    };

export interface FundDeltaInput {
  fund: SelectedFund;
  points: NavPoint[];
  effectiveRange: EffectiveRange;
}

function unavailable(fund: SelectedFund): FundDelta {
  return { kind: 'unavailable', schemeCode: fund.schemeCode, name: fund.name };
}

export interface ResolvedNav {
  index: number;
  time: number; // the NAV entry's own date, which may predate the requested time
  nav: number;
}

// Resolves a fund's NAV as of `time`: the nearest entry at-or-before it (mirroring the chart's
// forward-fill), clamped into the fund's charted range so we never read outside what's drawn.
// Returns null when the fund has no charted data at or before `time`.
//
// Shared by the delta maths and the tooltip's NAV readout so every number on screen resolves the
// same way — the tooltip's live preview and the committed panel cannot drift apart.
export function resolveNavAt(
  points: NavPoint[],
  effectiveRange: EffectiveRange,
  time: number,
): ResolvedNav | null {
  if (points.length === 0) return null;
  const { effectiveStartIdx, effectiveEndIdx } = effectiveRange;

  const rawIdx = findIndexAtOrBefore(points, time);
  if (rawIdx === -1 || rawIdx < effectiveStartIdx) return null;

  const index = Math.min(rawIdx, effectiveEndIdx);
  const point = points[index];
  if (!point) return null;

  return { index, time: point.time, nav: point.nav };
}

export interface FundNav {
  schemeCode: number;
  name: string;
  navTime: number; // the resolving entry's date; may be earlier than the hovered date
  nav: number;
}

// Per-fund NAV at a single point in time. Funds with no charted data yet are omitted, matching
// the chart, where their line hasn't started.
export function computeNavsAt(inputs: FundDeltaInput[], time: number): FundNav[] {
  const out: FundNav[] = [];
  for (const { fund, points, effectiveRange } of inputs) {
    const resolved = resolveNavAt(points, effectiveRange, time);
    if (!resolved) continue;
    out.push({
      schemeCode: fund.schemeCode,
      name: fund.name,
      navTime: resolved.time,
      nav: resolved.nav,
    });
  }
  return out;
}

// Computes each fund's % change between two timestamps, from RAW NAVs.
//
// This is deliberately NOT the difference of the two plotted percentages: the chart normalizes
// every fund against the date-range start, so both plotted values are ratios over a shared
// baseline. A fund reading +100% then +300% grew 100% between those points, not 200.
//
// Endpoints resolve to the nearest NAV entry at-or-before each timestamp (mirroring the chart's
// forward-fill) and are clamped into the fund's charted range, so the panel can never report a
// value for a stretch where the chart draws nothing.
export function computeSelectionDeltas(
  inputs: FundDeltaInput[],
  startTime: number,
  endTime: number,
): FundDelta[] {
  return inputs.map(({ fund, points, effectiveRange }) => {
    // The end must resolve; if it doesn't, the window sits entirely before this fund's data.
    const end = resolveNavAt(points, effectiveRange, endTime);
    if (!end) return unavailable(fund);

    // A start that can't resolve means the fund enters partway through the window — clamp to its
    // first charted point and flag it, matching how resolveEffectiveRange reports a late launch.
    const resolvedStart = resolveNavAt(points, effectiveRange, startTime);
    const isPartial = resolvedStart === null;
    const start = resolvedStart ?? {
      index: effectiveRange.effectiveStartIdx,
      time: points[effectiveRange.effectiveStartIdx]?.time,
      nav: points[effectiveRange.effectiveStartIdx]?.nav,
    };
    if (start.nav === undefined || start.time === undefined) return unavailable(fund);
    if (start.index > end.index) return unavailable(fund);

    // Both endpoints landed on the same NAV entry: the fund published no new NAV inside this
    // window. The chart forward-fills a flat line here, which is indistinguishable from a
    // genuinely flat one — reporting "+0.00%" would be the same misleading zero that
    // resolveEffectiveRange already guards against.
    if (start.index === end.index) {
      return {
        kind: 'no-update',
        schemeCode: fund.schemeCode,
        name: fund.name,
        atTime: start.time,
        nav: start.nav,
      };
    }

    // toAscendingNavPoints filters NaN but not zero; a 0 NAV would yield Infinity.
    if (start.nav <= 0) return unavailable(fund);

    return {
      kind: isPartial ? 'partial' : 'ok',
      schemeCode: fund.schemeCode,
      name: fund.name,
      startTime: start.time,
      endTime: end.time,
      startNav: start.nav,
      endNav: end.nav,
      pctChange: (end.nav / start.nav - 1) * 100,
    };
  });
}
