import { fetchWithRetry } from "../market-data/fetch-with-retry";
import type { RedditPost } from "./types";

const SEARCH_URL = "https://www.reddit.com/search.json";

// Reddit's own public search endpoint, no OAuth needed for read-only
// queries — but it does require a descriptive User-Agent or requests get
// blocked outright. Same "unofficial, no stable contract" footing as
// lib/news/google-news.ts: Reddit can change the response shape or start
// rate-limiting this without notice.
const HEADERS = {
  "User-Agent": "crade-personal-research-app/1.0 (by /u/crade-app)",
};

interface RedditListingResponse {
  data?: {
    children?: {
      data?: {
        title?: string;
        selftext?: string;
        permalink?: string;
        created_utc?: number;
        score?: number;
      };
    }[];
  };
}

// Restricting to a couple of India-focused investing subreddits (rather
// than a site-wide search) keeps results relevant to Indian equities —
// site-wide search on a bare ticker like "ITC" mostly returns noise.
const SUBREDDITS = "IndianStreetBets+IndiaInvestments+IndianStockMarket";

export async function fetchRedditPosts(query: string, limit = 15): Promise<RedditPost[]> {
  const url =
    `${SEARCH_URL}?q=${encodeURIComponent(query)}&restrict_sr=on&sr=${SUBREDDITS}` +
    `&sort=new&limit=${limit}`;
  const res = await fetchWithRetry(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`reddit search failed for "${query}": ${res.status}`);
  }
  const json = (await res.json()) as RedditListingResponse;
  const children = json.data?.children ?? [];

  return children
    .map((c) => c.data)
    .filter((d): d is NonNullable<typeof d> => d != null && typeof d.title === "string")
    .map((d) => ({
      title: d.title ?? "",
      body: d.selftext ?? "",
      permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : "",
      createdAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : new Date().toISOString(),
      score: d.score ?? 0,
    }));
}
