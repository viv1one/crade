import { NextResponse } from "next/server";
import { chat } from "@/lib/ai";
import type { ChatMessage, ChatTask } from "@/lib/ai";

const VALID_TASKS: ChatTask[] = ["explain_move", "summarize", "chat", "digest"];

export async function POST(request: Request) {
  const body = await request.json();
  const messages: ChatMessage[] = body.messages;
  const task: ChatTask = VALID_TASKS.includes(body.task) ? body.task : "chat";

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  try {
    const result = await chat(messages, { task });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat request failed" },
      { status: 502 }
    );
  }
}
