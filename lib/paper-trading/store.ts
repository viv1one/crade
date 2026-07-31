import { PortfolioState, STARTING_CASH, Trade } from "./types";
import { AppError } from "../api-error";

export function createEmptyPortfolio(): PortfolioState {
  return { cash: STARTING_CASH, holdings: {}, trades: [] };
}

function makeTradeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Simulated fills only — no order routing, no broker. Trades execute
// immediately at the price passed in (the last quote fetched client-side).
export function applyBuy(
  state: PortfolioState,
  symbol: string,
  qty: number,
  price: number
): PortfolioState {
  if (qty <= 0) throw new AppError("Quantity must be greater than zero");
  const cost = qty * price;
  if (cost > state.cash) throw new AppError("Insufficient paper cash for this trade");

  const existing = state.holdings[symbol];
  const newQty = (existing?.qty ?? 0) + qty;
  const newAvgCost = existing
    ? (existing.qty * existing.avgCost + cost) / newQty
    : price;

  const trade: Trade = {
    id: makeTradeId(),
    symbol,
    side: "buy",
    qty,
    price,
    timestamp: Date.now(),
  };

  return {
    cash: state.cash - cost,
    holdings: {
      ...state.holdings,
      [symbol]: { symbol, qty: newQty, avgCost: newAvgCost },
    },
    trades: [trade, ...state.trades],
  };
}

export function applySell(
  state: PortfolioState,
  symbol: string,
  qty: number,
  price: number
): PortfolioState {
  if (qty <= 0) throw new AppError("Quantity must be greater than zero");
  const existing = state.holdings[symbol];
  if (!existing || qty > existing.qty) {
    throw new AppError(`You only hold ${existing?.qty ?? 0} of ${symbol}`);
  }

  const proceeds = qty * price;
  const realizedPnl = (price - existing.avgCost) * qty;
  const remainingQty = existing.qty - qty;

  const holdings = { ...state.holdings };
  if (remainingQty === 0) {
    delete holdings[symbol];
  } else {
    holdings[symbol] = { symbol, qty: remainingQty, avgCost: existing.avgCost };
  }

  const trade: Trade = {
    id: makeTradeId(),
    symbol,
    side: "sell",
    qty,
    price,
    timestamp: Date.now(),
    realizedPnl,
  };

  return {
    cash: state.cash + proceeds,
    holdings,
    trades: [trade, ...state.trades],
  };
}
