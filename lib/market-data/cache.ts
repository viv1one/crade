import { getCollections } from "../db/collections";
import type { HistoricalBar } from "./types";

const TTL_MS = 5 * 60 * 1000;

function cacheKey(interval: string, range: string) {
  return `${interval}:${range}`;
}

export async function getCachedHistorical(
  symbol: string,
  interval: string,
  range: string
): Promise<HistoricalBar[] | null> {
  const { priceCache } = await getCollections();
  const doc = await priceCache.findOne({ symbol, interval: cacheKey(interval, range) });
  if (!doc) return null;
  if (Date.now() - doc.fetchedAt.getTime() > TTL_MS) return null;
  return doc.candles;
}

export async function setCachedHistorical(
  symbol: string,
  interval: string,
  range: string,
  candles: HistoricalBar[],
  source: string
): Promise<void> {
  const { priceCache } = await getCollections();
  await priceCache.updateOne(
    { symbol, interval: cacheKey(interval, range) },
    { $set: { symbol, interval: cacheKey(interval, range), candles, source, fetchedAt: new Date() } },
    { upsert: true }
  );
}
