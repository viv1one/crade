import { fetchRedditPosts } from "./reddit";
import { scoreSentiment } from "./score";
import { getCachedSentiment, setCachedSentiment } from "./cache";
import { NIFTY_50 } from "../screener/universe";
import type { SentimentSnapshot } from "./types";

// Mirrors lib/ai/context.ts's newsQueryFor — a company name searches better
// than a bare ticker on a free-text search engine, Reddit included.
function sentimentQueryFor(symbol: string): string {
  const known = NIFTY_50.find((s) => s.symbol === symbol);
  return known?.name ?? symbol.replace(/\.(NS|BO)$/i, "");
}

export async function getSentiment(symbol: string): Promise<SentimentSnapshot> {
  const query = sentimentQueryFor(symbol);
  const cached = await getCachedSentiment(query);
  if (cached) return cached;

  const posts = await fetchRedditPosts(query);
  const snapshot = scoreSentiment(posts);
  await setCachedSentiment(query, snapshot);
  return snapshot;
}

export * from "./types";
