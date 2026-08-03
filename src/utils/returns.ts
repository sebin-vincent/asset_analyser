import type { FundReturnSummary } from '../types/fund';
import type { EffectiveRange } from './normalize';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function computeAbsoluteReturnPct(startNav: number, endNav: number): number {
  return (endNav / startNav - 1) * 100;
}

// Returns null when the span is too short (<1 day) for an annualized figure to be meaningful.
export function computeCagrPct(
  startNav: number,
  endNav: number,
  startTime: number,
  endTime: number,
): number | null {
  const years = (endTime - startTime) / MS_PER_YEAR;
  if (years < 1 / 365.25) return null;
  return (Math.pow(endNav / startNav, 1 / years) - 1) * 100;
}

export function buildReturnSummary(
  schemeCode: number,
  name: string,
  range: EffectiveRange,
): FundReturnSummary {
  return {
    schemeCode,
    name,
    startDate: range.effectiveStart,
    endDate: range.effectiveEnd,
    startNav: range.startNav,
    endNav: range.endNav,
    absoluteReturnPct: computeAbsoluteReturnPct(range.startNav, range.endNav),
    cagrPct: computeCagrPct(range.startNav, range.endNav, range.effectiveStart, range.effectiveEnd),
    isPartialRange: range.isPartialRange,
  };
}
