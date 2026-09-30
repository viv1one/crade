"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface TourStep {
  title: string;
  body: string;
  // CSS selector for the element to spotlight. When several elements match
  // (the nav is rendered once for desktop and once for mobile), the first
  // one that is actually visible wins.
  target: string;
  // Nav group to open first, when the target is a link inside one.
  openNav?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Your watchlist",
    body: "Stocks you follow. Quotes load automatically; Buy and Sell place simulated trades with fake money at the latest price.",
    target: "#watchlist h1",
  },
  {
    title: "Your paper portfolio",
    body: "Starts with ₹1,00,000 of practice cash. It tracks what you've 'bought', your profit and loss, and a performance chart. Nothing here is a real order.",
    target: "#portfolio h2",
  },
  {
    title: "AI Chat",
    body: "Ask why a stock moved or for a summary. Answers are built from its real price data and headlines, and it says so when data is missing.",
    target: "#chat h2",
  },
  {
    title: "Backtest",
    body: "Replay a trading rule over past prices to see how it would have done. It lives under Research, next to the Screener and Trading Agents.",
    target: '[data-tour="link-/backtest"]',
    openNav: "research",
  },
  {
    title: "Alerts",
    body: "Get a notification when a stock crosses a price, RSI or volume level, even when the app is closed. It lives under Track, with Holdings and Journal.",
    target: '[data-tour="link-/alerts"]',
    openNav: "track",
  },
];

const PAD = 8;

function findVisible(selector: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(selector);
  for (const el of all) if (el.getClientRects().length > 0) return el;
  return null;
}

function setNav(key: string | null) {
  window.dispatchEvent(new CustomEvent("crade-nav-expand", { detail: key }));
}

interface GuidedTourProps {
  onClose: () => void;
}

// Spotlight tour: dims the page, cuts a hole around the real element for each
// step, and explains it next to the hole. Steps whose target lives inside a
// nav menu open that menu first. Esc or "Skip" ends it at any point.
export function GuidedTour({ onClose }: GuidedTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;

  const measure = useCallback(() => {
    const el = findVisible(step.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step.target]);

  const close = useCallback(() => {
    setNav(null);
    onClose();
  }, [onClose]);

  // Bring the target on screen (opening its nav group first if needed).
  useEffect(() => {
    setNav(step.openNav ?? null);
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      findVisible(step.target)?.scrollIntoView({ block: "center", behavior: "auto" });
      measure();
    }, step.openNav ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, measure]);

  // Keep the spotlight glued to its target through scroll, resize, and layout shifts.
  useLayoutEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const interval = setInterval(schedule, 400);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [measure]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    nextRef.current?.focus();
  }, [index]);

  // Tooltip goes below the spotlight when there's room, otherwise above.
  const vw = typeof window === "undefined" ? 390 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const width = Math.min(340, vw - 24);
  let tooltipStyle: React.CSSProperties;
  if (rect) {
    const left = Math.max(12, Math.min(rect.left, vw - width - 12));
    const below = rect.bottom + PAD + 12;
    const fitsBelow = below + 190 < vh;
    tooltipStyle = fitsBelow
      ? { left, top: below, width }
      : { left, bottom: vh - rect.top + PAD + 12, width };
  } else {
    tooltipStyle = { left: 12, bottom: 96, width };
  }

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {/* Blocks clicks on the dimmed page while the tour is open. */}
      <div className="absolute inset-0" onClick={close} />
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-lg transition-all duration-200"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.6), 0 0 0 2px var(--accent)",
          }}
        />
      )}
      {!rect && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-slate-900/60" />}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${index + 1} of ${TOUR_STEPS.length}: ${step.title}`}
        className="card absolute flex flex-col gap-3 p-4 shadow-xl"
        style={tooltipStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{step.title}</h2>
          <span className="text-xs text-foreground-muted tabular-nums">
            {index + 1} / {TOUR_STEPS.length}
          </span>
        </div>
        <p className="text-xs text-foreground-muted">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <button onClick={close} className="text-xs text-foreground-muted underline underline-offset-4 touch-target">
            Skip tour
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button onClick={() => setIndex(index - 1)} className="btn-secondary-sm">
                Back
              </button>
            )}
            <button ref={nextRef} onClick={() => (last ? close() : setIndex(index + 1))} className="btn-primary text-xs">
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
