import { getCollections } from "../db/collections";
import type { Fundamentals, HistoricalBar, Quote } from "./types";

const TTL_MS = 5 * 60 * 1000;
// Fundamentals (P/E, market cap, EPS, dividend yield) move slowly compared
// to price — a much longer TTL than historical candles cuts how often the
// fragile getFundamentals endpoint gets hit, without the data going stale
// in any way that matters for research use.
const FUNDAMENTALS_TTL_MS = 6 * 60 * 60 * 1000;
// Last-known-quote fallback is a last resort during a provider outage, not
// a normal data path — capped well under a trading week so a sustained
// outage degrades to an honest error instead of silently serving
// increasingly-irrelevant "current" prices.
const STALE_QUOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

export async function getLastKnownQuote(symbol: string): Promise<Quote | null> {
  const { lastKnownQuotes } = await getCollections();
  const doc = await lastKnownQuotes.findOne({ symbol });
  if (!doc) return null;
  if (Date.now() - doc.fetchedAt.getTime() > STALE_QUOTE_MAX_AGE_MS) return null;
  return {
    symbol: doc.symbol,
    price: doc.price,
    change: doc.change,
    changePercent: doc.changePercent,
    volume: doc.volume,
    asOf: doc.asOf,
    stale: true,
  };
}

export async function setLastKnownQuote(quote: Quote): Promise<void> {
  const { lastKnownQuotes } = await getCollections();
  await lastKnownQuotes.updateOne(
    { symbol: quote.symbol },
    {
      $set: {
        symbol: quote.symbol,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        volume: quote.volume,
        asOf: quote.asOf,
        fetchedAt: new Date(),
      },
    },
    { upsert: true }
  );
}
