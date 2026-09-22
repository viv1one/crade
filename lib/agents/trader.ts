import { chat } from "../ai";
import { coerceOptionalPrice, extractAction } from "./parse-decision";
import type { AnalystReports, DebateResult, TraderPlan } from "./types";

export async function runTrader(
  symbol: string,
  reports: AnalystReports,
  debate: DebateResult
): Promise<TraderPlan> {
  const context = [
    `Symbol: ${symbol}`,
    `\nTechnical Analyst:\n${reports.technical}`,
    `\nFundamentals Analyst:\n${reports.fundamentals}`,
    `\nNews Analyst:\n${reports.news}`,
    `\nSentiment Analyst:\n${reports.sentiment}`,
    `\nResearch debate — prevailing view: ${debate.prevailing}\nSummary: ${debate.summary}`,
    `\nBull case:\n${debate.bullCase}`,
    `\nBear case:\n${debate.bearCase}`,
  ].join("\n");

  const result = await chat(
    [
      {
        role: "system",
        content:
          "You are the Trader on a stock-research team, synthesizing the analyst reports and the " +
          "researcher debate below into an initial trading plan. This has not yet been reviewed by " +
          "risk management. The debate will usually contain conflicting arguments — deciding which " +
          "side is stronger is your job, so conflict alone is not a reason to pick hold. Commit to " +
          "the side with the stronger case; choose hold only when the evidence is genuinely balanced " +
          "or too thin to support a call, not just because arguments exist on both sides. Respond " +
          "with ONLY valid JSON: " +
          '{"action": "buy" | "sell" | "hold", "reasoning": "2-4 sentences citing the specific data ' +
          'that led to this plan", "entryPrice": number or omit, "stopLoss": number or omit}. State ' +
          "entryPrice/stopLoss as absolute rupee price levels grounded in the technical report's " +
          "price/support/resistance data (e.g. 1234.5), never a percentage or a range — omit the " +
          "field entirely if you can't state a concrete number.",
      },
      { role: "user", content: context },
    ],
    { task: "agent_reasoning" }
  );

  try {
    const match = result.content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : result.content);
    const action: TraderPlan["action"] =
      parsed.action === "buy" || parsed.action === "sell" || parsed.action === "hold"
        ? parsed.action
        : (extractAction(result.content) ?? "review");
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : result.content;
    return {
      action,
      reasoning,
      entryPrice: coerceOptionalPrice(parsed.entryPrice),
      stopLoss: coerceOptionalPrice(parsed.stopLoss),
    };
  } catch {
    // Model didn't return valid JSON at all — fall back to the same
    // deterministic text extraction rather than silently coercing an
    // unparseable plan into "hold" (see parse-decision.ts).
    return { action: extractAction(result.content) ?? "review", reasoning: result.content };
  }
}
