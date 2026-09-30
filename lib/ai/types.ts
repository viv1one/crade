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
  // Optional live progress hook: told which provider is being tried and
  // when one fails over to the next. Never affects the result.
  onProgress?: (update: { text: string }) => void;
  // Epoch ms by which the whole call must be over. Each provider attempt is
  // aborted rather than left to hang past it, and chat() throws
  // AiDeadlineError instead of blocking a serverless invocation until the
  // host kills it. Used by resumable work (lib/agents/) that can finish the
  // call in the next invocation.
  deadline?: number;
  // Start the provider chain this many configured providers along (wrapping),
  // so a retry after a timeout tries a different provider first.
  startAt?: number;
}

// The deadline passed (or an attempt timed out with no time left for another).
// Not a failure of the request itself — retrying in a fresh invocation is
// expected to work.
export class AiDeadlineError extends Error {
  constructor(message = "AI call did not finish before its deadline") {
    super(message);
    this.name = "AiDeadlineError";
  }
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
