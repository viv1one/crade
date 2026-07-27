import type { Fundamentals, HistoricalBar, MarketDataProvider, Quote } from "../types";

// Free, keyless fallback for prototyping only, same footing as yahoo-free.ts
// — NSE's terms don't permit redistributing this data to other users. Calls
// NSE's own undocumented public JSON endpoints (the same ones jugaad-data /
// NSEpy use), which front an anti-bot check: a request needs cookies from a
// prior page load before the API accepts it. There's no real login, just
// what a browser would pick up automatically — but this is a reverse-
// engineered surface, not a stable contract, so NSE can change the shape or
// the anti-bot behavior at any time.
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
  // Node folds multiple Set-Cookie headers into one comma-joined string;
  // split on commas that precede a `name=value` pair and keep only that
  // pair (drop the Path/Expires/... attributes) before replaying as Cookie.
  const cookie = setCookie
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
  cachedCookie = { value: cookie, fetchedAt: Date.now() };
  return cookie;
}

async function nseFetch(path: string): Promise<unknown> {
  const cookie = await getSessionCookie();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { ...BROWSER_HEADERS, Cookie: cookie },
  });
  if (!res.ok) {
    throw new Error(`nse-free request failed for ${path}: ${res.status}`);
  }
  return res.json();
}

function stripSuffix(symbol: string): string {
  return symbol.replace(/\.(NS|BO)$/i, "");
}

function formatNseDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function rangeToDays(range: string): number {
  const match = range.match(/^(\d+)(d|mo|y)$/);
  if (!match) return 365;
  const n = Number(match[1]);
  if (match[2] === "d") return n;
  if (match[2] === "mo") return n * 30;
  return n * 365;
}

interface NseQuoteResponse {
  priceInfo?: { lastPrice?: number; previousClose?: number };
  metadata?: { pdSymbolPe?: number };
  marketDeptOrderBook?: { tradeInfo?: { totalTradedVolume?: number } };
}

interface NseHistoricalRow {
  CH_TIMESTAMP: string;
  CH_OPENING_PRICE: number;
  CH_TRADE_HIGH_PRICE: number;
  CH_TRADE_LOW_PRICE: number;
  CH_CLOSING_PRICE: number;
  CH_TOT_TRADED_QTY: number;
}

export const nseFreeProvider: MarketDataProvider = {
  name: "nse-free",

  async getQuote(symbol: string): Promise<Quote> {
    const sym = stripSuffix(symbol);
    const data = (await nseFetch(`/api/quote-equity?symbol=${encodeURIComponent(sym)}`)) as NseQuoteResponse;
    const price = data.priceInfo?.lastPrice;
    const prevClose = data.priceInfo?.previousClose;
    if (price === undefined || prevClose === undefined) {
      throw new Error(`nse-free getQuote: no data for ${symbol}`);
    }
    return {
      symbol,
      price,
      change: price - prevClose,
      changePercent: ((price - prevClose) / prevClose) * 100,
      volume: data.marketDeptOrderBook?.tradeInfo?.totalTradedVolume ?? 0,
      asOf: new Date(),
    };
  },

  // NSE's historical endpoint only returns end-of-day rows — there's no
  // intraday granularity here, so this ignores `interval` and always
  // returns daily bars for the requested date range.
  async getHistorical(symbol: string, _interval: string, range: string): Promise<HistoricalBar[]> {
    const sym = stripSuffix(symbol);
    const to = new Date();
    const from = new Date(to.getTime() - rangeToDays(range) * 24 * 60 * 60 * 1000);
    const data = (await nseFetch(
      `/api/historical/cm/equity?symbol=${encodeURIComponent(sym)}&series=[%22EQ%22]` +
        `&from=${formatNseDate(from)}&to=${formatNseDate(to)}`
    )) as { data?: NseHistoricalRow[] };

    const rows = data.data ?? [];
    return rows
      .map((row) => ({
        time: Math.floor(new Date(row.CH_TIMESTAMP).getTime() / 1000),
        open: row.CH_OPENING_PRICE,
        high: row.CH_TRADE_HIGH_PRICE,
        low: row.CH_TRADE_LOW_PRICE,
        close: row.CH_CLOSING_PRICE,
        volume: row.CH_TOT_TRADED_QTY,
      }))
      .filter((bar): bar is HistoricalBar => bar.open != null && bar.close != null && !Number.isNaN(bar.time))
      .sort((a, b) => a.time - b.time);
  },

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const sym = stripSuffix(symbol);
    const data = (await nseFetch(`/api/quote-equity?symbol=${encodeURIComponent(sym)}`)) as NseQuoteResponse;
    return {
      symbol,
      peRatio: data.metadata?.pdSymbolPe,
    };
  },
};
