import { NextResponse } from "next/server";
import { marketData } from "@/lib/market-data";
import { getCollections } from "@/lib/db/collections";
import type { PaperPortfolio } from "@/lib/db/collections";
import type { EquityPoint } from "@/lib/backtest/types";

// Complements app/api/portfolio/route.ts's per-trade equityCurve points
// (see that file's own comment) with one mark-to-market point per trading
// day, so a portfolio that's held-and-not-traded for a while still shows
// real day-to-day drift instead of a flat line between trades.
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// NSE only ever trades in IST, so "today" for the once-per-day dedup check
// below means the IST calendar date, not this server's own timezone — same
// reasoning app/alerts/alerts-panel.tsx's next-evaluation display already
// uses for forcing IST regardless of who's looking.
function istDateString(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function markToMarket(doc: PaperPortfolio, quotesBySymbol: Map<string, number>): number {
  const holdingsValue = Object.entries(doc.holdings).reduce((sum, [symbol, holding]) => {
    const price = quotesBySymbol.get(symbol) ?? holding.avgCost;
    return sum + holding.qty * price;
  }, 0);
  return doc.cash + holdingsValue;
}

export async function GET(request: Request) {
  // Fail closed: an unset CRON_SECRET must not fall through to "no auth
  // check at all" — same convention as evaluate-alerts/refresh-screener.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 401 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paperPortfolios } = await getCollections();
  const docs = await paperPortfolios.find({}).toArray();
  const today = istDateString(nowSeconds());

  // Batch quote fetches by symbol across every user's portfolio rather than
  // per-portfolio — same "group by symbol to avoid redundant fetches"
  // discipline evaluate-alerts/route.ts already uses, since two users can
  // easily hold the same stock (e.g. the shared starter watchlist picks).
  const allSymbols = new Set<string>();
  for (const doc of docs) {
    for (const symbol of Object.keys(doc.holdings)) allSymbols.add(symbol);
  }
  const quotesBySymbol = new Map<string, number>();
  await Promise.all(
    [...allSymbols].map(async (symbol) => {
      try {
        quotesBySymbol.set(symbol, (await marketData.getQuote(symbol)).price);
      } catch {
        // Left unset — markToMarket falls back to avgCost for this symbol,
        // same degrade-gracefully rule app/api/portfolio/route.ts's own
        // markToMarket already follows.
      }
    })
  );

  let snapshotted = 0;
  let skipped = 0;
  for (const doc of docs) {
    if (Object.keys(doc.holdings).length === 0) {
      skipped++; // cash-only portfolio never moves — nothing new to mark
      continue;
    }
    const existing = doc.equityCurve ?? [];
    const lastPoint = existing[existing.length - 1];
    if (lastPoint && istDateString(lastPoint.time) === today) {
      skipped++; // already has a point today, from a trade or an earlier run
      continue;
    }
    const equityCurve: EquityPoint[] = [...existing, { time: nowSeconds(), equity: markToMarket(doc, quotesBySymbol) }];
    await paperPortfolios.updateOne({ _id: doc._id }, { $set: { equityCurve } });
    snapshotted++;
  }

  return NextResponse.json({ portfolios: docs.length, snapshotted, skipped });
}
