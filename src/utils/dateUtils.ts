import type { NavPoint, RawNavPoint } from '../types/fund';

// mfapi dates are "DD-MM-YYYY". Parsed as UTC midnight so date arithmetic is unaffected by local timezone.
export function parseDDMMYYYY(dateStr: string): number {
  const [dd, mm, yyyy] = dateStr.split('-').map(Number);
  return Date.UTC(yyyy, mm - 1, dd);
}

// Real-calendar UTC midnight, or null. The round-trip *is* the validation: Date.UTC silently
// rolls 2024-13-32 over to 2025-02-01 and 2025-02-29 over to 2025-03-01, and it maps a 2-digit
// year to 1900+y. Reading the components back and requiring they match rejects all three without
// a month-length table that could itself disagree with Date.UTC's own arithmetic — and it gets
// century leap rules (1900 no, 2000 yes) for free.
function utcMidnight(year: number, month: number, day: number): number | null {
  const t = Date.UTC(year, month - 1, day);
  const d = new Date(t);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return t;
}

const TRADEBOOK_DD_MM_YYYY = /^(\d{2})-(\d{2})-(\d{4})$/;
const TRADEBOOK_YYYY_MM_DD = /^(\d{4})-(\d{2})-(\d{2})$/;

// Zerodha tradebook exports have been observed in both DD-MM-YYYY and YYYY-MM-DD. The two shapes
// are provably disjoint — a string can't have both a 2-digit and a 4-digit first group — so this
// is two anchored regexes with no fallback branch, never an "else it must be the other format"
// dispatch. That distinction matters: a naive `firstGroup.length === 4 ? iso : dmy` sends
// '06-08-25' into the DMY branch, and Date.UTC(25, 7, 6) silently returns 1925-08-06 — finite, an
// exact UTC midnight, and a perfectly plausible-looking wrong date. Requiring the year group to
// be exactly \d{4} (never \d{2,4}) is what keeps the two grammars from overlapping.
//
// Deliberately rejected, all loudly (the caller's `bad-rows` names the line): 2-digit years,
// unpadded components, and slashes. Slashes in particular are declined even though YYYY/MM/DD
// alone would be unambiguous — because admitting the family also admits DD/MM/YYYY, which is
// exactly the shape Excel writes on a locale round-trip, and en-IN's 6 Aug and en-US's 8 Jun are
// indistinguishable from the string alone. Never `new Date(dateStr)`: it parses date-only ISO
// strings as UTC but date-times without an offset as *local* time, and reads 'DD-MM-YYYY' as
// MM-DD-YYYY — both silent, both wrong on a machine east of UTC.
export function parseTradebookDate(dateStr: string): number | null {
  const dmy = TRADEBOOK_DD_MM_YYYY.exec(dateStr);
  if (dmy) return utcMidnight(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const iso = TRADEBOOK_YYYY_MM_DD.exec(dateStr);
  if (iso) return utcMidnight(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  return null;
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
