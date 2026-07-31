"use client";

import { AppNav } from "../app-nav";
import { ScreenerPanel } from "./screener-panel";

export default function ScreenerPage() {
  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 sm:p-20">
      <AppNav />
      <main className="contents">
        <ScreenerPanel />
      </main>
    </div>
  );
}
