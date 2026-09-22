"use client";

import { AppShellNav } from "../app-shell-nav";
import { HelpChatPanel } from "./help-chat-panel";

const QUICK_START = [
  "Add a stock to your Watchlist on the home page (top nav, 📈) — try RELIANCE.NS or just \"Adani\".",
  "Try a paper trade — click Buy on any watchlist row, or swipe the row right. It uses fake money, so there's nothing to lose.",
  "Ask the AI Chat a question about that stock (AI Desk → Chat) to see how it reasons from real data.",
];

interface Section {
  title: string;
  intro: string;
  bullets: string[];
}

// If you add or change a feature, update this list AND
// app/api/help-chat/route.ts's SYSTEM_PROMPT — the help assistant only
// knows what's written there, so the two drift apart silently otherwise.
const SECTIONS: Section[] = [
  {
    title: "Home page dashboard — top of the home page",
    intro: "A few small widgets above your Watchlist, meant to be glanced at, not read in depth:",
    bullets: [
      "Active/triggered alerts — a quiet line if nothing's fired, or a loud banner naming exactly which alerts just triggered.",
      "Nifty 50 movers — the day's top 3 gainers and top 3 losers, pulled from the same data as the Screener.",
      "Generate AI market digest — a button, not automatic (no reason to spend an AI call you didn't ask for) — summarizes what happened in the market today using the screener's cached data.",
    ],
  },
  {
    title: "Watchlist — 📈, home page",
    intro: "Your list of stocks to keep an eye on, and where you place paper trades.",
    bullets: [
      "Add a stock by symbol (RELIANCE.NS) or company name (\"Adani\") — a live price loads automatically, no extra click needed.",
      "Each row shows the price, day change %, and (if a Trading Agents analysis has been run on it) a BUY/SELL/HOLD badge — tap it to jump straight to that analysis. A badge older than 48 hours shows \"Stale\" instead, as a reminder to re-run it.",
      "RSI/SMA toggle (top right) — turns on 14-day RSI plus 20-day and 50-day moving averages per row, flagging \"oversold\"/\"overbought\" when RSI crosses 30/70.",
      "Buy and Sell buttons place a paper trade at the live price; on a touchscreen you can also swipe a row right to Buy or left to Sell — the buttons are always there too, swiping is just a shortcut.",
      "A quote marked \"Stale\" (data provider hiccup — see the price when we couldn't refresh it) can't be traded on until it's fresh again.",
      "Refresh re-fetches one row's price on demand; Refresh all does every row at once. ✕ removes a symbol.",
    ],
  },
  {
    title: "Paper trading & Portfolio — home page, below the watchlist",
    intro: "\"Paper trading\" means practicing with fake money — no real broker, no real risk. This is where your simulated results live.",
    bullets: [
      "Starts at ₹1,00,000 fake cash. The summary row shows remaining Cash, Total value (cash + what your positions are worth now), and Total P&L.",
      "Holdings list — each open position with its quantity, average cost, and live profit/loss in both ₹ and %.",
      "Trade history — every buy/sell you've made: side, symbol, quantity @ price, realized profit/loss (for a closing trade), and timestamp.",
      "\"Generate AI portfolio diagnostics\" — an on-demand button that reads your current holdings and describes concentration and sector exposure; tick \"Include deep factor analysis vs. the full Nifty 50 (slower)\" for a more thorough (and slower) read.",
      "Reset wipes everything back to the ₹1,00,000 starting balance — use it whenever you want a clean slate.",
      "After a trade, a toast pops up with a \"Log it\" link straight into the Journal, pre-filled with that trade's symbol, side, and price plus a snapshot of the price and any Trading Agents verdict at that exact moment.",
    ],
  },
  {
    title: "AI Chat — AI Desk → Chat (home page)",
    intro: "A chat assistant for discussing one specific stock, grounded in real data rather than guessing.",
    bullets: [
      "Type a symbol into the field to ground answers in that stock's real price, price history, fundamentals, and recent news headlines — leave it blank for a general question.",
      "Task picker changes how it approaches your question: Chat (open-ended), Explain a move (why did the price do X), Summarize, or Digest.",
      "Answers that used real data show small \"Source\" pills underneath (e.g. which headline or price point it drew from) so you can see what it actually looked at.",
      "If the underlying data genuinely couldn't be fetched, the reply renders as a distinct dashed \"⚠ No live data available\" block instead of a normal answer — it's built to say so plainly rather than invent numbers or headlines.",
      "History is saved per symbol, so it's still there next time you ask about the same stock. Clicking any symbol name elsewhere in the app (watchlist, screener) jumps straight into a chat about it.",
    ],
  },
  {
    title: "Trading Agents — AI Desk → Trading Agents",
    intro: "A much deeper analysis than AI Chat — a simulated team of AI \"agents\" that debate a stock before reaching one verdict.",
    bullets: [
      "Analyst team (runs in parallel): a Technical analyst (price/RSI/moving averages), a Fundamentals analyst (P/E, market cap, EPS, dividend yield, plus recent insider trading disclosures), a News analyst (recent headlines), and a Sentiment analyst (Reddit discussion).",
      "Bull vs. Bear debate — two more agents argue the strongest case for and against the stock using only the analyst reports, shown side by side with the stronger-supported case highlighted.",
      "Trader's plan — proposes an initial Buy/Sell/Hold with a suggested entry price and stop-loss.",
      "Risk debate & Fund Manager decision — three more agents (Risky/Safe/Neutral) react to the trader's plan, and a final \"Fund Manager\" call turns all of it into one verdict with a confidence level (low/medium/high) and a written reason.",
      "You can watch a live checklist tick off each stage as it finishes — a full run is ~12 chained AI calls and takes up to 5 minutes, but it now runs in the background, so you can navigate away and come back.",
      "A Buy/Sell verdict can be turned straight into a paper trade, or into a stop-loss price alert, with one click.",
      "Every run is saved under \"Past analyses\" so you can reopen it later without re-running it — a verdict older than 2 days is marked stale.",
      "You can also launch this on any stock straight from the Screener's ⚡ Agents button, or a stale/fresh badge on a Watchlist row — it opens in a popup rather than leaving the page you're on.",
    ],
  },
  {
    title: "Screener — Discovery → Screener",
    intro: "A filterable table of stocks for finding something worth researching further.",
    bullets: [
      "Two tabs: Nifty 50 (the 50 largest, refreshed on demand) or All NSE stocks (~2,000 stocks, refreshed automatically in the background over the course of an hour, so rows can have slightly different freshnesses).",
      "Table columns: Symbol (with company name underneath), Sector, Price, Change (day %), P/E, and Mkt cap — a stock with an unusually high P/E gets a \"High\" badge next to the number.",
      "Filters: sector dropdown, min/max price, and max P/E, plus a sort-by dropdown (% change, price, P/E, or market cap).",
      "The Ask box lets you describe what you want in plain English — e.g. \"5 stocks with positive momentum and a reasonable P/E\" — and the AI picks matching rows from the real table shown and explains why, without predicting future returns.",
      "Each row has a \"+ Watchlist\" button to add it, and a \"⚡ Agents\" button that opens a full Trading Agents run for that stock right there.",
      "Arriving here from a triggered price alert filters the table down to just the stock(s) that fired, with a banner and a \"Clear filter\" link.",
    ],
  },
  {
    title: "Backtest — Discovery → Backtest a strategy",
    intro: "Test whether a buy/sell strategy would have worked historically, before trusting it with real decisions. Five modes:",
    bullets: [
      "Single symbol — test one strategy against one stock's own price history.",
      "Portfolio (basket) — run the same strategy across several stocks at once, starting cash split equally between them.",
      "Cross-sectional (NIFTY 50) — rank all 50 stocks against each other every rebalance and hold the top performers; not tied to any one stock.",
      "Pairs — bet on two related stocks' prices converging again, a market-neutral trade (one long, one short position at the same time).",
      "Strategy leaderboard — runs every ranking strategy over the same period and shows which performed best historically, plus what each currently holds.",
      "Pick a strategy (grouped by family, e.g. trend-following, mean-reversion), tune its parameters, choose a data interval (daily/weekly/monthly) and lookback range (3 months to 5 years), then Run.",
      "Results show a metrics grid (total return, return vs. plain buy-and-hold, CAGR, max drawdown, Sharpe ratio, win rate, number of trades, final equity), an equity curve chart plotted against a benchmark, and a full trade log.",
      "\"Synthesize results\" gets an optional AI summary of what the numbers actually show — it does not predict future returns.",
      "Every run is saved under \"Past runs\" so you can reopen it later.",
    ],
  },
  {
    title: "Vault — 🏦, real holdings you already own",
    intro: "For tracking investments you hold in your actual brokerage account (e.g. Groww) — entered manually, for research only. Crade never connects to your broker, never verifies these numbers, and never places real trades here.",
    bullets: [
      "Add one holding at a time (symbol, quantity, average cost, optional note and purchase date), or \"Add multiple at once\" to paste several lines in one go (one holding per line: symbol, quantity, avg cost).",
      "Summary row: total invested, current value, and total P&L (in ₹ and %); a per-holding annualized return (%/yr) appears once you've given it a purchase date.",
      "Sector allocation — a pie chart of what sectors your money is actually in, plus your top-1 and top-3 concentration percentages.",
      "Risk exposure — a chart weighing each holding's size in your portfolio against how volatile that stock has been.",
      "\"Generate AI portfolio diagnostics\" (optionally with a deeper \"factor analysis vs. the full Nifty 50\" checkbox) and \"Suggest diversifiers\" (AI picks are real NIFTY 50 stocks that would fill a sector gap you don't have exposure to) — both on-demand, both describe patterns only, never predict returns.",
      "Swipe a holding row left (or tap the 🔔) to open a quick \"create an alert from this holding\" form, pre-filled 10% below the current price.",
    ],
  },
  {
    title: "Journal — Menu → Journal",
    intro: "A place to write down your reasoning before a trade (or before deciding not to make one), separate from the actual trade log in Portfolio/Vault.",
    bullets: [
      "Log an entry: symbol, action (Buy / Sell / Watch), your reasoning in your own words, and an optional price.",
      "Arriving here from a \"Log it\" trade toast pre-fills the symbol/action/price and shows a frozen snapshot of the price and any Trading Agents verdict at that exact moment, so you can see what the data looked like when you actually decided.",
      "Come back later and \"Add outcome\" to any entry once you know what happened.",
      "\"View outcome chart\" on any entry plots the stock's price since you logged it.",
      "\"Get AI review of my journal\" looks across everything you've logged and describes real patterns (e.g. recurring reasoning, how often your stated thesis matched the outcome) — never predicts future returns, only reflects on your own past record.",
    ],
  },
  {
    title: "Alerts — Menu → Alerts, 🔔",
    intro: "Get notified automatically when something happens to a stock you're watching.",
    bullets: [
      "Conditions: price above a value, price below a value, RSI(14) below a value, or a volume spike vs. the 20-day average (\"When\" side of the form).",
      "Delivery: a push notification on this device (click \"Enable push notifications\" once first) or an email — chosen per alert (\"Then\" side of the form).",
      "Checked automatically every 4 hours — the page shows the exact time of the next check.",
      "A fired alert shows a \"triggered\" badge and stays that way until you reactivate it; Pause/Activate toggles whether it's being checked at all.",
    ],
  },
  {
    title: "Sharing — from the Watchlist, and Menu → Shared with me",
    intro: "Let someone else view your watchlist without giving them any ability to change or trade anything.",
    bullets: [
      "\"Share this watchlist\" (on the home page) invites someone by email — they don't need an account yet for you to invite them, only to actually view it once it's shared.",
      "Revoke access any time from the same panel.",
      "Anything others have shared with you appears under \"Shared with me\" in the Menu.",
    ],
  },
  {
    title: "Account",
    intro: "Sign up or log in with an email and password.",
    bullets: [
      "Your email and a Log out link are always in the top corner of the nav.",
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 pb-20 sm:p-20">
      <AppShellNav />

      <main className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">How to use Crade</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Crade is a personal practice and research tool for Indian stocks. Every trade you place
            here uses fake money — there is no connection to any real broker, and nothing on this
            site is investment advice. Think of it as a safe place to learn, research, and track your
            own thinking.
          </p>
        </div>

        <div className="card p-4 flex flex-col gap-2">
          <h2 className="text-sm font-semibold">New here? Try these three things first</h2>
          <ol className="text-sm text-foreground-muted list-decimal pl-5 flex flex-col gap-1">
            {QUICK_START.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="card flex flex-col divide-y divide-border overflow-hidden">
          {SECTIONS.map((s) => (
            <div key={s.title} className="p-4">
              <h2 className="text-sm font-medium mb-1">{s.title}</h2>
              <p className="text-sm text-foreground-muted mb-2">{s.intro}</p>
              <ul className="text-sm text-foreground-muted list-disc pl-5 flex flex-col gap-1.5">
                {s.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-xs text-foreground-muted">
          Still stuck? Ask below — this assistant only knows about Crade&apos;s own features, not
          stock data (use AI Chat or the Screener for that).
        </p>
      </main>

      <HelpChatPanel />
    </div>
  );
}
