import { describe, expect, it } from "vitest";
import { predictProba, trainLogisticRegression } from "./logistic-regression";

function makeDataset(n: number): { X: number[][]; y: number[] } {
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = ((i * 37) % 21) - 10; // deterministic spread over -10..10
    const x1 = ((i * 53) % 21) - 10;
    X.push([x0, x1]);
    y.push(x0 + x1 > 0 ? 1 : 0);
  }
  return { X, y };
}

describe("trainLogisticRegression", () => {
  it("learns a linearly separable boundary", () => {
    const { X, y } = makeDataset(80);
    const model = trainLogisticRegression(X, y, { epochs: 300, learningRate: 0.5 });

    let correct = 0;
    for (let i = 0; i < X.length; i++) {
      const predicted = predictProba(model, X[i]) > 0.5 ? 1 : 0;
      if (predicted === y[i]) correct++;
    }
    expect(correct / X.length).toBeGreaterThan(0.9);
  });

  it("predicts held-out points on the correct side of the boundary", () => {
    const { X, y } = makeDataset(80);
    const model = trainLogisticRegression(X, y, { epochs: 300, learningRate: 0.5 });

    expect(predictProba(model, [8, 8])).toBeGreaterThan(0.5);
    expect(predictProba(model, [-8, -8])).toBeLessThan(0.5);
  });
});
