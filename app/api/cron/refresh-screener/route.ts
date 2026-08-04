import { NextResponse } from "next/server";
import { getCollections } from "@/lib/db/collections";
import { fetchScreenerData } from "@/lib/screener/fetch";
import { ALL_NSE_UNIVERSE } from "@/lib/screener/universe";
import type { ScreenerRow } from "@/lib/screener/types";

// Best-effort hint to hosts that respect it (e.g. Vercel) — harmless
// elsewhere. Kept deliberately short: each invocation only ever fetches a
// small slice (see DEFAULT_LIMIT below), so it shouldn't need anywhere
// close to this.
export const maxDuration = 30;

const UNIVERSE_KEY = "all_nse";
const DEFAULT_LIMIT = 50;

// Refreshes the ~2,000-symbol all_nse screener snapshot in small batches
// instead of one giant fetch — see CLAUDE.md's lib/screener/ section for
// why: a single request covering the whole universe would run well past
// any reasonable serverless timeout and burst-load the free provider in
// one continuous run. .github/workflows/refresh-screener.yml calls this
// with a sequence of offsets once an hour, covering the full universe over
// many short requests instead. Each call merges its slice's rows into the
// existing snapshot by symbol (leaving every other symbol's row
// untouched) rather than replacing the whole document, so the cached table
// is a mix of freshnesses — never empty after the first cycle completes,
// and reads (app/api/screener/route.ts) don't need to know a refresh is
// still in progress.
export async function GET(request: Request) {
  // Same fail-closed pattern as app/api/cron/evaluate-alerts/route.ts: an
  // unset CRON_SECRET must not fall through to "no auth check at all."
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 401 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const limit = Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT);

  const slice = ALL_NSE_UNIVERSE.slice(offset, offset + limit);
  if (slice.length === 0) {
    return NextResponse.json({
      offset,
      limit,
      fetched: 0,
      totalUniverse: ALL_NSE_UNIVERSE.length,
      done: true,
    });
  }

  const freshRows = await fetchScreenerData(slice);

  const { screenerSnapshots } = await getCollections();
  const existing = await screenerSnapshots.findOne({ universe: UNIVERSE_KEY });
  const bySymbol = new Map<string, ScreenerRow>((existing?.rows ?? []).map((r) => [r.symbol, r]));
  for (const row of freshRows) bySymbol.set(row.symbol, row);

  await screenerSnapshots.updateOne(
    { universe: UNIVERSE_KEY },
    { $set: { universe: UNIVERSE_KEY, rows: Array.from(bySymbol.values()), fetchedAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({
    offset,
    limit,
    fetched: freshRows.length,
    totalUniverse: ALL_NSE_UNIVERSE.length,
    done: offset + limit >= ALL_NSE_UNIVERSE.length,
  });
}
