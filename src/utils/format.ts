// en-IN gives lakh/crore digit grouping for free (₹3,06,985 rather than ₹306,985).
const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const INR_PRECISE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatInr(amount: number): string {
  return INR.format(amount);
}

export function formatInrPrecise(amount: number): string {
  return INR_PRECISE.format(amount);
}

// Signed, for gains and differences — the sign is the point, so it's always shown.
export function formatInrSigned(amount: number): string {
  return `${amount >= 0 ? '+' : '−'}${INR.format(Math.abs(amount))}`;
}

export function formatPctSigned(pct: number, digits = 2): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(digits)}%`;
}

// Compact axis labels: ₹3.2L, ₹1.4Cr. A rupee axis at full width crowds out the plot.
export function formatInrCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}k`;
  return `${sign}₹${Math.round(abs)}`;
}
