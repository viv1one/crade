import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { marketData } from "@/lib/market-data";
import { runPortfolioBacktest } from "@/lib/backtest/portfolio-engine";
import { STRATEGIES } from "@/lib/backtest/strategies";
import { DEFAULT_STARTING_CASH } from "@/lib/backtest/types";
import type { HistoricalBar } from "@/lib/market-data";
import type { PortfolioBacktestConfig, StrategyId, StrategyParams } from "@/lib/backtest/types";
import { toErrorResponse } from "@/lib/api-error";

export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const { portfolioBacktests } = await getCollections();
  const runs = await portfolioBacktests
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
  const { symbols, interval, range, strategyId, params, startingCash } = body ?? {};

  if (!Array.isArray(symbols) || symbols.length === 0 || !symbols.every((s) => typeof s === "string")) {
    return NextResponse.json({ error: "symbols must be a non-empty array of strings" }, { status: 400 });
  }
  if (symbols.length > 10) {
    return NextResponse.json({ error: "Maximum 10 symbols per portfolio backtest" }, { status: 400 });
  }
  if (typeof interval !== "string" || typeof range !== "string") {
    return NextResponse.json({ error: "interval and range are required" }, { status: 400 });
  }
  const strategy = STRATEGIES[strategyId as StrategyId];
  if (!strategy) {
    return NextResponse.json({ error: "Unknown strategy" }, { status: 400 });
  }

  const resolvedParams: StrategyParams = {};
  for (const spec of strategy.paramSchema) {
    const value = params?.[spec.key];
    resolvedParams[spec.key] = typeof value === "number" && Number.isFinite(value) ? value : spec.default;
  }

  const config: PortfolioBacktestConfig = {
    symbols: symbols.map((s: string) => s.trim().toUpperCase()).filter(Boolean),
    interval,
    range,
    strategyId: strategy.id,
    params: resolvedParams,
    startingCash:
      typeof startingCash === "number" && startingCash > 0 ? startingCash : DEFAULT_STARTING_CASH,
  };

  try {
    const barsBySymbol: Record<string, HistoricalBar[]> = {};
    for (const symbol of config.symbols) {
      barsBySymbol[symbol] = await marketData.getHistorical(symbol, config.interval, config.range);
    }

    const { equityCurve, trades, metrics, bySymbol } = runPortfolioBacktest(
      config.symbols,
      barsBySymbol,
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
      bySymbol,
      createdAt: new Date(),
    };
    const { portfolioBacktests } = await getCollections();
    await portfolioBacktests.insertOne(doc);

    return NextResponse.json(doc);
  } catch (err) {
    return toErrorResponse(err, "Portfolio backtest failed — check the symbols are correct and try again", 400);
  }
}
