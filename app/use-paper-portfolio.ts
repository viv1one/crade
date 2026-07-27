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

  const buy = useCallback((symbol: string, qty: number, price: number) => {
    setError(null);
    postTrade({ action: "buy", symbol, qty, price })
      .then(setState)
      .catch((err) => setError(err instanceof Error ? err.message : "Trade failed"));
  }, []);

  const sell = useCallback((symbol: string, qty: number, price: number) => {
    setError(null);
    postTrade({ action: "sell", symbol, qty, price })
      .then(setState)
      .catch((err) => setError(err instanceof Error ? err.message : "Trade failed"));
  }, []);

  const reset = useCallback(() => {
    setError(null);
    postTrade({ action: "reset" })
      .then(setState)
      .catch((err) => setError(err instanceof Error ? err.message : "Reset failed"));
  }, []);

  return { ...state, error, loaded, buy, sell, reset };
}
