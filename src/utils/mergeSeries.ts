import type { ChartPoint } from '../types/fund';
import type { PctGrowthPoint } from './normalize';

export interface FundSeriesInput {
  schemeCode: number;
  series: PctGrowthPoint[]; // ascending, already restricted to the fund's effective range
}

export function buildUnionDates(fundSeriesList: FundSeriesInput[]): number[] {
  const set = new Set<number>();
  for (const fund of fundSeriesList) {
    for (const point of fund.series) set.add(point.time);
  }
  return Array.from(set).sort((a, b) => a - b);
}

// Merges each fund's % growth series onto one shared, sorted set of dates.
// A fund's value is forward-filled across dates where it has no own data point (weekends/holidays),
// and left `null` before its first data point so its line only starts once it has data.
export function mergeToChartData(fundSeriesList: FundSeriesInput[]): ChartPoint[] {
  const unionDates = buildUnionDates(fundSeriesList);
  const pointers = new Array(fundSeriesList.length).fill(0);
  const lastValues: (number | null)[] = new Array(fundSeriesList.length).fill(null);

  return unionDates.map((date) => {
    const point: ChartPoint = { date };
    fundSeriesList.forEach((fund, idx) => {
      const series = fund.series;
      while (pointers[idx] < series.length && series[pointers[idx]].time <= date) {
        lastValues[idx] = series[pointers[idx]].pct;
        pointers[idx]++;
      }
      point[String(fund.schemeCode)] = lastValues[idx];
    });
    return point;
  });
}
