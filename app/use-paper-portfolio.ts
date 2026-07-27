"use client";

import { useCallback, useEffect, useState } from "react";
import { applyBuy, applySell, createEmptyPortfolio } from "@/lib/paper-trading/store";
import type { PortfolioState } from "@/lib/paper-trading/types";

const STORAGE_KEY = "crade_paper_portfolio_v1";

function loadPortfolio(): PortfolioState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PortfolioState) : createEmptyPortfolio();
  } catch {
    return createEmptyPortfolio();
  }
}

export function usePaperPortfolio() {
  // Start identical on server and first client render to avoid a hydration
  // mismatch; the real (possibly non-empty) localStorage state loads right
  // after mount.
  const [state, setState] = useState<PortfolioState>(createEmptyPortfolio());
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadPortfolio());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const buy = useCallback((symbol: string, qty: number, price: number) => {
    setError(null);
    setState((prev) => {
      try {
        return applyBuy(prev, symbol, qty, price);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Trade failed");
        return prev;
      }
    });
  }, []);

  const sell = useCallback((symbol: string, qty: number, price: number) => {
    setError(null);
    setState((prev) => {
      try {
        return applySell(prev, symbol, qty, price);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Trade failed");
        return prev;
      }
    });
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setState(createEmptyPortfolio());
  }, []);

  return { ...state, error, buy, sell, reset };
}
