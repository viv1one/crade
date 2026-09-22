import type { TradeAction } from "./types";

// Two ideas borrowed directly from TauricResearch's TradingAgents repo
// (agents/utils/rating.py, agents/schemas.py's _coerce_optional_float),
// adapted to Crade's simpler "ask for JSON" prompting style rather than
// their provider-native structured-output binding:
//
// 1. extractAction: a deterministic second-chance parser for when the
//    model doesn't return valid JSON despite being asked to (wraps it in
//    prose, truncates it, etc.) — tries a labelled "action: X" line first,
//    then falls back to a single standalone action word, matching their
//    two-pass extract_rating strategy. Returns null (not a guess) when
//    neither pass finds an unambiguous answer, since a decision that can't
//    be read isn't a Hold — see TradeAction's "review" state.
// 2. coerceOptionalPrice: LLMs sometimes write "N/A", a percentage, or a
//    "$1,234.50"-formatted string into a price field instead of a plain
//    number or omitting it. Coerce what can be salvaged, drop the rest
//    (never guess a price from a percentage — that would put a stop-loss
//    at the wrong absolute level) rather than failing the whole parse.

const ACTIONS: TradeAction[] = ["buy", "sell", "hold"];
const LABEL_RE = /\b(action|decision)\b[^:\-]*[:\-]\s*\**\s*(buy|sell|hold)/i;
const WORD_RE = new RegExp(`\\b(${ACTIONS.join("|")})\\b`, "gi");

export function extractAction(text: string): TradeAction | null {
  if (!text) return null;

  const labelMatch = text.match(LABEL_RE);
  if (labelMatch) return labelMatch[2].toLowerCase() as TradeAction;

  const found = new Set(
    [...text.matchAll(WORD_RE)].map((m) => m[1].toLowerCase() as TradeAction)
  );
  return found.size === 1 ? [...found][0] : null;
}

const NULLISH = new Set(["", "none", "n/a", "na", "null", "nil", "-", "tbd", "unknown"]);

export function coerceOptionalPrice(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (NULLISH.has(text.toLowerCase()) || text.endsWith("%")) return undefined;
  const cleaned = text.replace(/,/g, "").replace(/^[₹$€£]/, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}
