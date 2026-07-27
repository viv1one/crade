"use client";

import Link from "next/link";
import { Watchlist } from "./watchlist";
import { Portfolio } from "./portfolio";
import { ChatPanel } from "./chat-panel";
import { usePaperPortfolio } from "./use-paper-portfolio";
import { AccountNav } from "./account-nav";

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
          <Link href="/backtest" className="text-sm font-medium underline underline-offset-4 hover:no-underline">
            Backtest a strategy →
          </Link>
        </div>
      </nav>
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
