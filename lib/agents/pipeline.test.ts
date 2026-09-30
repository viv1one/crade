import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentPipelineResult } from "./types";

const calls: string[] = [];
const reportsFixture = { technical: "T", fundamentals: "F", news: "N", sentiment: "S" };
const debateFixture = { bullCase: "b", bearCase: "r", prevailing: "bull" as const, summary: "s" };
const planFixture = { action: "buy" as const, reasoning: "because" };
const riskFixture = { risky: "a", safe: "b", neutral: "c" };
const decisionFixture = { action: "buy" as const, confidence: "low" as const, rationale: "ok" };

vi.mock("../market-data", () => ({
  marketData: {
    getQuote: async () => {
      calls.push("fetch");
      return { symbol: "X", price: 1 };
    },
    getHistorical: async () => [],
    getFundamentals: async () => ({ symbol: "X" }),
  },
}));
vi.mock("../news", () => ({ getNews: async () => [] }));
vi.mock("../sentiment", () => ({ getSentiment: async () => ({ postCount: 0, avgScore: 0, topPosts: [], confidence: "low" }) }));
vi.mock("../insider", () => ({ getInsiderActivity: async () => null }));
vi.mock("./analysts", () => ({
  runTechnicalAnalyst: async () => (calls.push("technical"), "T"),
  runFundamentalsAnalyst: async () => (calls.push("fundamentals"), "F"),
  runNewsAnalyst: async () => (calls.push("news"), "N"),
  runSentimentAnalyst: async () => (calls.push("sentiment"), "S"),
}));
vi.mock("./research-debate", () => ({ runResearchDebate: async () => (calls.push("debate"), debateFixture) }));
vi.mock("./trader", () => ({ runTrader: async () => (calls.push("trader"), planFixture) }));
vi.mock("./risk-debate", () => ({
  runRiskDebate: async () => (calls.push("risk"), { debate: riskFixture, decision: decisionFixture }),
}));

beforeEach(() => {
  calls.length = 0;
});

describe("runTradingAgentsPipeline resume", () => {
  it("runs every stage from scratch when there is nothing to resume from", async () => {
    const { runTradingAgentsPipeline } = await import("./pipeline");
    const stages: string[] = [];
    const result = await runTradingAgentsPipeline("X", (p) => void stages.push(Object.keys(p).join("+")));
    expect(calls).toEqual(["fetch", "technical", "fundamentals", "news", "sentiment", "debate", "trader", "risk"]);
    expect(stages).toEqual(["reports", "debate", "traderPlan", "riskDebate+finalDecision"]);
    expect(result.finalDecision).toEqual(decisionFixture);
  });

  it("skips stages already saved, and doesn't even fetch market data when the reports exist", async () => {
    const { runTradingAgentsPipeline } = await import("./pipeline");
    const done: Partial<AgentPipelineResult> = { reports: reportsFixture, debate: debateFixture };
    const result = await runTradingAgentsPipeline("X", undefined, { result: done });
    expect(calls).toEqual(["trader", "risk"]);
    expect(result.reports).toEqual(reportsFixture);
    expect(result.debate).toEqual(debateFixture);
    expect(result.traderPlan).toEqual(planFixture);
  });

  it("re-runs the risk stage if only half of it was saved", async () => {
    const { runTradingAgentsPipeline } = await import("./pipeline");
    const done: Partial<AgentPipelineResult> = {
      reports: reportsFixture,
      debate: debateFixture,
      traderPlan: planFixture,
      riskDebate: riskFixture, // finalDecision missing
    };
    await runTradingAgentsPipeline("X", undefined, { result: done });
    expect(calls).toEqual(["risk"]);
  });

  it("does nothing new for a fully saved run and returns it", async () => {
    const { runTradingAgentsPipeline } = await import("./pipeline");
    const done: Partial<AgentPipelineResult> = {
      reports: reportsFixture,
      debate: debateFixture,
      traderPlan: planFixture,
      riskDebate: riskFixture,
      finalDecision: decisionFixture,
    };
    const result = await runTradingAgentsPipeline("X", undefined, { result: done });
    expect(calls).toEqual([]);
    expect(result.finalDecision).toEqual(decisionFixture);
  });
});
