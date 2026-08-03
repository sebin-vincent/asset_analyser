// XIRR — the annualised return of a series of dated, irregular cash flows.
//
// CAGR (computeCagrPct in returns.ts) assumes a single lump sum held from start to end. Money
// paid in across nine dates is a different question: ₹1 invested a month ago has not had the
// same time to work as ₹1 invested a year ago, and a CAGR over the whole span silently credits
// both equally. XIRR is the rate that makes the discounted flows sum to zero.

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export interface CashFlow {
  time: number; // epoch ms
  amount: number; // negative = money in to the investment, positive = money out
}

// Net present value of the flows at annual rate `rate`, discounting from the first flow.
export function npv(flows: CashFlow[], rate: number): number {
  const t0 = flows[0].time;
  let total = 0;
  for (const flow of flows) {
    const years = (flow.time - t0) / MS_PER_YEAR;
    total += flow.amount / Math.pow(1 + rate, years);
  }
  return total;
}

function npvDerivative(flows: CashFlow[], rate: number): number {
  const t0 = flows[0].time;
  let total = 0;
  for (const flow of flows) {
    const years = (flow.time - t0) / MS_PER_YEAR;
    if (years === 0) continue;
    total -= (years * flow.amount) / Math.pow(1 + rate, years + 1);
  }
  return total;
}

const TOLERANCE = 1e-9;
const MAX_ITERATIONS = 100;
const RATE_FLOOR = -0.9999; // a rate of -100% makes the discount factor undefined

// Returns the annualised rate as a percentage, or null when it isn't defined:
// fewer than two flows, all flows the same sign (nothing to solve for), or no convergence.
// Null rather than a fallback number — an unconverged root dressed up as a return would be
// exactly the kind of confident wrong figure this app has to avoid.
export function computeXirrPct(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;

  const sorted = [...flows].sort((a, b) => a.time - b.time);
  const hasNegative = sorted.some((f) => f.amount < 0);
  const hasPositive = sorted.some((f) => f.amount > 0);
  if (!hasNegative || !hasPositive) return null;
  if (sorted[0].time === sorted[sorted.length - 1].time) return null;

  // Newton-Raphson from a 10% guess: fast, and converges for nearly every real portfolio.
  let rate = 0.1;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const value = npv(sorted, rate);
    if (Math.abs(value) < TOLERANCE) return rate * 100;

    const slope = npvDerivative(sorted, rate);
    if (slope === 0 || !Number.isFinite(slope)) break;

    const next = rate - value / slope;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < TOLERANCE) return next * 100;
    rate = Math.max(next, RATE_FLOOR);
  }

  // Newton can oscillate or shoot out of range on awkward flow patterns. Bisection is slower but
  // cannot diverge, so it is the fallback rather than the primary.
  return bisect(sorted);
}

function bisect(flows: CashFlow[]): number | null {
  let low = RATE_FLOOR;
  let high = 10; // +1000% a year; beyond this the answer isn't meaningful anyway
  let fLow = npv(flows, low);
  const fHigh = npv(flows, high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh)) return null;
  if (fLow * fHigh > 0) return null; // no sign change, so no root in range

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(flows, mid);
    if (Math.abs(fMid) < TOLERANCE || (high - low) / 2 < TOLERANCE) return mid * 100;
    if (fLow * fMid < 0) {
      high = mid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return null;
}
