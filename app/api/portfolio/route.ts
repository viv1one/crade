import { NextResponse } from "next/server";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { applyBuy, applySell, createEmptyPortfolio } from "@/lib/paper-trading/store";
import type { PortfolioState } from "@/lib/paper-trading/types";
import type { EquityPoint } from "@/lib/backtest/types";
import { marketData } from "@/lib/market-data";
import { AppError, toErrorResponse } from "@/lib/api-error";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// Marks every current holding to its live quote to get one total-value
// number for the equity curve — degrades to avgCost on a failed fetch, the
// same fallback app/portfolio.tsx's own client-side display already uses,
// rather than failing the whole trade over one stale/unreachable symbol.
async function markToMarket(state: PortfolioState): Promise<number> {
  const symbols = Object.keys(state.holdings);
  const prices = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return (await marketData.getQuote(symbol)).price;
      } catch {
        return state.holdings[symbol].avgCost;
      }
    })
  );
  const holdingsValue = symbols.reduce((sum, symbol, i) => sum + state.holdings[symbol].qty * prices[i], 0);
  return state.cash + holdingsValue;
}

async function loadState(ownerId: string): Promise<{ state: PortfolioState; equityCurve: EquityPoint[] }> {
  const { paperPortfolios } = await getCollections();
  const doc = await paperPortfolios.findOne({ ownerId });
  if (!doc) {
    const state = createEmptyPortfolio();
    // Seeded here (not just on "reset") so a brand-new user's very first
    // trade already produces a 2-point curve — start vs. now — instead of
    // needing a second trade before there's anything to plot.
    return { state, equityCurve: [{ time: nowSeconds(), equity: state.cash }] };
  }
  const state: PortfolioState = { cash: doc.cash, holdings: doc.holdings, trades: doc.trades };
  if (doc.equityCurve && doc.equityCurve.length > 0) {
    return { state, equityCurve: doc.equityCurve };
  }
  // Lazily seeds a curve for a portfolio that predates this field — one
  // "as of now" point, not a reconstructed history (there's no historical
  // mark to build one from before this existed).
  const equityCurve: EquityPoint[] = [{ time: nowSeconds(), equity: await markToMarket(state) }];
  await paperPortfolios.updateOne({ ownerId }, { $set: { equityCurve } });
  return { state, equityCurve };
}

async function saveState(ownerId: string, state: PortfolioState, equityCurve: EquityPoint[]) {
  const { paperPortfolios } = await getCollections();
  await paperPortfolios.updateOne(
    { ownerId },
    { $set: { ownerId, ...state, equityCurve, updatedAt: new Date() } },
    { upsert: true }
  );
}

export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const { state, equityCurve } = await loadState(user.id);
  return NextResponse.json({ ...state, equityCurve });
}

// Server-authoritative: the client sends an intent (action + symbol/qty/price),
// never a pre-computed state, so concurrent trades can't clobber each other's
// cash/holdings math. Every buy/sell also appends one point to equityCurve —
// see PaperPortfolio's own comment on why this only moves at trade time, not
// continuously.
export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const ownerId = user.id;
  const body = await request.json();
  const { state: current, equityCurve: currentCurve } = await loadState(ownerId);

  try {
    let next: PortfolioState;
    let equityCurve: EquityPoint[];
    if (body.action === "buy") {
      next = applyBuy(current, body.symbol, body.qty, body.price);
      equityCurve = [...currentCurve, { time: nowSeconds(), equity: await markToMarket(next) }];
    } else if (body.action === "sell") {
      next = applySell(current, body.symbol, body.qty, body.price);
      equityCurve = [...currentCurve, { time: nowSeconds(), equity: await markToMarket(next) }];
    } else if (body.action === "reset") {
      next = createEmptyPortfolio();
      equityCurve = [{ time: nowSeconds(), equity: next.cash }];
    } else {
      throw new AppError("Unknown action");
    }
    await saveState(ownerId, next, equityCurve);
    return NextResponse.json({ ...next, equityCurve });
  } catch (err) {
    return toErrorResponse(err, "Trade failed");
  }
}
