import { fetchNews } from "./google-news";
import { getCachedNews, setCachedNews } from "./cache";
import type { NewsItem } from "./types";

export async function getNews(query: string, limit = 5): Promise<NewsItem[]> {
  const cached = await getCachedNews(query);
  if (cached) return cached;
  const fresh = await fetchNews(query, limit);
  await setCachedNews(query, fresh);
  return fresh;
}

export * from "./types";
