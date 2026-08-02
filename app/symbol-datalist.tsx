import { NIFTY_50 } from "@/lib/screener/universe";

export const SYMBOL_SUGGESTIONS_ID = "nifty50-symbol-suggestions";

// Shared by every symbol input across the app — one <datalist>, referenced
// by list={SYMBOL_SUGGESTIONS_ID} from any input. Native browser autocomplete
// matches against both the option's value (the ticker) and its visible text
// (the company name), so typing "ad" surfaces ADANIENT.NS/ADANIPORTS.NS
// whether the user thinks in tickers or names.
export function SymbolDatalist() {
  return (
    <datalist id={SYMBOL_SUGGESTIONS_ID}>
      {NIFTY_50.map((s) => (
        <option key={s.symbol} value={s.symbol}>
          {s.name}
        </option>
      ))}
    </datalist>
  );
}
