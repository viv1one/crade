"use client";

interface SectorAllocation {
  sector: string;
  allocationPct: number;
}

interface SectorPieChartProps {
  sectorAllocations: SectorAllocation[];
  topHoldingPct: number;
  top3ConcentrationPct: number;
}

const SIZE = 160;
const RADIUS = 70;
const CENTER = SIZE / 2;

// A fixed, distinct palette rather than deriving colors from --accent/
// --success/etc. — those are semantic (price direction, AI content, real-
// vs-paper) and reusing them here for "which sector is which slice" would
// make an unrelated color coincidentally look like a semantic signal (e.g.
// a red slice looking like a loss). Same reasoning the spec's own "Standard
// Red/Green for market price action only" rule states directly.
const SECTOR_COLORS = [
  "#4264b6", "#a16207", "#0891b2", "#7c3aed", "#c0362c",
  "#157a3d", "#db2777", "#ca8a04", "#0d9488", "#6366f1",
];

function polarToCartesian(angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + RADIUS * Math.cos(rad), y: CENTER + RADIUS * Math.sin(rad) };
}

// Hand-rolled SVG pie chart — no charting library exists in this codebase
// (see app/backtest/equity-chart.tsx, app/journal/journal-review-chart.tsx
// for the same hand-rolled-SVG pattern this follows).
export function SectorPieChart({ sectorAllocations, topHoldingPct, top3ConcentrationPct }: SectorPieChartProps) {
  if (sectorAllocations.length === 0) {
    return <p className="text-xs text-foreground-muted">No sector data yet.</p>;
  }

  const sorted = [...sectorAllocations].sort((a, b) => b.allocationPct - a.allocationPct);
  // Cumulative start angle per slice, built immutably (no mutated closure
  // variable across the map callback) — each entry's start is the running
  // sum of every prior slice's sweep.
  const startAngles = sorted.reduce<number[]>((acc, s, i) => {
    const prevEnd = i === 0 ? 0 : acc[i - 1] + (sorted[i - 1].allocationPct / 100) * 360;
    acc.push(prevEnd);
    return acc;
  }, []);
  const slices = sorted.map((s, i) => {
    const startAngle = startAngles[i];
    const sweepAngle = (s.allocationPct / 100) * 360;
    const endAngle = startAngle + sweepAngle;
    const start = polarToCartesian(startAngle);
    const end = polarToCartesian(endAngle);
    const largeArc = sweepAngle > 180 ? 1 : 0;
    // A single 100%-allocation slice can't be drawn as one arc path (start
    // and end coincide) — draw it as a full circle instead.
    const path =
      sweepAngle >= 359.99
        ? `M ${CENTER} ${CENTER - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER - 0.01} ${CENTER - RADIUS} Z`
        : `M ${CENTER},${CENTER} L ${start.x},${start.y} A ${RADIUS},${RADIUS} 0 ${largeArc} 1 ${end.x},${end.y} Z`;
    return { ...s, path, color: SECTOR_COLORS[i % SECTOR_COLORS.length] };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-40 h-40 shrink-0" role="img" aria-label="Sector allocation pie chart">
        {slices.map((s) => (
          <path key={s.sector} d={s.path} fill={s.color} stroke="var(--background)" strokeWidth={1} />
        ))}
      </svg>
      <div className="flex flex-col gap-1.5 w-full">
        <ul className="flex flex-col gap-1 text-xs">
          {slices.map((s) => (
            <li key={s.sector} className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span className="flex-1">{s.sector}</span>
              <span className="font-mono text-foreground-muted">{s.allocationPct.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-foreground-muted pt-1 border-t border-border mt-1">
          Concentration: top holding {topHoldingPct.toFixed(1)}%, top 3 {top3ConcentrationPct.toFixed(1)}% of
          value.
        </p>
      </div>
    </div>
  );
}
