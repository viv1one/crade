import type { RedditPost, SentimentSnapshot } from "./types";

// A small finance-slang lexicon rather than another LLM call per post —
// pure, deterministic, and free, matching lib/portfolio/diagnostics.ts's
// convention of keeping scoring logic I/O-free and unit-testable. This is
// deliberately crude (word-count based, no negation handling) — it's meant
// to give the sentiment analyst a rough read to narrate, not a precise
// sentiment model.
const POSITIVE_WORDS = [
  "bullish", "rally", "rallying", "breakout", "upgrade", "upgraded", "surge", "surging",
  "outperform", "buy", "accumulate", "beat", "beats", "strong", "record high", "multibagger",
  "undervalued", "momentum", "uptrend",
];

const NEGATIVE_WORDS = [
  "bearish", "crash", "crashing", "downgrade", "downgraded", "selloff", "sell-off", "plunge",
  "plunging", "underperform", "sell", "dump", "miss", "misses", "weak", "record low", "overvalued",
  "downtrend", "scam", "fraud",
];

function scoreText(text: string): number {
  const lower = text.toLowerCase();
  let hits = 0;
  let positive = 0;
  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) {
      hits++;
      positive++;
    }
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) hits++;
  }
  if (hits === 0) return 0;
  const negative = hits - positive;
  return (positive - negative) / hits;
}

function confidenceFor(postCount: number): SentimentSnapshot["confidence"] {
  if (postCount < 5) return "low";
  if (postCount < 10) return "medium";
  return "high";
}

export function scoreSentiment(posts: RedditPost[]): SentimentSnapshot {
  if (posts.length === 0) {
    return { postCount: 0, avgScore: 0, topPosts: [], confidence: "low" };
  }

  const scored = posts.map((p) => ({
    title: p.title,
    link: p.permalink,
    score: scoreText(`${p.title} ${p.body}`),
    redditScore: p.score,
  }));

  const avgScore = scored.reduce((sum, p) => sum + p.score, 0) / scored.length;
  const topPosts = [...scored]
    .sort((a, b) => b.redditScore - a.redditScore)
    .slice(0, 5)
    .map(({ title, link, score }) => ({ title, link, score }));

  return { postCount: posts.length, avgScore, topPosts, confidence: confidenceFor(posts.length) };
}
