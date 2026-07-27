import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { chat } from "@/lib/ai";
import type { ChatMessage, ChatTask } from "@/lib/ai";
import { buildMarketContext } from "@/lib/ai/context";

const VALID_TASKS: ChatTask[] = ["explain_move", "summarize", "chat", "digest"];

// Small/free-tier models have no idea what app they're running in without
// this — left unset, they free-associate (observed: asked about a stock,
// wandered into unrelated blockchain/crypto talk).
const SYSTEM_PROMPT =
  "You are the research assistant inside Crade, a personal research tool for Indian equity " +
  "markets (NSE/BSE). Only discuss stocks, indices, and equity market topics relevant to the " +
  "user's question — do not bring up unrelated asset classes (crypto, blockchain, forex, real " +
  "estate, etc.) unless the user explicitly asks about them. When real market data is provided " +
  "below, base your analysis on it and give a direct, specific take (e.g. what the trend and " +
  "range suggest, what would make it more/less attractive) rather than deflecting to generic " +
  "advice to consult someone else. Frame it as analysis of the data, not as a directive — don't " +
  "say things like \"buy N shares now\". If a question needs current news or events you weren't " +
  "given data for, say plainly that you don't have that, instead of guessing. This is a personal " +
  "research tool, not a substitute for a licensed financial advisor.";

export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const messages: ChatMessage[] = body.messages;
  const task: ChatTask = VALID_TASKS.includes(body.task) ? body.task : "chat";
  const symbol: string | undefined = typeof body.symbol === "string" ? body.symbol.trim() : undefined;
  const symbolKey = symbol ? symbol.toUpperCase() : "";

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  const marketContext = symbol ? await buildMarketContext(symbol) : null;
  const systemContent = marketContext
    ? `${SYSTEM_PROMPT}\n\n${marketContext}`
    : SYSTEM_PROMPT;

  try {
    const result = await chat(
      [{ role: "system", content: systemContent }, ...messages],
      { task }
    );

    const { aiSessions } = await getCollections();
    const finalMessages = [...messages, { role: "assistant" as const, content: result.content }];
    await aiSessions.updateOne(
      { userId: new ObjectId(user.id), symbol: symbolKey },
      {
        $set: {
          userId: new ObjectId(user.id),
          symbol: symbolKey,
          messages: finalMessages,
          provider: result.provider,
          model: result.model,
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat request failed" },
      { status: 502 }
    );
  }
}
