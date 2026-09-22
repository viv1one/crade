"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Watchlist } from "./watchlist";
import { Portfolio } from "./portfolio";
import { ChatPanel } from "./chat-panel";
import { usePaperPortfolio } from "./use-paper-portfolio";
import { AppShellNav } from "./app-shell-nav";
import { AlertsSummary } from "./alerts-summary";
import { MarketMovers } from "./market-movers";
import { MarketDigest } from "./market-digest";
import { ShareWatchlist } from "./share-watchlist";
import { SymbolDatalist } from "./symbol-datalist";

function HomeContent() {
  const portfolio = usePaperPortfolio();
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") ?? undefined;

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 pb-20 sm:p-20">
      <SymbolDatalist />
      <AppShellNav />
      <main className="contents">
        <div className="w-full max-w-2xl flex flex-col gap-6">
          <AlertsSummary />
          <MarketMovers />
          <MarketDigest />
        </div>
        {/* Post-trade "log your reasoning?" prompt is now the trade-success
            toast itself (app/watchlist.tsx's trade()), not a separate
            always-on card here — see app/toast-provider.tsx's href/linkLabel
            support, added specifically to unify these into one mechanism. */}
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
