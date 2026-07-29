import type { HistoricalBar } from "../../market-data/types";
import { sma } from "../indicators";

// Causal, per-bar feature vectors for the ML strategy — each row only uses
// data up to and including its own bar. A row is `undefined` until every
// component's warmup window has passed (the 20-bar SMA ratio is the
// longest, so rows are valid from index 19 onward).
export const FEATURE_NAMES = [
  "return_1",
  "return_5",
  "return_10",
  "volatility_10",
  "sma_ratio_20",
  "volume_change_10",
] as const;

export function computeFeatures(bars: HistoricalBar[]): (number[] | undefined)[] {
  const n = bars.length;
  const closes = bars.map((b) => b.close);
  const sma20 = sma(bars, 20);

  const return1: (number | undefined)[] = new Array(n).fill(undefined);
  for (let i = 1; i < n; i++) return1[i] = (closes[i] - closes[i - 1]) / closes[i - 1];

  function returnOverWindow(period: number): (number | undefined)[] {
    const out: (number | undefined)[] = new Array(n).fill(undefined);
    for (let i = period; i < n; i++) out[i] = (closes[i] - closes[i - period]) / closes[i - period];
    return out;
  }
  const return5 = returnOverWindow(5);
  const return10 = returnOverWindow(10);

  const volatility10: (number | undefined)[] = new Array(n).fill(undefined);
  for (let i = 10; i < n; i++) {
    const window = return1.slice(i - 9, i + 1) as number[];
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
    volatility10[i] = Math.sqrt(variance);
  }

  const smaRatio: (number | undefined)[] = new Array(n).fill(undefined);
  for (let i = 0; i < n; i++) {
    const s = sma20[i];
    if (s !== undefined && s !== 0) smaRatio[i] = closes[i] / s - 1;
  }

  const volumeChange: (number | undefined)[] = new Array(n).fill(undefined);
  for (let i = 9; i < n; i++) {
    let sum = 0;
    for (let j = i - 9; j <= i; j++) sum += bars[j].volume;
    const avg = sum / 10;
    if (avg > 0) volumeChange[i] = bars[i].volume / avg - 1;
  }

  return bars.map((_, i) => {
    const row = [return1[i], return5[i], return10[i], volatility10[i], smaRatio[i], volumeChange[i]];
    return row.every((v): v is number => v !== undefined) ? row : undefined;
  });
}
