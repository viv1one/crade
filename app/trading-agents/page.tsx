"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShellNav } from "../app-shell-nav";
import { TradingAgentsPanel } from "./trading-agents-panel";

function TradingAgentsContent() {
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") ?? undefined;

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-6 p-6 pb-24 sm:p-12">
      <AppShellNav />
      <main className="contents">
        <TradingAgentsPanel initialSymbol={initialSymbol} />
      </main>
    </div>
  );
}

export default function TradingAgentsPage() {
  return (
    <Suspense fallback={null}>
      <TradingAgentsContent />
    </Suspense>
  );
}
