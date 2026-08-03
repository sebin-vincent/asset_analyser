import type { NavPoint, RawNavPoint } from '../types/fund';

// mfapi dates are "DD-MM-YYYY". Parsed as UTC midnight so date arithmetic is unaffected by local timezone.
export function parseDDMMYYYY(dateStr: string): number {
  const [dd, mm, yyyy] = dateStr.split('-').map(Number);
  return Date.UTC(yyyy, mm - 1, dd);
}

export function formatAxisDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Parses raw mfapi NAV entries into ascending-chronological-order points, dropping malformed rows.
export function toAscendingNavPoints(raw: RawNavPoint[]): NavPoint[] {
  const points: NavPoint[] = [];
  for (const entry of raw) {
    const nav = parseFloat(entry.nav);
    if (Number.isNaN(nav)) continue;
    points.push({ time: parseDDMMYYYY(entry.date), nav });
  }
  points.sort((a, b) => a.time - b.time);
  return points;
}

// Binary search for the rightmost point with time <= targetTime. Returns -1 if none exists (all points are after targetTime).
export function findIndexAtOrBefore(points: NavPoint[], targetTime: number): number {
  let lo = 0;
  let hi = points.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].time <= targetTime) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}
