"use client";

import { AppNav } from "../app-nav";
import { BacktestPanel } from "./backtest-panel";

export default function BacktestPage() {
  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 sm:p-20">
      <AppNav />
      <main className="contents">
        <BacktestPanel />
      </main>
    </div>
  );
}
