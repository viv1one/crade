"use client";

import Link from "next/link";
import { Watchlist } from "./watchlist";
import { Portfolio } from "./portfolio";
import { ChatPanel } from "./chat-panel";
import { usePaperPortfolio } from "./use-paper-portfolio";
import { AccountNav } from "./account-nav";
import { AlertsSummary } from "./alerts-summary";
import { MarketMovers } from "./market-movers";

export default function Home() {
  const portfolio = usePaperPortfolio();

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 sm:p-20">
      <nav className="w-full max-w-2xl flex justify-between items-center">
        <AccountNav />
        <div className="flex items-center gap-4">
          <Link href="/alerts" className="text-sm font-medium underline underline-offset-4 hover:no-underline">
            Alerts
          </Link>
          <Link href="/screener" className="text-sm font-medium underline underline-offset-4 hover:no-underline">
            Screener
          </Link>
          <Link href="/backtest" className="text-sm font-medium underline underline-offset-4 hover:no-underline">
            Backtest a strategy →
          </Link>
        </div>
      </nav>
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <AlertsSummary />
        <MarketMovers />
      </div>
      <Watchlist onBuy={portfolio.buy} onSell={portfolio.sell} />
      <Portfolio
        cash={portfolio.cash}
        holdings={portfolio.holdings}
        trades={portfolio.trades}
        error={portfolio.error}
        loaded={portfolio.loaded}
        onReset={portfolio.reset}
      />
      <ChatPanel />
    </div>
  );
}
