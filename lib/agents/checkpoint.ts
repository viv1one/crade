import { chat } from "../ai";
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
  const result = await chat(messages, options);
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
