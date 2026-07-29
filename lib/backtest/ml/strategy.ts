import type { HistoricalBar } from "../../market-data/types";
import type { Signal, StrategyParams } from "../types";
import { computeFeatures } from "./features";
import { predictProba, trainLogisticRegression } from "./logistic-regression";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Trains on the first `trainRatio` slice of bars only (no trading during
// training — the model can't act on data it was fit to) and predicts on the
// remainder, so this is a walk-forward split rather than an in-sample fit.
export function generateMlSignals(bars: HistoricalBar[], params: StrategyParams): Signal[] {
  const features = computeFeatures(bars);
  const n = bars.length;
  const signals: Signal[] = new Array(n).fill("hold");

  // Labelable bars need both a feature row and a known next-bar close.
  const labelable: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (features[i] !== undefined) labelable.push(i);
  }
  if (labelable.length < 10) return signals;

  const trainRatio = clamp(params.trainRatio ?? 0.6, 0.3, 0.8);
  const cutoffIdx = Math.max(1, Math.floor(labelable.length * trainRatio));
  const trainIndices = labelable.slice(0, cutoffIdx);
  const cutoffBar = trainIndices[trainIndices.length - 1];

  const X = trainIndices.map((i) => features[i]!);
  const y = trainIndices.map((i) => (bars[i + 1].close > bars[i].close ? 1 : 0));
  const model = trainLogisticRegression(X, y, { epochs: 200, learningRate: 0.3 });

  const margin = clamp(params.margin ?? 0.05, 0, 0.3);
  for (let i = cutoffBar + 1; i < n; i++) {
    const row = features[i];
    if (!row) continue;
    const prob = predictProba(model, row);
    if (prob > 0.5 + margin) signals[i] = "buy";
    else if (prob < 0.5 - margin) signals[i] = "sell";
  }

  return signals;
}
