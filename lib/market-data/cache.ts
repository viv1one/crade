import { getCollections } from "../db/collections";
import type { Fundamentals, HistoricalBar } from "./types";

const TTL_MS = 5 * 60 * 1000;
// Fundamentals (P/E, market cap, EPS, dividend yield) move slowly compared
// to price — a much longer TTL than historical candles cuts how often the
// fragile getFundamentals endpoint gets hit, without the data going stale
// in any way that matters for research use.
const FUNDAMENTALS_TTL_MS = 6 * 60 * 60 * 1000;

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

export async function getCachedFundamentals(symbol: string): Promise<Fundamentals | null> {
  const { fundamentalsCache } = await getCollections();
  const doc = await fundamentalsCache.findOne({ symbol });
  if (!doc) return null;
  if (Date.now() - doc.fetchedAt.getTime() > FUNDAMENTALS_TTL_MS) return null;
  return {
    symbol: doc.symbol,
    marketCap: doc.marketCap,
    peRatio: doc.peRatio,
    eps: doc.eps,
    dividendYield: doc.dividendYield,
  };
}

export async function setCachedFundamentals(
  symbol: string,
  fundamentals: Fundamentals,
  source: string
): Promise<void> {
  const { fundamentalsCache } = await getCollections();
  await fundamentalsCache.updateOne(
    { symbol },
    {
      $set: {
        symbol,
        marketCap: fundamentals.marketCap,
        peRatio: fundamentals.peRatio,
        eps: fundamentals.eps,
        dividendYield: fundamentals.dividendYield,
        source,
        fetchedAt: new Date(),
      },
    },
    { upsert: true }
  );
}
