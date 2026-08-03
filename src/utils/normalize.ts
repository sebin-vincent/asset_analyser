import type { NavPoint } from '../types/fund';
import { findIndexAtOrBefore } from './dateUtils';

export interface EffectiveRange {
  effectiveStartIdx: number;
  effectiveEndIdx: number;
  effectiveStart: number;
  effectiveEnd: number;
  startNav: number;
  endNav: number;
  isPartialRange: boolean; // true if the fund's data starts after the requested rangeStart
}

// Resolves the actual (start, end) indices/NAVs to use for a fund given a requested date range,
// falling back to the fund's own first available date when it launched after rangeStart.
// Returns null if the fund has no data at or before rangeEnd (no overlap with the range at all).
export function resolveEffectiveRange(
  points: NavPoint[],
  rangeStart: number,
  rangeEnd: number,
): EffectiveRange | null {
  if (points.length === 0) return null;

  // Fund's entire history predates the range (delisted/stale scheme) — no overlap at all.
  if (points[points.length - 1].time < rangeStart) return null;

  const startIdx = findIndexAtOrBefore(points, rangeStart);
  const isPartialRange = startIdx === -1;
  const effectiveStartIdx = isPartialRange ? 0 : startIdx;

  const effectiveEndIdx = findIndexAtOrBefore(points, rangeEnd);
  if (effectiveEndIdx === -1) return null;
  if (effectiveEndIdx < effectiveStartIdx) return null;

  return {
    effectiveStartIdx,
    effectiveEndIdx,
    effectiveStart: points[effectiveStartIdx].time,
    effectiveEnd: points[effectiveEndIdx].time,
    startNav: points[effectiveStartIdx].nav,
    endNav: points[effectiveEndIdx].nav,
    isPartialRange,
  };
}

export interface PctGrowthPoint {
  time: number;
  pct: number;
}

// Computes % growth relative to the effective range's start NAV, for every point within [effectiveStartIdx, effectiveEndIdx].
export function computePctGrowthSeries(
  points: NavPoint[],
  range: EffectiveRange,
): PctGrowthPoint[] {
  const series: PctGrowthPoint[] = [];
  for (let i = range.effectiveStartIdx; i <= range.effectiveEndIdx; i++) {
    series.push({
      time: points[i].time,
      pct: (points[i].nav / range.startNav - 1) * 100,
    });
  }
  return series;
}
