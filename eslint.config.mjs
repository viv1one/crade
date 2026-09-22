import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next@16 exports native flat configs directly (Linter.Config[])
// instead of the legacy shareable-config names FlatCompat.extends() expected
// — the old `compat.extends("next/core-web-vitals", "next/typescript")`
// double-wraps an already-flat config through the legacy compat layer and
// throws "Converting circular structure to JSON". No @eslint/eslintrc
// dependency needed anymore.
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // The bundled eslint-plugin-react-hooks jumped major versions with this
    // upgrade and added two new stricter Effect rules that flag this app's
    // established "fetch on mount" idiom — `useEffect(() => { load(); },
    // [...])` calling a state-setting async function, and a `.join(",")`
    // (or similar computed) dependency-array entry used deliberately to
    // avoid re-triggering on array identity rather than content. Both
    // patterns are used consistently across ~6 files (watchlist, portfolio,
    // holdings, screener, alerts, backtest, chat panels) as the app's
    // standard client-fetch pattern, not accidental — rewriting that
    // architecture is a separate, much larger change than a Next.js version
    // bump, so these are turned off rather than silencing 9 individual call
    // sites or blocking the upgrade on an unplanned refactor.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/use-memo": "off",
    },
  },
];

export default eslintConfig;
