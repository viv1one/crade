import { getCollections } from "../db/collections";
import type { NewsItem } from "./types";

// News moves faster than fundamentals but a chat question doesn't need
// second-by-second freshness — 30 minutes keeps repeat questions about the
// same symbol from re-hitting the feed every time.
const TTL_MS = 30 * 60 * 1000;

export async function getCachedNews(query: string): Promise<NewsItem[] | null> {
  const { newsCache } = await getCollections();
  const doc = await newsCache.findOne({ query });
  if (!doc) return null;
  if (Date.now() - doc.fetchedAt.getTime() > TTL_MS) return null;
  return doc.items;
}

export async function setCachedNews(query: string, items: NewsItem[]): Promise<void> {
  const { newsCache } = await getCollections();
  await newsCache.updateOne(
    { query },
    { $set: { query, items, fetchedAt: new Date() } },
    { upsert: true }
  );
}
