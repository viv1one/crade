import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { marketData } from "@/lib/market-data";
import { runPairsBacktest } from "@/lib/backtest/pairs-engine";
import { DEFAULT_STARTING_CASH } from "@/lib/backtest/types";
import type { PairsBacktestConfig, PairsParams } from "@/lib/backtest/types";

const DEFAULT_PARAMS: PairsParams = { lookback: 20, entryZ: 2, exitZ: 0.5 };

export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const { pairsBacktests } = await getCollections();
  const runs = await pairsBacktests.find({ ownerId: user.id }).sort({ createdAt: -1 }).limit(50).toArray();
  return NextResponse.json(runs);
}

export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const ownerId = user.id;
  const body = await request.json();
  const { symbolA, symbolB, interval, range, params, startingCash } = body ?? {};

  if (typeof symbolA !== "string" || !symbolA.trim() || typeof symbolB !== "string" || !symbolB.trim()) {
    return NextResponse.json({ error: "symbolA and symbolB are required" }, { status: 400 });
  }
  if (symbolA.trim().toUpperCase() === symbolB.trim().toUpperCase()) {
    return NextResponse.json({ error: "symbolA and symbolB must be different" }, { status: 400 });
  }
  if (typeof interval !== "string" || typeof range !== "string") {
    return NextResponse.json({ error: "interval and range are required" }, { status: 400 });
  }

  const resolvedParams: PairsParams = {
    lookback:
      typeof params?.lookback === "number" && params.lookback >= 2
        ? params.lookback
        : DEFAULT_PARAMS.lookback,
    entryZ:
      typeof params?.entryZ === "number" && params.entryZ > 0 ? params.entryZ : DEFAULT_PARAMS.entryZ,
    exitZ:
      typeof params?.exitZ === "number" && params.exitZ >= 0 ? params.exitZ : DEFAULT_PARAMS.exitZ,
  };

  const config: PairsBacktestConfig = {
    symbolA: symbolA.trim().toUpperCase(),
    symbolB: symbolB.trim().toUpperCase(),
    interval,
    range,
    params: resolvedParams,
    startingCash:
      typeof startingCash === "number" && startingCash > 0 ? startingCash : DEFAULT_STARTING_CASH,
  };

  try {
    const [barsA, barsB] = await Promise.all([
      marketData.getHistorical(config.symbolA, config.interval, config.range),
      marketData.getHistorical(config.symbolB, config.interval, config.range),
    ]);

    const { equityCurve, trades, metrics } = runPairsBacktest(
      config.symbolA,
      config.symbolB,
      barsA,
      barsB,
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
    const { pairsBacktests } = await getCollections();
    await pairsBacktests.insertOne(doc);

    return NextResponse.json(doc);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pairs backtest failed" },
      { status: 400 }
    );
  }
}
