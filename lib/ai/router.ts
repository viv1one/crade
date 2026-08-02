import type { AiProviderConfig, ChatMessage, ChatOptions, ChatResult, ChatTask } from "./types";

// All providers are reached through OpenAI-compatible /chat/completions
// endpoints, so switching one is a base-URL + model-name change. See plan §5.
const providers: Record<string, AiProviderConfig> = {
  nim: {
    name: "nim",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: process.env.NIM_API_KEY ?? "",
    model: process.env.NIM_MODEL ?? "meta/llama-3.1-8b-instruct",
  },
  // Same NIM key, a larger/higher-quality model — NVIDIA's free tier hosts
  // many models behind one key, so this is a same-provider fallback tier
  // rather than a whole new provider entry (no separate API key needed).
  // Kept as an every-chain LAST resort, not preferred: measured directly
  // against NVIDIA's API, meta/llama-3.3-70b-instruct took 55-118s for a
  // one-word reply vs ~0.3s for meta/llama-3.1-8b-instruct (shared free-tier
  // queue contention on the larger model, not an app-side issue) — placing
  // it ahead of the fast model would risk exceeding serverless function
  // timeouts and wreck interactive chat latency for a marginal quality gain.
  "nim-large": {
    name: "nim-large",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: process.env.NIM_API_KEY ?? "",
    model: process.env.NIM_MODEL_LARGE ?? "meta/llama-3.3-70b-instruct",
  },
  anthropic: {
    name: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  },
  openai: {
    name: "openai",
    baseURL: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  },
};

// Cheap/free-first fallback chain per task, mirroring the market-data
// fallback pattern. Batch/latency-tolerant tasks try NIM before paid tiers.
// "nim-large" sits last in every chain — see the note on that provider
// entry above for why it's a safety net, not a preferred choice: with the
// fast "nim" model configured (as it normally is), this basically never
// gets invoked, but it gives one more free option to try before giving up
// entirely if every faster/paid provider failed or is unconfigured.
const chainByTask: Record<ChatTask, string[]> = {
  digest: ["nim", "anthropic", "openai", "nim-large"],
  summarize: ["nim", "anthropic", "openai", "nim-large"],
  explain_move: ["anthropic", "nim", "openai", "nim-large"],
  chat: ["anthropic", "openai", "nim", "nim-large"],
  backtest_review: ["nim", "anthropic", "openai", "nim-large"],
};

async function callProvider(
  config: AiProviderConfig,
  messages: ChatMessage[]
): Promise<ChatResult> {
  const res = await fetch(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages }),
  });
  if (!res.ok) {
    throw new Error(`${config.name} chat failed: ${res.status}`);
  }
  const json = await res.json();
  return {
    content: json.choices?.[0]?.message?.content ?? "",
    provider: config.name,
    model: config.model,
  };
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions
): Promise<ChatResult> {
  const chain = chainByTask[options.task];
  let lastError: unknown;
  for (const providerName of chain) {
    const config = providers[providerName];
    if (!config.apiKey) continue; // skip unconfigured providers
    try {
      return await callProvider(config, messages);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `All AI providers failed or unconfigured for task "${options.task}": ${lastError}`
  );
}
