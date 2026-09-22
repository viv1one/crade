import { getCollections } from "../db/collections";
import type { InsiderTransaction } from "./types";

// Filings don't change minute to minute — same cadence reasoning as
// lib/market-data/cache.ts's withFundamentalsCache (6h TTL). A failed fetch
// is never cached, same as that cache, so the next call after NSE recovers
// (or after the endpoint shape is fixed — see nse-insider.ts's caveat)
// repopulates it.
const TTL_MS = 6 * 60 * 60 * 1000;

export async function getCachedInsiderActivity(symbol: string): Promise<InsiderTransaction[] | null> {
  const { insiderCache } = await getCollections();
  const doc = await insiderCache.findOne({ symbol });
  if (!doc) return null;
  if (Date.now() - doc.fetchedAt.getTime() > TTL_MS) return null;
  return doc.transactions;
}

export async function setCachedInsiderActivity(
  symbol: string,
  transactions: InsiderTransaction[]
): Promise<void> {
  const { insiderCache } = await getCollections();
  await insiderCache.updateOne(
    { symbol },
    { $set: { symbol, transactions, fetchedAt: new Date() } },
    { upsert: true }
  );
}
