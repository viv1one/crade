import { NextResponse } from "next/server";
import { getCollections } from "@/lib/db/collections";
import { fetchScreenerData } from "@/lib/screener/fetch";
import { NIFTY_50 } from "@/lib/screener/universe";
import { withProgress } from "@/lib/progress/server";
import type { ProgressReporter } from "@/lib/progress/types";

const NIFTY50_UNIVERSE = "nifty50";
const ALL_NSE_UNIVERSE_KEY = "all_nse";
const TTL_MS = 10 * 60 * 1000;

async function handle(request: Request, report: ProgressReporter) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";
  const universe = searchParams.get("universe") === "all_nse" ? ALL_NSE_UNIVERSE_KEY : NIFTY50_UNIVERSE;

  const { screenerSnapshots } = await getCollections();

  // The all_nse universe (~2,000 symbols) is never fetched synchronously
  // inside a request — that would run well past any reasonable timeout and
  // hammer the free provider in one burst. Only
  // app/api/cron/refresh-screener/route.ts (a scheduled background job,
  // batched in small slices) ever writes to this snapshot; a request here
  // just reads whatever's cached, however fresh or stale that happens to
  // be, and ignores ?refresh — there's nothing safe to trigger on demand.
  if (universe === ALL_NSE_UNIVERSE_KEY) {
    const cached = await screenerSnapshots.findOne({ universe });
    return NextResponse.json({ rows: cached?.rows ?? [], fetchedAt: cached?.fetchedAt ?? null });
  }

  if (!forceRefresh) {
    const cached = await screenerSnapshots.findOne({ universe });
    if (cached && Date.now() - cached.fetchedAt.getTime() < TTL_MS) {
      return NextResponse.json({ rows: cached.rows, fetchedAt: cached.fetchedAt });
    }
  }

  report({ text: "Refreshing Nifty 50 data…" });
  const rows = await fetchScreenerData(NIFTY_50, report);
  const fetchedAt = new Date();
  await screenerSnapshots.updateOne(
    { universe },
    { $set: { universe, rows, fetchedAt } },
    { upsert: true }
  );

  return NextResponse.json({ rows, fetchedAt });
}

export function GET(request: Request) {
  return withProgress(request, (report) => handle(request, report));
}
