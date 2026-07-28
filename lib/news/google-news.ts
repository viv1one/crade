import { fetchWithRetry } from "../market-data/fetch-with-retry";
import type { NewsItem } from "./types";

const RSS_URL = "https://news.google.com/rss/search";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
};

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z0-9]+);/g, (match, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return ENTITIES[entity] ?? match;
  });
}

function extractTag(block: string, tag: string): string | undefined {
  return block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1];
}

// Google News RSS: free, keyless, no per-request auth — unlike Yahoo/NSE
// (see CLAUDE.md), this hasn't been observed rate-limited or IP-blocked
// from this app's environment. Still an unofficial surface, not a stable
// contract — Google can change the feed shape without notice.
export async function fetchNews(query: string, limit = 5): Promise<NewsItem[]> {
  const url = `${RSS_URL}?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`google-news fetch failed for "${query}": ${res.status}`);
  }
  const xml = await res.text();
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);

  return blocks.map(([, block]) => {
    const rawTitle = decodeXmlEntities(extractTag(block, "title") ?? "");
    const source = decodeXmlEntities(extractTag(block, "source") ?? "");
    // Google appends " - {source}" to the title; strip it since source is
    // already captured separately.
    const title =
      source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
    const link = extractTag(block, "link") ?? "";
    const pubDate = extractTag(block, "pubDate");

    return {
      title,
      link,
      source,
      publishedAt: pubDate && !Number.isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString() : new Date().toISOString(),
    };
  });
}
