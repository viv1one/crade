import { chat, AiDeadlineError } from "../ai";
import type { ChatMessage, ChatOptions, ChatResult } from "../ai";

// A finished AI call, stored so a run that gets cut off (host time limit,
// crashed function) can pick up at the next call instead of redoing — and
// losing — everything since the last whole-stage save. The debate stages are
// 3–4 sequential calls each, which on a slow provider can outlast a
// serverless invocation on their own.
export interface StoredChat {
  content: string;
  provider: string;
  model: string;
}

export interface Checkpoints {
  get(key: string): StoredChat | undefined;
  save(key: string, value: StoredChat): Promise<void> | void;
  // Extra chat() options for this step's call — the caller's invocation
  // deadline, and a rotated starting provider on a retry.
  callOptions?(key: string): Partial<ChatOptions> & { concise?: boolean };
  // Awaited just before the AI call starts, so the caller can record what is
  // in flight (a slice killed mid-call is recognisable afterwards).
  began?(key: string): Promise<void> | void;
}

// Appended to the system prompt on a retry after a timeout: a shorter answer
// is the one lever that makes a slow call finish faster without cutting the
// model off mid-thought.
const CONCISE_SUFFIX =
  " Keep your answer concise — under about 200 words — so it can be produced quickly.";

function makeConcise(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m, i) => (m.role === "system" && i === messages.findIndex((x) => x.role === "system") ? { ...m, content: m.content + CONCISE_SUFFIX } : m));
}

// chat() with a memo: returns the stored result for `key` if there is one,
// otherwise makes the call and stores it. With no `checkpoints` it is just chat().
export async function checkpointedChat(
  checkpoints: Checkpoints | undefined,
  key: string,
  messages: ChatMessage[],
  options: ChatOptions
): Promise<ChatResult> {
  const hit = checkpoints?.get(key);
  if (hit) return hit;
  let result: ChatResult;
  try {
    const { concise, ...callOptions } = checkpoints?.callOptions?.(key) ?? {};
    await checkpoints?.began?.(key);
    result = await chat(concise ? makeConcise(messages) : messages, { ...options, ...callOptions });
  } catch (err) {
    // Out of time for this call: name the step so the caller can retry it in
    // a fresh invocation (and give up if the same step keeps timing out).
    if (err instanceof AiDeadlineError) throw new StepDeadlineError(key);
    throw err;
  }
  await checkpoints?.save(key, { content: result.content, provider: result.provider, model: result.model });
  return result;
}

// Thrown by a caller's save hook to end this invocation cleanly once its time
// budget is spent; everything up to that point is already stored, and the run
// continues from there in the next invocation. Not an error.
export class YieldForContinuation extends Error {
  constructor() {
    super("yield for continuation");
    this.name = "YieldForContinuation";
  }
}

// A step's AI call ran out of time in this invocation. Retry it in the next
// one (on another provider); not a failure until it keeps happening.
export class StepDeadlineError extends Error {
  constructor(public readonly key: string) {
    super(`AI call "${key}" did not finish in time`);
    this.name = "StepDeadlineError";
  }
}
