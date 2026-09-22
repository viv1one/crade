import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { chat } from "@/lib/ai";

// Same anti-prediction discipline as app/api/screener/ai-query/route.ts and
// app/api/holdings/diversify/route.ts's system prompts: describe patterns
// in the real data given, never claim confidence about future returns, and
// never invent an entry that wasn't in the data.
const SYSTEM_PROMPT =
  "You are reviewing a user's personal trade journal — their own logged reasoning for real or " +
  "considered trades, given below as a list of entries (symbol, action, their stated reasoning, " +
  "price if given, and an outcome they later recorded if any). Describe patterns you actually see " +
  "in these entries: recurring reasoning themes, whether stated theses tended to match the outcomes " +
  "recorded, any gaps between what they said and what they did. You cannot predict future returns " +
  "and must never claim a trade will work or that a past pattern will keep working — only describe " +
  "what the entries given actually show. Never reference a symbol or entry not present in the data " +
  "below. Keep it to a few short paragraphs.";

function formatEntriesForPrompt(
  entries: { symbol: string; action: string; reasoning: string; price?: number; outcome?: string }[]
): string {
  return entries
    .map((e, i) => {
      const lines = [
        `${i + 1}. ${e.symbol} — ${e.action}${e.price != null ? ` @ ₹${e.price}` : ""}`,
        `   Reasoning: ${e.reasoning}`,
      ];
      if (e.outcome) lines.push(`   Outcome: ${e.outcome}`);
      return lines.join("\n");
    })
    .join("\n");
}

export async function POST() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { journalEntries } = await getCollections();
  const entries = await journalEntries
    .find({ userId: new ObjectId(user.id) })
    .sort({ _id: -1 })
    .limit(50)
    .toArray();

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "No journal entries yet — add one first" },
      { status: 400 }
    );
  }

  try {
    const result = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: formatEntriesForPrompt(entries) },
      ],
      { task: "journal_review" }
    );
    return NextResponse.json({
      content: result.content,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Journal review failed" },
      { status: 502 }
    );
  }
}
