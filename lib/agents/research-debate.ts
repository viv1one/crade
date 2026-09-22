import { chat } from "../ai";
import type { AnalystReports, DebateResult } from "./types";

function reportsText(symbol: string, reports: AnalystReports): string {
  return [
    `Analyst reports for ${symbol}:`,
    `\nTechnical Analyst:\n${reports.technical}`,
    `\nFundamentals Analyst:\n${reports.fundamentals}`,
    `\nNews Analyst:\n${reports.news}`,
    `\nSentiment Analyst:\n${reports.sentiment}`,
  ].join("\n");
}

// One bull message, one bear message, then a facilitator picks the
// prevailing case — a single round rather than the paper's configurable
// n rounds (deliberate v1 simplification, see the approved plan). Task
// "agent_reasoning" (deep-thinking tier first, mirrors the paper's §4.3
// split for reasoning-heavy work).
export async function runResearchDebate(symbol: string, reports: AnalystReports): Promise<DebateResult> {
  const context = reportsText(symbol, reports);

  const bull = await chat(
    [
      {
        role: "system",
        content:
          "You are the Bullish Researcher on a stock-research team. Given the analyst reports below, " +
          "build the strongest honest case FOR this stock, grounded only in what the reports say — " +
          "don't invent facts. Acknowledge real risks the reports raise rather than ignoring them.",
      },
      { role: "user", content: context },
    ],
    { task: "agent_reasoning" }
  );

  const bear = await chat(
    [
      {
        role: "system",
        content:
          "You are the Bearish Researcher on a stock-research team. Given the analyst reports below " +
          "and the Bullish Researcher's case, build the strongest honest case AGAINST this stock, " +
          "grounded only in what the reports say — don't invent facts. Directly rebut the bull case " +
          "where you disagree.",
      },
      { role: "user", content: `${context}\n\nBullish Researcher's case:\n${bull.content}` },
    ],
    { task: "agent_reasoning" }
  );

  const facilitator = await chat(
    [
      {
        role: "system",
        content:
          "You are the debate facilitator. Read the bull and bear cases below and decide which one is " +
          "better supported by the analyst data (not which is more persuasively written). Respond with " +
          'ONLY valid JSON: {"prevailing": "bull" or "bear", "summary": "2-3 sentence summary of why"}.',
      },
      { role: "user", content: `Bull case:\n${bull.content}\n\nBear case:\n${bear.content}` },
    ],
    { task: "agent_reasoning" }
  );

  let prevailing: "bull" | "bear" = "bull";
  let summary = facilitator.content;
  let parsedOk = false;
  try {
    const match = facilitator.content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : facilitator.content);
    if (parsed.prevailing === "bull" || parsed.prevailing === "bear") {
      prevailing = parsed.prevailing;
      parsedOk = true;
    }
    if (typeof parsed.summary === "string") summary = parsed.summary;
  } catch {
    // Fall through — parsedOk stays false.
  }
  if (!parsedOk) {
    // Unlike the Trader/Fund Manager decisions (see parse-decision.ts),
    // this only feeds forward as context for the next stage rather than
    // being a persisted final call, so a "review" state isn't warranted —
    // but the default is still made visible rather than silently presented
    // as a real facilitator verdict.
    summary = `[Facilitator response could not be parsed — defaulting to "bull" as a fallback, not a genuine verdict] ${summary}`;
  }

  return { bullCase: bull.content, bearCase: bear.content, prevailing, summary };
}
