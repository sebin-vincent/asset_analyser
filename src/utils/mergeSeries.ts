import type { ChartPoint } from '../types/fund';
import type { PctGrowthPoint } from './normalize';

export interface FundSeriesInput {
  schemeCode: number;
  series: PctGrowthPoint[]; // ascending, already restricted to the fund's effective range
}

// A dated value, whatever the value happens to mean. The comparison chart plots % growth; the
// what-if chart plots rupees. The alignment is identical either way.
export interface ValuePoint {
  time: number;
  value: number;
}

export interface ValueSeriesInput {
  schemeCode: number;
  series: ValuePoint[]; // ascending
}

interface AnySeries<T> {
  schemeCode: number;
  series: T[];
}

function unionOf<T extends { time: number }>(list: AnySeries<T>[]): number[] {
  const set = new Set<number>();
  for (const fund of list) {
    for (const point of fund.series) set.add(point.time);
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function buildUnionDates(fundSeriesList: FundSeriesInput[]): number[] {
  return unionOf(fundSeriesList);
}

// The one alignment algorithm, shared by both charts. Each fund's value is forward-filled across
// dates where it has no own data point (weekends/holidays), and left `null` before its first
// point so its line only starts once it has data.
//
// Note it never emits a *trailing* null: a fund whose data stops early keeps drawing a flat line
// to the end of the union. selectionDelta's `no-update` case exists to describe exactly that.
function mergeAligned<T extends { time: number }>(
  list: AnySeries<T>[],
  valueOf: (point: T) => number,
  extraDates: number[],
): ChartPoint[] {
  const dates = unionOf(list);
  if (extraDates.length > 0) {
    const all = new Set(dates);
    for (const date of extraDates) all.add(date);
    dates.length = 0;
    dates.push(...Array.from(all).sort((a, b) => a - b));
  }

  const pointers = new Array(list.length).fill(0);
  const lastValues: (number | null)[] = new Array(list.length).fill(null);

  return dates.map((date) => {
    const point: ChartPoint = { date };
    list.forEach((fund, idx) => {
      const series = fund.series;
      while (pointers[idx] < series.length && series[pointers[idx]].time <= date) {
        lastValues[idx] = valueOf(series[pointers[idx]]);
        pointers[idx]++;
      }
      point[String(fund.schemeCode)] = lastValues[idx];
    });
    return point;
  });
}

// Merges each fund's % growth series onto one shared, sorted set of dates.
export function mergeToChartData(fundSeriesList: FundSeriesInput[]): ChartPoint[] {
  return mergeAligned(fundSeriesList, (p) => p.pct, []);
}

// Same alignment for plain value series. `extraDates` forces rows the funds' own data wouldn't
// produce — the what-if chart passes purchase dates so the line steps on the day money went in,
// not on the next trading day.
export function mergeValueSeries(
  list: ValueSeriesInput[],
  extraDates: number[] = [],
): ChartPoint[] {
  return mergeAligned(list, (p) => p.value, extraDates);
}
