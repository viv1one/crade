"use client";

import Link from "next/link";
import { HelpChatPanel } from "./help-chat-panel";

const SECTIONS = [
  {
    title: "Watchlist",
    body: "Add stock symbols like RELIANCE.NS from the home page, click Fetch to get a live quote, and buy/sell (paper trading) directly from each row by entering a quantity.",
  },
  {
    title: "Paper trading & portfolio",
    body: "Simulated only — starts with ₹1,00,000 fake cash, no real broker connection. Tracks cash, total value, P&L, open positions, and trade history below the watchlist. Reset clears it back to the starting balance.",
  },
  {
    title: "AI chat",
    body: "Ask about stocks on the home page. Set the symbol field to ground answers in that stock's real price, historical range, and recent news, and pick a task type (Chat, Explain a move, Summarize, Digest). History is saved per symbol.",
  },
  {
    title: "Alerts",
    body: "Create price/RSI/volume alerts at /alerts. Click 'Enable push notifications' once to get a real browser notification when one fires — they're checked periodically in the background.",
  },
  {
    title: "Screener",
    body: "Browse Nifty 50 stocks at /screener with manual filters (sector, price, P/E) or describe criteria in plain English in the Ask box — the AI matches real stocks from the shown data and explains why, without predicting future returns.",
  },
  {
    title: "Backtest",
    body: "Test a strategy against historical data at /backtest before trusting it, with an optional AI review of the results.",
  },
  {
    title: "Sharing",
    body: "Invite someone by email to view your watchlist read-only from the 'Share this watchlist' panel. See what's shared with you under 'Shared with me' in the top nav — revoke access any time.",
  },
];

export default function HelpPage() {
  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 sm:p-20">
      <nav className="w-full max-w-2xl flex justify-start">
        <Link href="/" className="text-sm font-medium underline underline-offset-4 hover:no-underline">
          ← Watchlist &amp; portfolio
        </Link>
      </nav>

      <div className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">How to use Crade</h1>
          <p className="text-sm text-black/50 dark:text-white/50 mt-1">
            A personal/internal research tool — not investment advice, not connected to any broker.
          </p>
        </div>

        <div className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145] rounded-lg border border-black/[.08] dark:border-white/[.145]">
          {SECTIONS.map((s) => (
            <div key={s.title} className="p-4">
              <h2 className="text-sm font-medium mb-1">{s.title}</h2>
              <p className="text-sm text-black/60 dark:text-white/60">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <HelpChatPanel />
    </div>
  );
}
