"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "crade_welcome_dismissed";

const STEPS = [
  { label: "Watch a few stocks", href: "#watchlist" },
  { label: "Ask the AI about one", href: "#chat" },
  { label: "Get pinged when it moves", href: "/alerts" },
  { label: "Test an idea on past data", href: "/backtest" },
];

interface WelcomeCardProps {
  // Opens the spotlight tour (app/guided-tour.tsx). The card itself never
  // blocks the page: it's a dismissible checklist, and the tour is opt-in.
  onStartTour: () => void;
}

// First-run guide. The dismissed flag lives in localStorage (per-browser is
// fine for a "you've seen this" hint; a private window just shows it again).
export function WelcomeCard({ onStartTour }: WelcomeCardProps) {
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
    <section className="card w-full max-w-2xl flex flex-col gap-3 p-4" aria-label="Getting started">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Welcome to Crade</h2>
          <p className="text-sm text-foreground-muted">Practice with fake money — nothing here is real. Start here:</p>
        </div>
        <button
          onClick={dismiss}
          className="touch-target text-sm text-foreground-muted hover:text-foreground"
          aria-label="Dismiss getting-started guide"
        >
          ✕
        </button>
      </div>
      <ol className="flex flex-col">
        {STEPS.map((step, i) => (
          <li key={step.label}>
            <Link
              href={step.href}
              // A "#chat" link only changes the hash (no route change, no hashchange
              // event from Next's router), so tell the home page which tab to show.
              onClick={() => {
                if (step.href.startsWith("#")) {
                  window.dispatchEvent(new CustomEvent("crade-home-tab", { detail: step.href.slice(1) }));
                }
              }}
              className="flex items-center gap-3 rounded-md py-2 text-sm hover:bg-background"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="flex-1">{step.label}</span>
              <span className="text-foreground-muted" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between gap-3">
        <Link href="/help" className="text-xs text-foreground-muted underline underline-offset-4 hover:no-underline">
          Help
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => {
              dismiss();
              onStartTour();
            }}
            className="btn-primary text-xs"
          >
            Take a 1-minute tour
          </button>
          <button onClick={dismiss} className="btn-secondary-sm">
            Got it
          </button>
        </div>
      </div>
    </section>
  );
}
