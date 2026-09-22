"use client";

interface RiskExposureEntry {
  symbol: string;
  allocationPct: number;
  volatilityPct: number;
}

interface RiskExposureChartProps {
  entries: RiskExposureEntry[];
}

// Hand-rolled horizontal bar chart — same "no charting library, plain SVG"
// pattern as sector-pie-chart.tsx/equity-chart.tsx/journal-review-chart.tsx.
// Bar length is each holding's own 60-day volatility (lib/portfolio/
// diagnostics.ts's volatilityPct) — "how risky is this position on its
// own," not an allocation-weighted composite, since the spec's "risk
// exposure" is closer to "which of my holdings carries the most risk" than
// a single blended number. Allocation % is shown alongside each bar for
// context (a highly volatile 2%-of-portfolio position matters less than a
// highly volatile 40%-of-portfolio one), not folded into the bar itself.
export function RiskExposureChart({ entries }: RiskExposureChartProps) {
  if (entries.length === 0) {
    return <p className="text-xs text-foreground-muted">No risk data yet.</p>;
  }

  const sorted = [...entries].sort((a, b) => b.volatilityPct - a.volatilityPct);
  const maxVol = Math.max(...sorted.map((e) => e.volatilityPct), 1);

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((e) => {
        const widthPct = Math.max((e.volatilityPct / maxVol) * 100, 2);
        const risky = e.volatilityPct >= maxVol * 0.66;
        return (
          <div key={e.symbol} className="flex items-center gap-2 text-xs">
            <span className="font-mono w-20 shrink-0 truncate">{e.symbol}</span>
            <div className="flex-1 h-3 rounded-full bg-background overflow-hidden">
              <div
                className={`h-full rounded-full ${risky ? "bg-danger" : "bg-warning"}`}
                style={{ width: `${widthPct}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="font-mono text-foreground-muted w-14 text-right shrink-0">
              {e.volatilityPct.toFixed(1)}%
            </span>
            <span className="text-foreground-muted w-16 text-right shrink-0" title="Share of portfolio value">
              ({e.allocationPct.toFixed(0)}% alloc)
            </span>
          </div>
        );
      })}
      <p className="text-xs text-foreground-muted pt-1 border-t border-border mt-1">
        Bar length is each holding&apos;s own 60-day volatility — not weighted by position size.
      </p>
    </div>
  );
}
