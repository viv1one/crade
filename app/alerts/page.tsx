"use client";

import Link from "next/link";
import { AlertsPanel } from "./alerts-panel";
import { PushSubscribeButton } from "../push-subscribe-button";

export default function AlertsPage() {
  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 sm:p-20">
      <nav className="w-full max-w-2xl flex justify-start">
        <Link href="/" className="text-sm font-medium underline underline-offset-4 hover:no-underline">
          ← Watchlist &amp; portfolio
        </Link>
      </nav>
      <div className="w-full max-w-2xl">
        <PushSubscribeButton />
      </div>
      <AlertsPanel />
    </div>
  );
}
