export interface Holding {
  symbol: string;
  qty: number;
  avgCost: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  timestamp: number;
  realizedPnl?: number; // present on sells
}

export interface PortfolioState {
  cash: number;
  holdings: Record<string, Holding>;
  trades: Trade[];
}

export const STARTING_CASH = 100_000;
