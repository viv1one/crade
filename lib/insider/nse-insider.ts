import type { InsiderTransaction } from "./types";

// NSE's Prohibition of Insider Trading (PIT) disclosures — the Indian
// equivalent of the US SEDI-style insider-transaction filings the
// TradingAgents paper uses. Fronted by the same anti-bot cookie check as
// every other NSE endpoint in this app (see
// lib/market-data/providers/nse-free.ts's getSessionCookie) — not shared
// code with that file, same "each provider file is self-contained" pattern
// nse-free.ts and screener-in.ts already use.
//
// IMPORTANT: unlike nse-free.ts's quote/historical endpoints (which are the
// same ones jugaad-data/NSEpy use and have been exercised live), this
// specific endpoint path and response shape have NOT been verified live in
// this app's environment — NSE's PIT-disclosure surface is reverse-
// engineered from public documentation, not confirmed working here. Treat
// this the same as every other unofficial NSE integration in this codebase:
// verify against a real symbol before depending on it, and expect it may
// need adjustment. On any failure this throws, and callers (see
// lib/agents/analysts.ts) degrade gracefully rather than failing the whole
// fundamentals report — same pattern buildMarketContext already uses for
// its own fragile fundamentals fetch.
const BASE_URL = "https://www.nseindia.com";
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

const COOKIE_TTL_MS = 5 * 60 * 1000;
let cachedCookie: { value: string; fetchedAt: number } | null = null;

async function getSessionCookie(): Promise<string> {
  if (cachedCookie && Date.now() - cachedCookie.fetchedAt < COOKIE_TTL_MS) {
    return cachedCookie.value;
  }
  const res = await fetch(BASE_URL, { headers: BROWSER_HEADERS });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
  cachedCookie = { value: cookie, fetchedAt: Date.now() };
  return cookie;
}

function stripSuffix(symbol: string): string {
  return symbol.replace(/\.(NS|BO)$/i, "");
}

interface NsePitRow {
  acqName?: string;
  personCategory?: string;
  acqMode?: string; // e.g. "Market Purchase", "Market Sale"
  secVal?: string;
  secAcq?: string; // quantity, as a string
  date?: string;
}

function classify(acqMode: string | undefined): InsiderTransaction["transactionType"] {
  const mode = (acqMode ?? "").toLowerCase();
  if (mode.includes("sale") || mode.includes("sell")) return "sell";
  if (mode.includes("purchase") || mode.includes("buy") || mode.includes("acquisition")) return "buy";
  return "other";
}

export async function fetchInsiderActivity(symbol: string): Promise<InsiderTransaction[]> {
  const sym = stripSuffix(symbol);
  const cookie = await getSessionCookie();
  const res = await fetch(`${BASE_URL}/api/corporates-pit?index=equities&symbol=${encodeURIComponent(sym)}`, {
    headers: { ...BROWSER_HEADERS, Cookie: cookie },
  });
  if (!res.ok) {
    throw new Error(`nse-insider request failed for ${symbol}: ${res.status}`);
  }
  const json = (await res.json()) as { data?: NsePitRow[] };
  const rows = json.data ?? [];

  return rows
    .filter((r) => r.acqName)
    .map((r) => ({
      personName: r.acqName ?? "",
      category: r.personCategory,
      transactionType: classify(r.acqMode),
      quantity: r.secAcq ? Number(r.secAcq.replace(/,/g, "")) : undefined,
      value: r.secVal ? Number(r.secVal.replace(/,/g, "")) : undefined,
      date: r.date && !Number.isNaN(Date.parse(r.date)) ? new Date(r.date).toISOString() : new Date().toISOString(),
    }));
}
