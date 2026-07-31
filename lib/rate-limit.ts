// In-memory sliding-window limiter. Per-process only — on a multi-instance
// serverless deployment each instance has its own bucket map, so this is a
// stopgap ceiling, not a hard guarantee, the same way lib/market-data/cache.ts's
// TTL is a stopgap until a shared store (Redis/Upstash) is worth the infra.
// Still meaningfully raises the bar over "nothing at all" for a single-region
// low-traffic personal app.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

export function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}
