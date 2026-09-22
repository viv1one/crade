export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Task hint used to pick a provider/model — e.g. cheap/free NIM for batch
// summaries, a paid model for latency-sensitive user-facing chat.
export type ChatTask =
  | "explain_move"
  | "summarize"
  | "chat"
  | "digest"
  | "backtest_review"
  | "portfolio_review"
  | "journal_review"
  // lib/agents/ — quick, per-analyst data-to-text narration (fast tier first)
  | "agent_report"
  // lib/agents/ — debate/trader/risk/fund-manager synthesis (paid tier first)
  | "agent_reasoning";

export interface ChatOptions {
  task: ChatTask;
}

export interface ChatResult {
  content: string;
  provider: string;
  model: string;
}

export interface AiProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
}
