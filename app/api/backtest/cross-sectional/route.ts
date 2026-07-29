import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { marketData } from "@/lib/market-data";
import { runCrossSectionalBacktest } from "@/lib/backtest/cross-sectional-engine";
import { getScoreFn } from "@/lib/backtest/cross-sectional-strategies";
import { STRATEGIES } from "@/lib/backtest/strategies";
import { DEFAULT_STARTING_CASH } from "@/lib/backtest/types";
import { NIFTY_50 } from "@/lib/screener/universe";
import type { Fundamentals, HistoricalBar } from "@/lib/market-data";
import type { CrossSectionalBacktestConfig, StrategyId, StrategyParams } from "@/lib/backtest/types";

const CONCURRENCY = 5;

export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const { crossSectionalBacktests } = await getCollections();
  const runs = await crossSectionalBacktests
    .find({ ownerId: user.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  return NextResponse.json(runs);
}

export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const ownerId = user.id;
  const body = await request.json();
  const { strategyId, interval, range, params, startingCash } = body ?? {};

  if (typeof interval !== "string" || typeof range !== "string") {
    return NextResponse.json({ error: "interval and range are required" }, { status: 400 });
  }
  const strategy = STRATEGIES[strategyId as StrategyId];
  if (!strategy || strategy.kind !== "cross_sectional") {
    return NextResponse.json({ error: "Unknown cross-sectional strategy" }, { status: 400 });
  }

  const resolvedParams: StrategyParams = {};
  for (const spec of strategy.paramSchema) {
    const value = params?.[spec.key];
    resolvedParams[spec.key] = typeof value === "number" && Number.isFinite(value) ? value : spec.default;
  }

  const config: CrossSectionalBacktestConfig = {
    strategyId: strategy.id,
    interval,
    range,
    params: resolvedParams,
    startingCash:
      typeof startingCash === "number" && startingCash > 0 ? startingCash : DEFAULT_STARTING_CASH,
  };

  try {
    // Small worker-pool fetch across the whole NIFTY_50 universe, same
    // pattern as lib/screener/fetch.ts — 50 simultaneous requests against
    // a free, keyless API is a good way to get rate-limited mid-run. A
    // symbol whose historical fetch fails just gets an empty bars array
    // (excluded from ranking by the engine, not a fatal error for the
    // whole run) — fundamentals are only fetched at all when the
    // strategy declares it needs them.
    const barsBySymbol: Record<string, HistoricalBar[]> = {};
    const fundamentalsBySymbol: Record<string, Fundamentals | undefined> = {};
    const queue = [...NIFTY_50];

    async function worker() {
      while (queue.length > 0) {
        const stock = queue.shift();
        if (!stock) break;
        try {
          barsBySymbol[stock.symbol] = await marketData.getHistorical(
            stock.symbol,
            config.interval,
            config.range
          );
        } catch {
          barsBySymbol[stock.symbol] = [];
        }
        if (strategy.needsFundamentals) {
          try {
            fundamentalsBySymbol[stock.symbol] = await marketData.getFundamentals(stock.symbol);
          } catch {
            fundamentalsBySymbol[stock.symbol] = undefined;
          }
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const scoreFn = getScoreFn(config.strategyId);
    const { equityCurve, trades, metrics } = runCrossSectionalBacktest(
      NIFTY_50,
      barsBySymbol,
      fundamentalsBySymbol,
      config.params,
      config.startingCash,
      scoreFn,
      strategy.rebalanceFrequency ?? "monthly"
    );

    const doc = {
      _id: new ObjectId(),
      ownerId,
      config,
      equityCurve,
      trades,
      metrics,
      createdAt: new Date(),
    };
    const { crossSectionalBacktests } = await getCollections();
    await crossSectionalBacktests.insertOne(doc);

    return NextResponse.json(doc);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cross-sectional backtest failed" },
      { status: 400 }
    );
  }
}
