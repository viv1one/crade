"use client";

import { useMemo, useRef, useState } from "react";
import type { EquityPoint } from "@/lib/backtest/types";

interface EquityChartProps {
  equityCurve: EquityPoint[];
  startingCash: number;
}

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 56;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 12;

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const rawStep = (max - min) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

// Single-series equity curve: a 2px line, a light area wash, hairline
// recessive gridlines, and a hover crosshair + tooltip. One series needs no
// legend — the panel heading already names what's plotted.
export function EquityChart({ equityCurve, startingCash }: EquityChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;

  const { points, minY, maxY, linePath, areaPath } = useMemo(() => {
    const values = equityCurve.map((p) => p.equity);
    const minY = Math.min(startingCash, ...values);
    const maxY = Math.max(startingCash, ...values);
    const spanY = maxY - minY || 1;
    const n = equityCurve.length;

    const points = equityCurve.map((p, i) => ({
      x: PAD_LEFT + (n <= 1 ? 0 : (i / (n - 1)) * innerW),
      y: PAD_TOP + innerH - ((p.equity - minY) / spanY) * innerH,
      ...p,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const baseline = PAD_TOP + innerH;
    const areaPath =
      points.length > 0
        ? `${linePath} L${points[points.length - 1].x.toFixed(2)},${baseline} L${points[0].x.toFixed(2)},${baseline} Z`
        : "";

    return { points, minY, maxY, linePath, areaPath };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equityCurve, startingCash]);

  if (points.length === 0) {
    return <p className="text-sm text-foreground-muted">No data to chart.</p>;
  }

  const ticks = niceTicks(minY, maxY);
  const spanY = maxY - minY || 1;
  const startY = PAD_TOP + innerH - ((startingCash - minY) / spanY) * innerH;
  const hover = hoverIndex !== null ? points[hoverIndex] : null;

  const first = points[0];
  const last = points[points.length - 1];
  const returnPct = first.equity !== 0 ? ((last.equity - first.equity) / first.equity) * 100 : 0;
  const chartLabel = `Equity curve from ₹${first.equity.toFixed(0)} to ₹${last.equity.toFixed(0)} (${
    returnPct >= 0 ? "+" : ""
  }${returnPct.toFixed(1)}%) over ${points.length} data points`;
  const minPoint = points.reduce((a, b) => (b.equity < a.equity ? b : a));
  const maxPoint = points.reduce((a, b) => (b.equity > a.equity ? b : a));

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="relative w-full text-foreground">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
        role="img"
        aria-label={chartLabel}
      >
        {ticks.map((t) => {
          const y = PAD_TOP + innerH - ((t - minY) / spanY) * innerH;
          return (
            <g key={t}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeWidth={1}
              />
              <text x={PAD_LEFT - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="currentColor" opacity={0.5}>
                ₹{Math.round(t / 1000)}k
              </text>
            </g>
          );
        })}

        {/* starting-cash reference line */}
        <line
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={startY}
          y2={startY}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="2,3"
          strokeWidth={1}
        />

        <path d={areaPath} fill="currentColor" opacity={0.08} />
        <path d={linePath} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {hover && (
          <>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD_TOP}
              y2={PAD_TOP + innerH}
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeWidth={1}
            />
            <circle cx={hover.x} cy={hover.y} r={4} fill="currentColor" stroke="var(--background)" strokeWidth={2} />
          </>
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute top-1 rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-sm"
          style={{
            // Clamped so the tooltip never clips off the left/right edge of
            // the chart on a narrow (mobile) viewport, at the cost of it
            // drifting slightly from the exact hover point near either end.
            left: `${Math.min(Math.max((hover.x / WIDTH) * 100, 8), 92)}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="font-mono font-medium">₹{hover.equity.toFixed(2)}</div>
          <div className="text-foreground-muted">
            {new Date(hover.time * 1000).toLocaleDateString()}
          </div>
        </div>
      )}

      <table className="sr-only">
        <caption>Equity curve key points</caption>
        <thead>
          <tr>
            <th>Point</th>
            <th>Date</th>
            <th>Equity</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Start</td>
            <td>{new Date(first.time * 1000).toLocaleDateString()}</td>
            <td>₹{first.equity.toFixed(2)}</td>
          </tr>
          <tr>
            <td>End</td>
            <td>{new Date(last.time * 1000).toLocaleDateString()}</td>
            <td>₹{last.equity.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Minimum</td>
            <td>{new Date(minPoint.time * 1000).toLocaleDateString()}</td>
            <td>₹{minPoint.equity.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Maximum</td>
            <td>{new Date(maxPoint.time * 1000).toLocaleDateString()}</td>
            <td>₹{maxPoint.equity.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
