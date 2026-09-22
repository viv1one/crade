// A Trading Agents verdict shown elsewhere in the app (e.g. a watchlist row
// badge) without the user having just run the analysis themselves needs a
// staleness cutoff — otherwise a BUY badge from a week-old run reads as a
// live signal. 48h, not the pipeline's own 30min/6h data caches: those
// bound how stale the *inputs* can be, this bounds how stale the *verdict*
// itself can be before it's shown as a real signal vs. a "re-run for a
// fresh read" prompt.
const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export function isVerdictStale(createdAt: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(createdAt).getTime() > STALE_AFTER_MS;
}
