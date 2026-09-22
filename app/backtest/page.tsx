"use client";

import { AppShellNav } from "../app-shell-nav";
import { BacktestPanel } from "./backtest-panel";

export default function BacktestPage() {
  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 pb-20 sm:p-20">
      <AppShellNav />
      <main className="contents">
        <BacktestPanel />
      </main>
    </div>
  );
}
