"use client";

import { Suspense, useEffect, useState } from "react";
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
import { WelcomeCard } from "./welcome-card";
import { GuidedTour } from "./guided-tour";
import { SegmentedTabs } from "./segmented-tabs";
import { Collapsible } from "./collapsible";

const TABS = [
  { id: "watchlist", label: "Watchlist" },
  { id: "portfolio", label: "Portfolio" },
  { id: "chat", label: "Chat" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function isTab(v: string | null | undefined): v is Tab {
  return TABS.some((t) => t.id === v);
}

function HomeContent() {
  const portfolio = usePaperPortfolio();
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") ?? undefined;
  const [touring, setTouring] = useState(false);
  const [tab, setTab] = useState<Tab>("watchlist");

  // One panel at a time keeps the home screen to a single job. Deep links open
  // the right one: "/#chat" (the nav's Chat link), "/#portfolio", and any
  // "?symbol=" link (a watchlist symbol) goes to Chat about that symbol. The
  // guided tour and the nav also switch tabs through the "crade-home-tab" event.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (isTab(fromHash)) setTab(fromHash);
    else if (initialSymbol) setTab("chat");
    function onSwitch(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      if (isTab(id)) setTab(id);
    }
    // In-page links like "#chat" (the welcome card's steps) only change the hash.
    function onHash() {
      const id = window.location.hash.slice(1);
      if (isTab(id)) setTab(id);
    }
    window.addEventListener("crade-home-tab", onSwitch);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("crade-home-tab", onSwitch);
      window.removeEventListener("hashchange", onHash);
    };
  }, [initialSymbol]);

  // "/?tour=1" (linked from the Help page) replays the tour on demand.
  const tourRequested = searchParams.get("tour") === "1";
  useEffect(() => {
    if (tourRequested) setTouring(true);
  }, [tourRequested]);

  function endTour() {
    setTouring(false);
    if (tourRequested) window.history.replaceState(null, "", "/");
  }

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-6 p-6 pb-24 sm:p-12">
      <SymbolDatalist />
      <AppShellNav />
      <main className="contents">
        <WelcomeCard onStartTour={() => setTouring(true)} />
        {/* Only shows when an alert has actually fired — anything else is on /alerts. */}
        <AlertsSummary />
        <SegmentedTabs tabs={[...TABS]} value={tab} onChange={setTab} label="Home sections" />

        <section id="panel-watchlist" role="tabpanel" aria-labelledby="tab-watchlist" hidden={tab !== "watchlist"} className="w-full max-w-2xl flex flex-col gap-4">
          <Collapsible title="Market today" hint="movers + AI digest">
            <div className="flex flex-col gap-4">
              <MarketMovers />
              <MarketDigest />
            </div>
          </Collapsible>
          {/* Post-trade "log your reasoning?" prompt is the trade-success toast itself
              (app/watchlist.tsx's trade()), not a separate card here — see
              app/toast-provider.tsx's href/linkLabel support. */}
          <Watchlist
            onBuy={portfolio.buy}
            onSell={portfolio.sell}
            getTradeError={() => portfolio.lastTradeError.current}
          />
          <ShareWatchlist />
        </section>

        <section id="panel-portfolio" role="tabpanel" aria-labelledby="tab-portfolio" hidden={tab !== "portfolio"} className="w-full max-w-2xl">
          <Portfolio
            cash={portfolio.cash}
            holdings={portfolio.holdings}
            trades={portfolio.trades}
            equityCurve={portfolio.equityCurve}
            error={portfolio.error}
            loaded={portfolio.loaded}
            onReset={portfolio.reset}
          />
        </section>

        <section id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" hidden={tab !== "chat"} className="w-full max-w-2xl">
          <ChatPanel key={initialSymbol ?? ""} initialSymbol={initialSymbol} />
        </section>
      </main>
      {touring && <GuidedTour onClose={endTour} />}
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
