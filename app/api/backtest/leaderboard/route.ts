import { NextResponse } from "next/server";
import { getCollections } from "@/lib/db/collections";
import { marketData } from "@/lib/market-data";
import { computeLeaderboard } from "@/lib/backtest/leaderboard";
import { STRATEGIES } from "@/lib/backtest/strategies";
import { DEFAULT_STARTING_CASH } from "@/lib/backtest/types";
import { NIFTY_50 } from "@/lib/screener/universe";
import type { Fundamentals, HistoricalBar } from "@/lib/market-data";
import { toErrorResponse } from "@/lib/api-error";
import { makeCounter, withProgress } from "@/lib/progress/server";
import type { ProgressReporter } from "@/lib/progress/types";

const CONCURRENCY = 5;
const TTL_MS = 30 * 60 * 1000;

const CROSS_SECTIONAL_STRATEGIES = Object.values(STRATEGIES).filter(
  (s) => s.kind === "cross_sectional"
);
const NEEDS_FUNDAMENTALS = CROSS_SECTIONAL_STRATEGIES.some((s) => s.needsFundamentals);

// Public, no auth — same reasoning as app/api/screener/route.ts: this is a
// cached, shared, market-derived dataset, not per-user state.
async function handle(request: Request, report: ProgressReporter) {
  const { searchParams } = new URL(request.url);
  const interval = searchParams.get("interval") ?? "1d";
  const range = searchParams.get("range") ?? "1y";
  const forceRefresh = searchParams.get("refresh") === "true";
  const key = `${interval}:${range}`;

  const { strategyLeaderboards } = await getCollections();

  if (!forceRefresh) {
    const cached = await strategyLeaderboards.findOne({ key });
    if (cached && Date.now() - cached.fetchedAt.getTime() < TTL_MS) {
      return NextResponse.json({ entries: cached.entries, fetchedAt: cached.fetchedAt });
    }
  }

  try {
    // Fetched once and shared across every strategy in the loop below —
    // same concurrency-5 worker pool as lib/screener/fetch.ts and
    // app/api/backtest/cross-sectional/route.ts. Fundamentals are only
    // fetched at all if some registered strategy actually needs them.
    const barsBySymbol: Record<string, HistoricalBar[]> = {};
    const fundamentalsBySymbol: Record<string, Fundamentals | undefined> = {};
    const queue = [...NIFTY_50];
    const tick = makeCounter(NIFTY_50.length, "Fetched price history", report);

    async function worker() {
      while (queue.length > 0) {
        const stock = queue.shift();
        if (!stock) break;
        try {
          barsBySymbol[stock.symbol] = await marketData.getHistorical(stock.symbol, interval, range);
        } catch {
          barsBySymbol[stock.symbol] = [];
        }
        if (NEEDS_FUNDAMENTALS) {
          try {
            fundamentalsBySymbol[stock.symbol] = await marketData.getFundamentals(stock.symbol);
          } catch {
            fundamentalsBySymbol[stock.symbol] = undefined;
          }
        }
        tick();
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    report({ text: `Backtesting ${CROSS_SECTIONAL_STRATEGIES.length} strategies…` });

    const entries = computeLeaderboard(
      NIFTY_50,
      barsBySymbol,
      fundamentalsBySymbol,
      CROSS_SECTIONAL_STRATEGIES,
      DEFAULT_STARTING_CASH
    );

    const fetchedAt = new Date();
    await strategyLeaderboards.updateOne(
      { key },
      { $set: { key, entries, fetchedAt } },
      { upsert: true }
    );

    return NextResponse.json({ entries, fetchedAt });
  } catch (err) {
    return toErrorResponse(err, "Strategy leaderboard failed — try again in a moment", 400);
  }
}

export function GET(request: Request) {
  return withProgress(request, (report) => handle(request, report));
}
