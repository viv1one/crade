import { NextResponse } from "next/server";
import { getOrCreateDeviceId } from "@/lib/identity/device-id";
import { getCollections } from "@/lib/db/collections";
import { applyBuy, applySell, createEmptyPortfolio } from "@/lib/paper-trading/store";
import type { PortfolioState } from "@/lib/paper-trading/types";

async function loadState(ownerId: string): Promise<PortfolioState> {
  const { paperPortfolios } = await getCollections();
  const doc = await paperPortfolios.findOne({ ownerId });
  if (!doc) return createEmptyPortfolio();
  return { cash: doc.cash, holdings: doc.holdings, trades: doc.trades };
}

async function saveState(ownerId: string, state: PortfolioState) {
  const { paperPortfolios } = await getCollections();
  await paperPortfolios.updateOne(
    { ownerId },
    { $set: { ownerId, ...state, updatedAt: new Date() } },
    { upsert: true }
  );
}

export async function GET() {
  const ownerId = await getOrCreateDeviceId();
  return NextResponse.json(await loadState(ownerId));
}

// Server-authoritative: the client sends an intent (action + symbol/qty/price),
// never a pre-computed state, so concurrent trades can't clobber each other's
// cash/holdings math.
export async function POST(request: Request) {
  const ownerId = await getOrCreateDeviceId();
  const body = await request.json();
  const current = await loadState(ownerId);

  try {
    let next: PortfolioState;
    if (body.action === "buy") {
      next = applyBuy(current, body.symbol, body.qty, body.price);
    } else if (body.action === "sell") {
      next = applySell(current, body.symbol, body.qty, body.price);
    } else if (body.action === "reset") {
      next = createEmptyPortfolio();
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    await saveState(ownerId, next);
    return NextResponse.json(next);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Trade failed" },
      { status: 400 }
    );
  }
}
