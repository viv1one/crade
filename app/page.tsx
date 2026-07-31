"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Watchlist } from "./watchlist";
import { Portfolio } from "./portfolio";
import { ChatPanel } from "./chat-panel";
import { usePaperPortfolio } from "./use-paper-portfolio";
import { AppNav } from "./app-nav";
import { AlertsSummary } from "./alerts-summary";
import { MarketMovers } from "./market-movers";
import { MarketDigest } from "./market-digest";
import { ShareWatchlist } from "./share-watchlist";

function HomeContent() {
  const portfolio = usePaperPortfolio();
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") ?? undefined;

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 sm:p-20">
      <AppNav />
      <main className="contents">
        <div className="w-full max-w-2xl flex flex-col gap-6">
          <AlertsSummary />
          <MarketMovers />
          <MarketDigest />
        </div>
        <Watchlist onBuy={portfolio.buy} onSell={portfolio.sell} />
        <ShareWatchlist />
        <Portfolio
          cash={portfolio.cash}
          holdings={portfolio.holdings}
          trades={portfolio.trades}
          error={portfolio.error}
          loaded={portfolio.loaded}
          onReset={portfolio.reset}
        />
        <ChatPanel initialSymbol={initialSymbol} />
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
