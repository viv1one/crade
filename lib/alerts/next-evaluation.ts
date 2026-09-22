// Matches .github/workflows/evaluate-alerts.yml's cron exactly
// ("0 */4 * * *" — every 4 hours on the hour, UTC). Kept in sync manually;
// if that cron schedule ever changes, this needs updating too.
const INTERVAL_HOURS = 4;

export function nextEvaluationTime(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  const hoursUntilNextBoundary = INTERVAL_HOURS - (next.getUTCHours() % INTERVAL_HOURS);
  next.setUTCHours(next.getUTCHours() + hoursUntilNextBoundary);
  return next;
}
