"use client";

import { AppNav } from "../app-nav";
import { TradingAgentsPanel } from "./trading-agents-panel";

export default function TradingAgentsPage() {
  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 sm:p-20">
      <AppNav />
      <main className="contents">
        <TradingAgentsPanel />
      </main>
    </div>
  );
}
