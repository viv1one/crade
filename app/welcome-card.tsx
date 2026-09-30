"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "crade_welcome_dismissed";

const STEPS = [
  {
    title: "Watch a few stocks",
    body: "Your watchlist below starts with three picks. Add any NSE symbol — quotes load automatically.",
    href: "#watchlist",
    cta: "Go to watchlist",
  },
  {
    title: "Ask the AI about one",
    body: "Chat explains a move or summarizes a stock using its real price data and headlines.",
    href: "#chat",
    cta: "Open Chat",
  },
  {
    title: "Get pinged when it moves",
    body: "Alerts push a notification on price, RSI, or volume — no need to keep the app open.",
    href: "/alerts",
    cta: "Set an alert",
  },
  {
    title: "Test an idea on past data",
    body: "Backtest runs a strategy over history so you can see how it would have done — before risking anything.",
    href: "/backtest",
    cta: "Try a backtest",
  },
];

// First-run guide: a dismissible checklist-style card rather than a
// blocking overlay tour — it never traps a returning user, and the dismissed
// flag lives in localStorage (per-browser is fine for a "you've seen this"
// hint; a private window just shows it again).
export function WelcomeCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Not persisted — the card just reappears next visit.
    }
  }

  if (!visible) return null;

  return (
    <section className="card w-full max-w-2xl flex flex-col gap-4 p-5" aria-label="Getting started">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Welcome to Crade</h2>
          <p className="text-sm text-foreground-muted">
            A research and practice space for Indian stocks. Everything here is simulated — no real money moves. Four
            good first steps:
          </p>
        </div>
        <button
          onClick={dismiss}
          className="touch-target text-sm text-foreground-muted hover:text-foreground"
          aria-label="Dismiss getting-started guide"
        >
          ✕
        </button>
      </div>
      <ol className="flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{step.title}</span>
              <span className="text-xs text-foreground-muted">{step.body}</span>
              <Link href={step.href} className="text-xs text-accent underline-offset-4 hover:underline w-fit py-1">
                {step.cta} →
              </Link>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between gap-3">
        <Link href="/help" className="text-xs text-foreground-muted underline underline-offset-4 hover:no-underline">
          Full feature guide
        </Link>
        <button onClick={dismiss} className="btn-secondary-sm">
          Got it
        </button>
      </div>
    </section>
  );
}
