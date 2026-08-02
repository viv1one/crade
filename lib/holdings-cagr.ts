const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

// Annualized (CAGR) return between what was invested and what it's worth
// now, given how long it's actually been held — distinct from the simple
// total-P&L percentage, which doesn't account for holding period at all.
// Returns undefined when there isn't enough to compute a meaningful rate
// (no purchase date, nothing invested, or the date is in the future).
export function annualizedReturnPct(
  investedValue: number,
  currentValue: number,
  purchasedAt: Date,
  now: Date = new Date()
): number | undefined {
  if (investedValue <= 0 || currentValue < 0) return undefined;
  const years = (now.getTime() - purchasedAt.getTime()) / MS_PER_YEAR;
  if (years <= 0) return undefined;
  return (Math.pow(currentValue / investedValue, 1 / years) - 1) * 100;
}
