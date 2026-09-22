"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShellNav } from "../app-shell-nav";
import { ScreenerPanel } from "./screener-panel";

function ScreenerContent() {
  const searchParams = useSearchParams();
  const highlightedParam = searchParams.get("highlighted");
  const initialHighlighted = highlightedParam
    ? highlightedParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 pb-20 sm:p-20">
      <AppShellNav />
      <main className="contents">
        <ScreenerPanel initialHighlighted={initialHighlighted} />
      </main>
    </div>
  );
}

export default function ScreenerPage() {
  return (
    <Suspense fallback={null}>
      <ScreenerContent />
    </Suspense>
  );
}
