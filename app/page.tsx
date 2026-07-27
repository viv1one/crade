"use client";

import { Watchlist } from "./watchlist";
import { Portfolio } from "./portfolio";
import { ChatPanel } from "./chat-panel";
import { usePaperPortfolio } from "./use-paper-portfolio";

export default function Home() {
  const portfolio = usePaperPortfolio();

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 sm:p-20">
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
