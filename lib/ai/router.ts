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
const chainByTask: Record<ChatTask, string[]> = {
  digest: ["nim", "anthropic", "openai"],
  summarize: ["nim", "anthropic", "openai"],
  explain_move: ["anthropic", "nim", "openai"],
  chat: ["anthropic", "openai", "nim"],
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
