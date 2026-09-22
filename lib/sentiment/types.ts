export interface RedditPost {
  title: string;
  body: string;
  permalink: string;
  createdAt: string; // ISO string
  score: number; // Reddit's own upvote score, not sentiment
}

export interface SentimentSnapshot {
  postCount: number;
  // -1 (very negative) .. 1 (very positive), 0 when postCount is 0.
  avgScore: number;
  topPosts: { title: string; link: string; score: number }[];
  // Reflects sample size, not the model's self-assessed confidence —
  // mirrors TauricResearch's TradingAgents SentimentReport guideline
  // ("low" when data is sparse, "high" when substantive) but computed
  // deterministically from postCount rather than asked of the LLM.
  confidence: "low" | "medium" | "high";
}
