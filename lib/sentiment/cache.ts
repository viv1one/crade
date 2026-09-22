import { getCollections } from "../db/collections";
import type { SentimentSnapshot } from "./types";

// Same TTL/shape reasoning as lib/news/cache.ts — repeat questions about the
// same symbol within a session shouldn't re-hit Reddit every time.
const TTL_MS = 30 * 60 * 1000;

export async function getCachedSentiment(query: string): Promise<SentimentSnapshot | null> {
  const { sentimentCache } = await getCollections();
  const doc = await sentimentCache.findOne({ query });
  if (!doc) return null;
  if (Date.now() - doc.fetchedAt.getTime() > TTL_MS) return null;
  return doc.snapshot;
}

export async function setCachedSentiment(query: string, snapshot: SentimentSnapshot): Promise<void> {
  const { sentimentCache } = await getCollections();
  await sentimentCache.updateOne(
    { query },
    { $set: { query, snapshot, fetchedAt: new Date() } },
    { upsert: true }
  );
}
