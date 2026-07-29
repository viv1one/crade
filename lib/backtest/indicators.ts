import type { HistoricalBar } from "../market-data/types";

// Pure, causal indicators — each index only looks at bars up to and
// including itself, so a strategy built on these can't leak future data
// into a signal.

export function sma(bars: HistoricalBar[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(bars.length).fill(undefined);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// Wilder's RSI.
export function rsi(bars: HistoricalBar[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(bars.length).fill(undefined);
  if (bars.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    if (delta >= 0) avgGain += delta;
    else avgLoss -= delta;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = rsiFromAverages(avgGain, avgLoss);

  for (let i = period + 1; i < bars.length; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    const gain = delta >= 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// Highest high / lowest low over the `period` bars *preceding* each index
// (current bar excluded) — used to detect breakouts.
export function rollingHigh(bars: HistoricalBar[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(bars.length).fill(undefined);
  for (let i = period; i < bars.length; i++) {
    let max = -Infinity;
    for (let j = i - period; j < i; j++) max = Math.max(max, bars[j].high);
    out[i] = max;
  }
  return out;
}

export function rollingLow(bars: HistoricalBar[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(bars.length).fill(undefined);
  for (let i = period; i < bars.length; i++) {
    let min = Infinity;
    for (let j = i - period; j < i; j++) min = Math.min(min, bars[j].low);
    out[i] = min;
  }
  return out;
}
