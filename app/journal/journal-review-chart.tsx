"use client";

import { useEffect, useMemo, useState } from "react";

interface Bar {
  time: number; // epoch seconds
  close: number;
}

interface JournalReviewChartProps {
  symbol: string;
  entryAt: string; // ISO string
  entryPrice?: number;
}

const WIDTH = 560;
const HEIGHT = 160;
const PAD = 24;

// Hand-rolled SVG line chart, deliberately the same minimal pattern as
// app/backtest/equity-chart.tsx (no charting library exists in this
// codebase, and this doesn't need that chart's hover/tooltip complexity) —
// shows what a symbol's price actually did after a journal entry was
// logged, with the entry point marked. This is "Review mode" for one entry
// at a time rather than a literal weekly-calendar view (see the plan).
export function JournalReviewChart({ symbol, entryAt, entryPrice }: JournalReviewChartProps) {
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBars(null);
    setError(null);
    fetch(`/api/history/${encodeURIComponent(symbol)}?interval=1d&range=6mo`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to fetch history");
        setBars(data.bars ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to fetch history"));
  }, [symbol]);

  const chart = useMemo(() => {
    if (!bars || bars.length === 0) return null;
    const entryTimeSec = new Date(entryAt).getTime() / 1000;
    // Only chart bars from the entry date onward — "what happened after,"
    // not the full 6-month window (falls back to the full range if the
    // entry predates all of it, e.g. an old entry with sparse history).
    const relevant = bars.filter((b) => b.time >= entryTimeSec);
    const series = relevant.length >= 2 ? relevant : bars;

    const closes = series.map((b) => b.close);
    const minY = Math.min(...closes, entryPrice ?? Infinity);
    const maxY = Math.max(...closes, entryPrice ?? -Infinity);
    const spanY = maxY - minY || 1;
    const n = series.length;
    const innerW = WIDTH - PAD * 2;
    const innerH = HEIGHT - PAD * 2;

    const points = series.map((b, i) => ({
      x: PAD + (n <= 1 ? 0 : (i / (n - 1)) * innerW),
      y: PAD + innerH - ((b.close - minY) / spanY) * innerH,
      close: b.close,
      time: b.time,
    }));
    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

    // Nearest bar to the entry timestamp, for the marker.
    let markerIndex = 0;
    let markerDist = Infinity;
    series.forEach((b, i) => {
      const d = Math.abs(b.time - entryTimeSec);
      if (d < markerDist) {
        markerDist = d;
        markerIndex = i;
      }
    });
    const marker = points[markerIndex];

    const first = points[0];
    const last = points[points.length - 1];
    const changePct = first.close !== 0 ? ((last.close - first.close) / first.close) * 100 : 0;

    return { linePath, marker, changePct, first, last };
  }, [bars, entryAt, entryPrice]);

  if (error) return <p className="text-xs text-danger">{error}</p>;
  if (!bars) return <p className="text-xs text-foreground-muted">Loading chart…</p>;
  if (!chart) return <p className="text-xs text-foreground-muted">No price history available.</p>;

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`${symbol} price since this entry, ${chart.changePct >= 0 ? "+" : ""}${chart.changePct.toFixed(1)}%`}
      >
        <path d={chart.linePath} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <line
          x1={chart.marker.x}
          x2={chart.marker.x}
          y1={PAD}
          y2={HEIGHT - PAD}
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeDasharray="2,3"
          strokeWidth={1}
        />
        <circle cx={chart.marker.x} cy={chart.marker.y} r={4} fill="var(--color-ai-accent)" stroke="var(--background)" strokeWidth={2} />
      </svg>
      <p className={`text-xs ${chart.changePct >= 0 ? "text-success" : "text-danger"}`}>
        {chart.changePct >= 0 ? "+" : ""}
        {chart.changePct.toFixed(1)}% since {new Date(chart.first.time * 1000).toLocaleDateString()}
        {" · "}now ₹{chart.last.close.toFixed(2)}
      </p>
    </div>
  );
}
