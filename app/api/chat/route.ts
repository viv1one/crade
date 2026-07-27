import { NextResponse } from "next/server";
import { chat } from "@/lib/ai";
import type { ChatMessage, ChatTask } from "@/lib/ai";

const VALID_TASKS: ChatTask[] = ["explain_move", "summarize", "chat", "digest"];

// Small/free-tier models have no idea what app they're running in without
// this — left unset, they free-associate (observed: asked about a stock,
// wandered into unrelated blockchain/crypto talk).
const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "You are the research assistant inside Crade, a personal research tool for Indian equity " +
    "markets (NSE/BSE). Only discuss stocks, indices, and equity market topics relevant to the " +
    "user's question — do not bring up unrelated asset classes (crypto, blockchain, forex, real " +
    "estate, etc.) unless the user explicitly asks about them. You can explain price moves, " +
    "summarize fundamentals, and give general educational information, but do not give " +
    "personalized investment or trading advice — this is for research only, not a substitute for " +
    "a licensed financial advisor.",
};

export async function POST(request: Request) {
  const body = await request.json();
  const messages: ChatMessage[] = body.messages;
  const task: ChatTask = VALID_TASKS.includes(body.task) ? body.task : "chat";

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  try {
    const result = await chat([SYSTEM_PROMPT, ...messages], { task });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat request failed" },
      { status: 502 }
    );
  }
}
