"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import Link from "next/link";

type ToastVariant = "success" | "danger" | "neutral";

interface ToastOptions {
  variant?: ToastVariant;
  // Makes the whole toast a clickable link — e.g. the post-trade "Trade
  // logged, log your reasoning?" toast (app/watchlist.tsx) links straight
  // to the prefilled Journal entry, matching the spec's literal "tapping
  // it opens..." flow rather than a separate always-on dismissible card.
  href?: string;
  linkLabel?: string;
}

interface Toast extends ToastOptions {
  id: number;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, options?: ToastVariant | ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

// The one general-purpose toast primitive in the app — see
// app/bottom-sheet.tsx for the other new overlay primitive (that one's for
// Trading Agents' live-progress specifically). Built the same way: plain
// fixed-position markup, no portal/dependency, matching every other UI
// primitive in this codebase. A React Context is new here (everywhere else
// is prop-drilled per-component state) but is the only sane way to let any
// button anywhere in the tree confirm an action without threading a
// callback through every intermediate component.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, options?: ToastVariant | ToastOptions) => {
    const resolved: ToastOptions = typeof options === "string" ? { variant: options } : (options ?? {});
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, ...resolved }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-20 sm:bottom-4 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`card px-4 py-2 text-sm shadow-lg pointer-events-auto flex items-center gap-3 ${
              t.variant === "success" ? "border-success/40 text-success" : t.variant === "danger" ? "border-danger/40 text-danger" : ""
            }`}
          >
            <span>{t.message}</span>
            {t.href && (
              <Link
                href={t.href}
                onClick={() => dismiss(t.id)}
                className="text-xs font-semibold underline underline-offset-4 hover:no-underline whitespace-nowrap"
              >
                {t.linkLabel ?? "View →"}
              </Link>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Throws if used outside <ToastProvider> (mounted once in app/layout.tsx)
// rather than silently no-op-ing — a toast call that's never shown is a
// UX bug worth surfacing immediately during development, not swallowed.
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
