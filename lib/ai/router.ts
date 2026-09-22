import type { AiProviderConfig, ChatMessage, ChatOptions, ChatResult, ChatTask } from "./types";

// All providers are reached through OpenAI-compatible /chat/completions
// endpoints, so switching one is a base-URL + model-name change. See plan §5.
const providers: Record<string, AiProviderConfig> = {
  // Defaults updated 2026-09-22: the previous defaults (meta/llama-3.1-8b-
  // instruct and meta/llama-3.3-70b-instruct) both hit end-of-life on
  // NVIDIA's side on 2026-08-26 and now return 410 Gone — confirmed live
  // against the API, not assumed. Re-verified this account's actual model
  // access the same way (NIM's /v1/models catalog lists many models this
  // key isn't entitled to invoke — a 404 "Not found for account", distinct
  // from a 410 "Gone" retirement — so availability has to be confirmed by
  // invoking each candidate, not just reading the catalog).
  nim: {
    name: "nim",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: process.env.NIM_API_KEY ?? "",
    // ~1-2s for a real narration-sized prompt in this account, confirmed live.
    // Reasoning-style model: NVIDIA's API returns its chain-of-thought in a
    // separate `reasoning_content` field and the clean final answer in
    // `content` — callProvider() below already only reads `content`, so no
    // code change was needed for that, just a working model id.
    model: process.env.NIM_MODEL ?? "nvidia/nemotron-3-super-120b-a12b",
  },
  // Same NIM key, a larger/higher-quality model — NVIDIA's free tier hosts
  // many models behind one key, so this is a same-provider fallback tier
  // rather than a whole new provider entry (no separate API key needed).
  // Kept as an every-chain LAST resort, not preferred: measured directly
  // against NVIDIA's API, nvidia/nemotron-3-ultra-550b-a55b took ~12s for a
  // real prompt vs ~1-2s for the "nim" model above (larger MoE, more active
  // params) — still slow enough that placing it ahead of the fast model
  // would risk exceeding serverless function timeouts for a marginal
  // quality gain, but nowhere near as bad as the 55-118s the previous
  // large-tier model measured at before its own retirement.
  "nim-large": {
    name: "nim-large",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: process.env.NIM_API_KEY ?? "",
    model: process.env.NIM_MODEL_LARGE ?? "nvidia/nemotron-3-ultra-550b-a55b",
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
  portfolio_review: ["nim", "anthropic", "openai", "nim-large"],
  // Mirrors the paper's §4.3 split: quick-thinking models narrate fetched
  // data (agent_report), deep-thinking models handle debate/decisions
  // (agent_reasoning) — see lib/agents/.
  agent_report: ["nim", "anthropic", "openai", "nim-large"],
  agent_reasoning: ["anthropic", "openai", "nim", "nim-large"],
};

// Retries only on 429/503 — a transient capacity signal, not a real error —
// same reasoning as lib/market-data/fetch-with-retry.ts, but implemented
// separately here rather than reusing that helper: it's scoped to market-
// data providers and deliberately retries 429 only, whereas NVIDIA's NIM
// endpoint was confirmed live (repeated identical calls under real debate-
// sized prompts) to return 503 "Service temporarily overloaded" as its own
// transient-capacity signal on its free/shared tier — roughly 2 of every 3
// calls during a burst in testing. Before this, callProvider() had no retry
// at all, so any transient 503 immediately fell through to the next
// provider in the chain (often also NIM-hosted and hitting the same
// capacity limit) rather than just trying again.
async function fetchWithBackoff(url: string, init: RequestInit, retries = 2, baseDelayMs = 500): Promise<Response> {
  let lastRes: Response | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 503) return res;
    lastRes = res;
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  return lastRes!;
}

async function callProvider(
  config: AiProviderConfig,
  messages: ChatMessage[]
): Promise<ChatResult> {
  const res = await fetchWithBackoff(`${config.baseURL}/chat/completions`, {
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
