import type { RawNavPoint, SelectedFund } from '../../types/fund';
import { toAscendingNavPoints } from '../dateUtils';
import { resolveEffectiveRange } from '../normalize';
import type { FundDeltaInput } from '../selectionDelta';

// Fixtures are raw mfapi-shaped rows rather than pre-parsed NavPoints, so every test that uses
// them exercises toAscendingNavPoints for free and can't quietly drift from the real input shape.

export function utc(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

// Entries are written oldest-first for readability, then reversed — mfapi returns newest-first.
function rows(entries: [date: string, nav: string][]): RawNavPoint[] {
  return entries.map(([date, nav]) => ({ date, nav })).reverse();
}

export interface FundFixture {
  schemeCode: number;
  name: string;
  rows: RawNavPoint[];
}

// Jan 2024. Weekends (6-7, 13-14) are absent from every fund, as they would be in real data.
// FUND_A and FUND_B additionally have *divergent* gaps — A misses the 8th, B misses the 9th — so
// the union of dates forces each of them to forward-fill on a day the other actually traded.
export const FUND_A: FundFixture = {
  schemeCode: 100,
  name: 'Alpha Large Cap Fund',
  rows: rows([
    ['01-01-2024', '100.0000'],
    ['02-01-2024', '102.0000'],
    ['03-01-2024', '101.0000'],
    ['04-01-2024', '105.0000'],
    ['05-01-2024', '110.0000'],
    ['09-01-2024', '112.0000'],
    ['10-01-2024', '120.0000'],
    ['11-01-2024', '118.0000'],
    ['12-01-2024', '125.0000'],
    ['15-01-2024', '130.0000'],
  ]),
};

// An order of magnitude away from FUND_A's NAVs, so any test that accidentally compares raw NAVs
// across funds instead of percentages fails loudly.
export const FUND_B: FundFixture = {
  schemeCode: 200,
  name: 'Beta Flexi Cap Fund',
  rows: rows([
    ['01-01-2024', '1000.0000'],
    ['02-01-2024', '1010.0000'],
    ['03-01-2024', '1005.0000'],
    ['04-01-2024', '1020.0000'],
    ['05-01-2024', '1040.0000'],
    ['08-01-2024', '1050.0000'],
    ['10-01-2024', '1080.0000'],
    ['11-01-2024', '1070.0000'],
    ['12-01-2024', '1100.0000'],
    ['15-01-2024', '1150.0000'],
  ]),
};

// Launches on the 10th — its line starts partway across a range beginning on the 1st.
export const FUND_LATE: FundFixture = {
  schemeCode: 300,
  name: 'Gamma New Fund',
  rows: rows([
    ['10-01-2024', '50.0000'],
    ['11-01-2024', '49.5000'],
    ['12-01-2024', '52.0000'],
    ['15-01-2024', '55.0000'],
  ]),
};

// Discontinued: its entire history predates any Jan-2024 range. This is the fund that used to
// collapse to a single point and report "+0.00%".
export const FUND_STALE: FundFixture = {
  schemeCode: 400,
  name: 'Delta Discontinued Fund',
  rows: rows([
    ['01-01-2020', '20.0000'],
    ['02-01-2020', '21.0000'],
    ['03-01-2020', '22.0000'],
  ]),
};

// toAscendingNavPoints drops NaN but keeps zero, so a 0 NAV reaches the delta maths intact and
// would divide to Infinity without selectionDelta's own guard.
export const FUND_ZERO_START: FundFixture = {
  schemeCode: 500,
  name: 'Epsilon Zero-NAV Fund',
  rows: rows([
    ['01-01-2024', '0.0000'],
    ['02-01-2024', '10.0000'],
    ['03-01-2024', '12.0000'],
  ]),
};

// Purpose-built so the naive "subtract the two plotted percentages" answer disagrees with the
// truth about *which fund won*, not merely by how much.
//
// Baselined on 01-01 (both at 100), read between 02-01 and 03-01:
//   INVERSION_A  plotted +300% -> +400%   naive +100pp   true +25%
//   INVERSION_B  plotted   +0% ->  +90%   naive  +90pp   true +90%
// Naive ranks A above B. The truth is the reverse.
export const INVERSION_A: FundFixture = {
  schemeCode: 600,
  name: 'Inversion A',
  rows: rows([
    ['01-01-2024', '100.0000'],
    ['02-01-2024', '400.0000'],
    ['03-01-2024', '500.0000'],
  ]),
};

export const INVERSION_B: FundFixture = {
  schemeCode: 700,
  name: 'Inversion B',
  rows: rows([
    ['01-01-2024', '100.0000'],
    ['02-01-2024', '100.0000'],
    ['03-01-2024', '190.0000'],
  ]),
};

export function toFund(fixture: FundFixture, colorIndex = 0): SelectedFund {
  return { schemeCode: fixture.schemeCode, name: fixture.name, colorIndex };
}

// Builds the FundDeltaInput that App assembles for each charted fund. Throws rather than
// returning null: App skips funds with no effective range entirely, so a null here means the
// test's date range is wrong, not that a null input is a case worth exercising.
export function makeInput(
  fixture: FundFixture,
  rangeStart: number,
  rangeEnd: number,
): FundDeltaInput {
  const points = toAscendingNavPoints(fixture.rows);
  const effectiveRange = resolveEffectiveRange(points, rangeStart, rangeEnd);
  if (!effectiveRange) {
    throw new Error(`${fixture.name} has no effective range in the requested window`);
  }
  return { fund: toFund(fixture), points, effectiveRange };
}
