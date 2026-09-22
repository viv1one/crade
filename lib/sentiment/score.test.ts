import { describe, expect, it } from "vitest";
import { scoreSentiment } from "./score";
import type { RedditPost } from "./types";

function post(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    title: "",
    body: "",
    permalink: "https://reddit.com/r/test/1",
    createdAt: new Date().toISOString(),
    score: 0,
    ...overrides,
  };
}

describe("scoreSentiment", () => {
  it("returns a neutral empty snapshot for no posts", () => {
    expect(scoreSentiment([])).toEqual({ postCount: 0, avgScore: 0, topPosts: [], confidence: "low" });
  });

  it("reports confidence based on sample size, not sentiment", () => {
    const few = Array.from({ length: 3 }, (_, i) => post({ title: `post ${i}` }));
    const some = Array.from({ length: 7 }, (_, i) => post({ title: `post ${i}` }));
    const many = Array.from({ length: 12 }, (_, i) => post({ title: `post ${i}` }));
    expect(scoreSentiment(few).confidence).toBe("low");
    expect(scoreSentiment(some).confidence).toBe("medium");
    expect(scoreSentiment(many).confidence).toBe("high");
  });

  it("scores an all-positive post near +1", () => {
    const snapshot = scoreSentiment([post({ title: "Stock looks bullish, breaking out on strong momentum" })]);
    expect(snapshot.postCount).toBe(1);
    expect(snapshot.avgScore).toBeGreaterThan(0.5);
  });

  it("scores an all-negative post near -1", () => {
    const snapshot = scoreSentiment([post({ title: "Bearish crash incoming, downgrade expected" })]);
    expect(snapshot.avgScore).toBeLessThan(-0.5);
  });

  it("scores a post with no recognized words as neutral", () => {
    const snapshot = scoreSentiment([post({ title: "Quarterly results announced today" })]);
    expect(snapshot.avgScore).toBe(0);
  });

  it("ranks topPosts by Reddit's own upvote score, not sentiment score", () => {
    const snapshot = scoreSentiment([
      post({ title: "bullish", score: 1 }),
      post({ title: "bearish", score: 50 }),
    ]);
    expect(snapshot.topPosts[0].title).toBe("bearish");
  });

  it("caps topPosts at 5", () => {
    const posts = Array.from({ length: 8 }, (_, i) => post({ title: `post ${i}`, score: i }));
    expect(scoreSentiment(posts).topPosts).toHaveLength(5);
  });
});
