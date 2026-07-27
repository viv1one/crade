"use client";

import { useCallback, useEffect, useState } from "react";

const DEFAULT_SYMBOLS = ["RELIANCE.NS", "TCS.NS", "INFY.NS"];

function persist(symbols: string[]) {
  fetch("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols }),
  }).catch(() => {
    // best-effort; the in-memory list stays correct for this session either way
  });
}

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/watchlist")
      .then((res) => res.json())
      .then((data: { symbols: string[]; isNew: boolean }) => {
        if (data.isNew) {
          setSymbols(DEFAULT_SYMBOLS);
          persist(DEFAULT_SYMBOLS);
        } else {
          setSymbols(data.symbols);
        }
      })
      .catch(() => setSymbols(DEFAULT_SYMBOLS))
      .finally(() => setLoaded(true));
  }, []);

  const addSymbol = useCallback((symbol: string) => {
    setSymbols((prev) => {
      if (prev.includes(symbol)) return prev;
      const next = [...prev, symbol];
      persist(next);
      return next;
    });
  }, []);

  const removeSymbol = useCallback((symbol: string) => {
    setSymbols((prev) => {
      const next = prev.filter((s) => s !== symbol);
      persist(next);
      return next;
    });
  }, []);

  return { symbols, addSymbol, removeSymbol, loaded };
}
