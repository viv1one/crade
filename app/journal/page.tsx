"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShellNav } from "../app-shell-nav";
import { JournalPanel } from "./journal-panel";

function JournalContent() {
  const searchParams = useSearchParams();
  const prefill = {
    symbol: searchParams.get("symbol") ?? undefined,
    action: searchParams.get("action") ?? undefined,
    price: searchParams.get("price") ?? undefined,
  };

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 pb-20 sm:p-20">
      <AppShellNav />
      <main className="contents">
        <JournalPanel prefill={prefill} />
      </main>
    </div>
  );
}

export default function JournalPage() {
  return (
    <Suspense fallback={null}>
      <JournalContent />
    </Suspense>
  );
}
