import { chat } from "../ai";
import { extractAction } from "./parse-decision";
import type { AnalystReports, FinalDecision, RiskDebateResult, TraderPlan } from "./types";

function planText(symbol: string, reports: AnalystReports, plan: TraderPlan): string {
  return [
    `Symbol: ${symbol}`,
    `Trader's proposed plan: ${plan.action.toUpperCase()}`,
    `Trader's reasoning: ${plan.reasoning}`,
    `\nTechnical Analyst:\n${reports.technical}`,
    `\nFundamentals Analyst:\n${reports.fundamentals}`,
    `\nNews Analyst:\n${reports.news}`,
    `\nSentiment Analyst:\n${reports.sentiment}`,
  ].join("\n");
}

async function riskVoice(role: string, instruction: string, context: string): Promise<string> {
  const result = await chat(
    [{ role: "system", content: `You are the ${role} on the Risk Management team. ${instruction}` }, { role: "user", content: context }],
    { task: "agent_reasoning" }
  );
  return result.content;
}

// Risky/Safe/Neutral each react to the trader's plan once (mirrors the
// paper's three risk perspectives), then a Fund Manager call synthesizes
// everything into the final, directive decision — the one output in this
// pipeline that departs from every other AI surface in Crade by issuing an
// explicit buy/sell/hold call. See lib/disclaimers.ts's
// AGENT_DECISION_NOT_ADVICE, always shown alongside this in the UI.
export async function runRiskDebate(
  symbol: string,
  reports: AnalystReports,
  plan: TraderPlan
): Promise<{ debate: RiskDebateResult; decision: FinalDecision }> {
  const context = planText(symbol, reports, plan);

  const risky = await riskVoice(
    "Risky Analyst",
    "Argue for leaning into the trader's plan (or going further) if the data supports upside, even " +
      "with elevated risk. Ground this only in the data given.",
    context
  );
  const safe = await riskVoice(
    "Safe Analyst",
    "Argue for caution — highlight what could go wrong with the trader's plan and where the data " +
      "supports waiting or a smaller position. Ground this only in the data given.",
    context
  );
  const neutral = await riskVoice(
    "Neutral Analyst",
    "Weigh the Risky and Safe perspectives (given below alongside the original data) and describe a " +
      "balanced middle path.",
    `${context}\n\nRisky Analyst:\n${risky}\n\nSafe Analyst:\n${safe}`
  );

  const fundManager = await chat(
    [
      {
        role: "system",
        content:
          "You are the Fund Manager making the final call. Review the trader's plan and the risk " +
          "team's risky/safe/neutral perspectives below, then decide. The risk team will usually " +
          "disagree with each other — that disagreement is not itself a reason to pick hold; weigh " +
          "which perspective is better supported by the actual data and commit to it. Choose hold " +
          "only when the evidence itself (not just the debate) is genuinely balanced or too thin. " +
          "Confidence should reflect how much the underlying data actually supports the call, not " +
          "how persuasive the arguments sounded — if the data is thin or mixed, say so and use " +
          "'low' confidence rather than projecting certainty. Respond with ONLY valid JSON: " +
          '{"action": "buy" | "sell" | "hold", "confidence": "low" | "medium" | "high", "rationale": ' +
          '"3-5 sentences citing the specific data and debate points behind this decision"}.',
      },
      {
        role: "user",
        content: `${context}\n\nRisky Analyst:\n${risky}\n\nSafe Analyst:\n${safe}\n\nNeutral Analyst:\n${neutral}`,
      },
    ],
    { task: "agent_reasoning" }
  );

  let decision: FinalDecision;
  try {
    const match = fundManager.content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : fundManager.content);
    const action: FinalDecision["action"] =
      parsed.action === "buy" || parsed.action === "sell" || parsed.action === "hold"
        ? parsed.action
        : (extractAction(fundManager.content) ?? "review");
    const confidence =
      parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low";
    const rationale = typeof parsed.rationale === "string" ? parsed.rationale : fundManager.content;
    decision = { action, confidence, rationale };
  } catch {
    // Fund manager didn't return valid JSON at all — try the same
    // deterministic text extraction before giving up. Crucially, this does
    // NOT fall back to the trader's proposed action or a plain "hold": a
    // parse failure surfaces as "review" so it's never mistaken for a real
    // considered decision (see lib/agents/parse-decision.ts / TradeAction).
    decision = {
      action: extractAction(fundManager.content) ?? "review",
      confidence: "low",
      rationale: fundManager.content,
    };
  }

  return { debate: { risky, safe, neutral }, decision };
}
