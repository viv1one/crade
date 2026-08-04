export type ConditionType = "price_above" | "price_below" | "rsi_below" | "volume_spike";

// Shared between app/alerts/alerts-panel.tsx (full alert creation form) and
// the quick "create an alert from this holding" action in
// app/holdings/holdings-panel.tsx — same condition vocabulary, same labels.
export const CONDITION_LABELS: Record<ConditionType, string> = {
  price_above: "Price above (₹)",
  price_below: "Price below (₹)",
  rsi_below: "RSI(14) below",
  volume_spike: "Volume ≥ N× avg",
};
