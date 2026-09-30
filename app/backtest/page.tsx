"use client";

import { AppShellNav } from "../app-shell-nav";
import { BacktestPanel } from "./backtest-panel";

export default function BacktestPage() {
  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-6 p-6 pb-24 sm:p-12">
      <AppShellNav />
      <main className="contents">
        <BacktestPanel />
      </main>
    </div>
  );
}
