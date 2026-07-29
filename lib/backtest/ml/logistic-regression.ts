// From-scratch binary logistic regression (batch gradient descent) — no ML
// dependency, since this runs in a Node/serverless app rather than a Python
// environment with numpy/sklearn available.
export interface LogisticRegressionModel {
  weights: number[];
  bias: number;
  featureMeans: number[];
  featureStdDevs: number[];
}

function standardize(X: number[][]): { normalized: number[][]; means: number[]; stdDevs: number[] } {
  const numFeatures = X[0]?.length ?? 0;
  const means = new Array(numFeatures).fill(0);
  const stdDevs = new Array(numFeatures).fill(1);

  for (let f = 0; f < numFeatures; f++) {
    const values = X.map((row) => row[f]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    means[f] = mean;
    stdDevs[f] = Math.sqrt(variance) || 1; // avoid divide-by-zero on a constant feature
  }

  const normalized = X.map((row) => row.map((v, f) => (v - means[f]) / stdDevs[f]));
  return { normalized, means, stdDevs };
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function trainLogisticRegression(
  X: number[][],
  y: number[],
  options: { epochs?: number; learningRate?: number } = {}
): LogisticRegressionModel {
  const epochs = options.epochs ?? 200;
  const learningRate = options.learningRate ?? 0.1;
  const { normalized, means, stdDevs } = standardize(X);
  const numFeatures = normalized[0]?.length ?? 0;
  const n = normalized.length;

  const weights = new Array(numFeatures).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(numFeatures).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const z = normalized[i].reduce((sum, x, f) => sum + weights[f] * x, bias);
      const error = sigmoid(z) - y[i];
      for (let f = 0; f < numFeatures; f++) gradW[f] += error * normalized[i][f];
      gradB += error;
    }
    for (let f = 0; f < numFeatures; f++) weights[f] -= (learningRate * gradW[f]) / n;
    bias -= (learningRate * gradB) / n;
  }

  return { weights, bias, featureMeans: means, featureStdDevs: stdDevs };
}

export function predictProba(model: LogisticRegressionModel, x: number[]): number {
  const normalized = x.map((v, f) => (v - model.featureMeans[f]) / model.featureStdDevs[f]);
  const z = normalized.reduce((sum, v, f) => sum + model.weights[f] * v, model.bias);
  return sigmoid(z);
}
