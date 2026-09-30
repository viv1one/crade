"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { createEmptyPortfolio } from "@/lib/paper-trading/store";
import type { PortfolioState } from "@/lib/paper-trading/types";
import type { EquityPoint } from "@/lib/backtest/types";
import { safeJson, errorMessage } from "./fetch-json";

type PortfolioStateWithCurve = PortfolioState & { equityCurve: EquityPoint[] };

async function postTrade(body: Record<string, unknown>): Promise<PortfolioStateWithCurve> {
  const res = await fetch("/api/portfolio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return safeJson<PortfolioStateWithCurve>(res);
}

export function usePaperPortfolio() {
  const [state, setState] = useState<PortfolioStateWithCurve>({ ...createEmptyPortfolio(), equityCurve: [] });
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Reason for the most recent failed buy/sell, readable synchronously right
  // after the awaited call resolves false (state `error` lags a render behind).
  const lastTradeError = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((res) => safeJson<PortfolioStateWithCurve>(res))
      .then((data) => setState(data))
      .catch((err) => setError(errorMessage(err, "Failed to load portfolio")))
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
      lastTradeError.current = null;
      const s = await postTrade({ action: "buy", symbol, qty, price });
      setState(s);
      return true;
    } catch (err) {
      const message = errorMessage(err, "Trade failed");
      lastTradeError.current = message;
      setError(message);
      return false;
    }
  }, []);

  const sell = useCallback(async (symbol: string, qty: number, price: number) => {
    setError(null);
    try {
      lastTradeError.current = null;
      const s = await postTrade({ action: "sell", symbol, qty, price });
      setState(s);
      return true;
    } catch (err) {
      const message = errorMessage(err, "Trade failed");
      lastTradeError.current = message;
      setError(message);
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    postTrade({ action: "reset" })
      .then(setState)
      .catch((err) => setError(errorMessage(err, "Reset failed")));
  }, []);

  return { ...state, error, loaded, buy, sell, reset, lastTradeError };
}
