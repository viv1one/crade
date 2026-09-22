"use client";

import { useCallback, useEffect, useState } from "react";
import { createEmptyPortfolio } from "@/lib/paper-trading/store";
import type { PortfolioState } from "@/lib/paper-trading/types";

async function postTrade(body: Record<string, unknown>): Promise<PortfolioState> {
  const res = await fetch("/api/portfolio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function usePaperPortfolio() {
  const [state, setState] = useState<PortfolioState>(createEmptyPortfolio());
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((res) => res.json())
      .then((data: PortfolioState) => setState(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load portfolio"))
      .finally(() => setLoaded(true));
  }, []);

  // Return the underlying promise (resolving to whether it succeeded)
  // rather than firing-and-forgetting — callers that don't care can still
  // ignore the return value (existing behavior, unchanged), but a caller
  // that wants to show a "fetching live quote & executing…" state while
  // the server-authoritative fill is in flight (see app/watchlist.tsx) now
  // has something to await. app/watchlist.tsx's own post-trade toast (with
  // a "Log it" link into the Journal, prefilled) is the source of truth for
  // "what happens right after a trade" — this hook itself no longer tracks
  // a lastTrade of its own.
  const buy = useCallback(async (symbol: string, qty: number, price: number) => {
    setError(null);
    try {
      const s = await postTrade({ action: "buy", symbol, qty, price });
      setState(s);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade failed");
      return false;
    }
  }, []);

  const sell = useCallback(async (symbol: string, qty: number, price: number) => {
    setError(null);
    try {
      const s = await postTrade({ action: "sell", symbol, qty, price });
      setState(s);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade failed");
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    postTrade({ action: "reset" })
      .then(setState)
      .catch((err) => setError(err instanceof Error ? err.message : "Reset failed"));
  }, []);

  return { ...state, error, loaded, buy, sell, reset };
}
