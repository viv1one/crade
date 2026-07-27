export interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  marketCap?: number;
  peRatio?: number;
  eps?: number;
  dividendYield?: number;
}
