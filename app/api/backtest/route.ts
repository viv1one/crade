import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { marketData } from "@/lib/market-data";
import { runBacktest } from "@/lib/backtest/engine";
import { STRATEGIES } from "@/lib/backtest/strategies";
import { DEFAULT_STARTING_CASH } from "@/lib/backtest/types";
import type { BacktestConfig, StrategyId, StrategyParams } from "@/lib/backtest/types";

export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const { backtests } = await getCollections();
  const runs = await backtests.find({ ownerId: user.id }).sort({ createdAt: -1 }).limit(50).toArray();
  return NextResponse.json(runs);
}

export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const ownerId = user.id;
  const body = await request.json();
  const { symbol, interval, range, strategyId, params, startingCash } = body ?? {};

  if (typeof symbol !== "string" || !symbol.trim()) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }
  if (typeof interval !== "string" || typeof range !== "string") {
    return NextResponse.json({ error: "interval and range are required" }, { status: 400 });
  }
  const strategy = STRATEGIES[strategyId as StrategyId];
  if (!strategy) {
    return NextResponse.json({ error: "Unknown strategy" }, { status: 400 });
  }

  // Fill in any missing/invalid param with the strategy's default rather
  // than letting NaN flow into the indicator math.
  const resolvedParams: StrategyParams = {};
  for (const spec of strategy.paramSchema) {
    const value = params?.[spec.key];
    resolvedParams[spec.key] = typeof value === "number" && Number.isFinite(value) ? value : spec.default;
  }

  const config: BacktestConfig = {
    symbol: symbol.trim(),
    interval,
    range,
    strategyId: strategy.id,
    params: resolvedParams,
    startingCash:
      typeof startingCash === "number" && startingCash > 0 ? startingCash : DEFAULT_STARTING_CASH,
  };

  try {
    const bars = await marketData.getHistorical(config.symbol, config.interval, config.range);
    const { equityCurve, trades, metrics } = runBacktest(
      config.symbol,
      bars,
      config.strategyId,
      config.params,
      config.startingCash
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
    const { backtests } = await getCollections();
    await backtests.insertOne(doc);

    return NextResponse.json(doc);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backtest failed" },
      { status: 400 }
    );
  }
}
