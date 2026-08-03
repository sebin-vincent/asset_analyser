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
    if (points.length === 0) return unavailable(fund);

    const { effectiveStartIdx, effectiveEndIdx } = effectiveRange;

    const rawStartIdx = findIndexAtOrBefore(points, startTime);
    const rawEndIdx = findIndexAtOrBefore(points, endTime);

    // Window sits entirely before this fund's charted data.
    if (rawEndIdx === -1 || rawEndIdx < effectiveStartIdx) return unavailable(fund);

    // Clamp into the charted range. A start before the fund's first charted point means the
    // fund enters partway through the window.
    const isPartial = rawStartIdx === -1 || rawStartIdx < effectiveStartIdx;
    const startIdx = isPartial ? effectiveStartIdx : rawStartIdx;
    const endIdx = Math.min(rawEndIdx, effectiveEndIdx);

    if (startIdx > endIdx) return unavailable(fund);

    const startPoint = points[startIdx];
    const endPoint = points[endIdx];
    if (!startPoint || !endPoint) return unavailable(fund);

    // Both endpoints landed on the same NAV entry: the fund published no new NAV inside this
    // window. The chart forward-fills a flat line here, which is indistinguishable from a
    // genuinely flat one — reporting "+0.00%" would be the same misleading zero that
    // resolveEffectiveRange already guards against.
    if (startIdx === endIdx) {
      return {
        kind: 'no-update',
        schemeCode: fund.schemeCode,
        name: fund.name,
        atTime: startPoint.time,
        nav: startPoint.nav,
      };
    }

    // toAscendingNavPoints filters NaN but not zero; a 0 NAV would yield Infinity.
    if (startPoint.nav <= 0) return unavailable(fund);

    return {
      kind: isPartial ? 'partial' : 'ok',
      schemeCode: fund.schemeCode,
      name: fund.name,
      startTime: startPoint.time,
      endTime: endPoint.time,
      startNav: startPoint.nav,
      endNav: endPoint.nav,
      pctChange: (endPoint.nav / startPoint.nav - 1) * 100,
    };
  });
}
