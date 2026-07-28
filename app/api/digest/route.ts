import { NextResponse } from "next/server";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { chat } from "@/lib/ai";

// Reuses the "digest" ChatTask (already routes NIM-first — see
// lib/ai/router.ts) and the screener's existing cached snapshot, so this
// costs nothing beyond one chat call: no new data fetch, no paid tier.
const SYSTEM_PROMPT =
  "You are writing a short market digest for Crade, an internal research tool, based on today's " +
  "Nifty 50 top gainers and losers given below. Write 2-4 concise sentences summarizing the overall " +
  "picture — e.g. how mixed or one-sided the movement looks, or a sector pattern visible in the data " +
  "itself. Only reference stocks, sectors, and figures given to you below. Do not invent macro " +
  "explanations (interest rates, global events, company news) that aren't supported by this data " +
  "alone — you don't have that information. This is a summary of price movement, not analysis of " +
  "why it happened, and not investment advice.";

const MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1000;

export async function POST() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { screenerSnapshots } = await getCollections();
  const snapshot = await screenerSnapshots.findOne({ universe: "nifty50" });
  if (!snapshot || snapshot.rows.length === 0) {
    return NextResponse.json(
      { error: "No screener data available yet — visit the Screener page first" },
      { status: 400 }
    );
  }
  if (Date.now() - snapshot.fetchedAt.getTime() > MAX_SNAPSHOT_AGE_MS) {
    return NextResponse.json(
      { error: "Screener data is over an hour old — visit the Screener page to refresh it first" },
      { status: 400 }
    );
  }

  const sorted = [...snapshot.rows].sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.slice(0, 5);
  const losers = sorted.slice(-5).reverse();
  const dataText = [
    "Top gainers:",
    ...gainers.map((r) => `${r.symbol} (${r.sector}): +${r.changePercent.toFixed(2)}%`),
    "Top losers:",
    ...losers.map((r) => `${r.symbol} (${r.sector}): ${r.changePercent.toFixed(2)}%`),
  ].join("\n");

  try {
    const result = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Data:\n${dataText}\n\nWrite the digest.` },
      ],
      { task: "digest" }
    );
    return NextResponse.json({ ...result, fetchedAt: snapshot.fetchedAt });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Digest failed" },
      { status: 502 }
    );
  }
}
