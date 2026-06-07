"use client";

import { useMemo } from "react";
import StockTip from "./StockTip";
import InfoDot from "./InfoDot";

const UP = "22 199 132";     // #16c784
const AMBER = "240 160 32";  // #f0a020
const DOWN = "234 57 67";    // #ea3943

// Drawdown bands by distance below the 52-week high (from_high is ≤ 0%).
// `hi` = shallower edge, `lo` = deeper edge. Color shifts green → amber → red.
const BANDS = [
  { key: "near", title: "Near high (≤5%)", short: "≤5", hi: 0, lo: -5, tone: "text-up", rgb: UP, alpha: 1 },
  { key: "10", title: "5–10% below", short: "5–10", hi: -5, lo: -10, tone: "text-up", rgb: UP, alpha: 0.6 },
  { key: "20", title: "10–20% below", short: "10–20", hi: -10, lo: -20, tone: "text-amber-500", rgb: AMBER, alpha: 0.85 },
  { key: "30", title: "20–30% below", short: "20–30", hi: -20, lo: -30, tone: "text-amber-500", rgb: AMBER, alpha: 0.6 },
  { key: "50", title: "30–50% below", short: "30–50", hi: -30, lo: -50, tone: "text-down", rgb: DOWN, alpha: 0.7 },
  { key: "deep", title: "50%+ below", short: "50+", hi: -50, lo: null, tone: "text-down", rgb: DOWN, alpha: 1 },
];

const TOP = 15;

// Single-direction distribution: near-high (green, left) → deep drawdown (red,
// right). Bar height ∝ count.
function Distribution({ counts }) {
  const max = Math.max(1, ...BANDS.map((b) => counts[b.key]));
  return (
    <div className="rounded-xl border border-line bg-panel2/30 px-3 pt-3 pb-2">
      <div className="flex items-end gap-2 h-28">
        {BANDS.map((b) => {
          const c = counts[b.key];
          return (
            <div key={b.key} title={`${b.title}: ${c}`}
              className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 group">
              <span className="text-[10px] font-mono tabular-nums text-muted group-hover:text-white transition">{c || ""}</span>
              <div className="w-full rounded-t-sm transition-all group-hover:brightness-125"
                style={{ height: `${c ? Math.max(4, (c / max) * 92) : 2}px`, backgroundColor: `rgb(${b.rgb} / ${b.alpha})` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-1.5">
        {BANDS.map((b) => (
          <span key={b.key} className={`flex-1 text-center text-[9px] font-mono tabular-nums ${b.tone}`}>{b.short}</span>
        ))}
      </div>
    </div>
  );
}

function BandCard({ band, items, share }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-3 flex flex-col min-w-0 transition hover:ring-1 hover:ring-line">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: `rgb(${band.rgb} / ${band.alpha})` }} />
          <span className={`text-sm font-bold ${band.tone}`}>{band.title}</span>
        </span>
        <span className="font-mono text-xs font-semibold text-white tabular-nums shrink-0">{items.length}</span>
      </div>
      <div className="h-1 rounded-full bg-line/60 overflow-hidden my-2">
        <div className="h-full rounded-full" style={{ width: `${Math.max(4, share * 100)}%`, backgroundColor: `rgb(${band.rgb} / 0.85)` }} />
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted py-1">—</div>
      ) : (
        <div className="space-y-1">
          {items.slice(0, TOP).map((s) => (
            <div key={s.symbol} className="flex items-center justify-between gap-2 text-sm min-w-0">
              <StockTip symbol={s.symbol} name={s.company}
                className="font-medium hover:text-accent cursor-pointer truncate" />
              <span className={`font-mono text-xs tabular-nums shrink-0 ${band.tone}`}>
                {s.from_high > 0 ? "+" : ""}{s.from_high.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FromHighBands({ rows }) {
  const { buckets, counts, measured, maxCount } = useMemo(() => {
    const buckets = Object.fromEntries(BANDS.map((b) => [b.key, []]));
    let measured = 0;
    for (const e of rows || []) {
      const fh = e.from_high;
      if (fh == null) continue;
      measured++;
      const b = BANDS.find((x) => fh <= x.hi && (x.lo == null || fh > x.lo));
      if (b) buckets[b.key].push(e);
    }
    for (const k of Object.keys(buckets)) buckets[k].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const counts = Object.fromEntries(BANDS.map((b) => [b.key, buckets[b.key].length]));
    const maxCount = Math.max(1, ...Object.values(counts));
    return { buckets, counts, measured, maxCount };
  }, [rows]);

  if (!measured) return null;

  const nearCount = counts.near + counts["10"];
  const deepCount = counts["50"] + counts.deep;

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
            <span>Distance from 52-Week High</span>
            <InfoDot topic="screener.from_high" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            Liquid stocks grouped by how far they've retraced from their one-year peak — from names
            sitting near fresh highs to those deep in a drawdown. Each band lists the top smart-money
            scorers; the % shows distance below the high.
          </p>
        </div>
        <span className="text-xs text-muted shrink-0">{measured.toLocaleString("en-IN")} stocks measured</span>
      </div>

      {/* breadth summary */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-up" />
          <span className="text-up font-mono font-semibold tabular-nums">{nearCount}</span> within 10% of high
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-down" />
          <span className="text-down font-mono font-semibold tabular-nums">{deepCount}</span> 30%+ below high
        </span>
      </div>

      {/* depth histogram */}
      <Distribution counts={counts} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {BANDS.map((b) => (
          <BandCard key={b.key} band={b} items={buckets[b.key]} share={counts[b.key] / maxCount} />
        ))}
      </div>

      <p className="text-[11px] text-muted flex items-start gap-1.5">
        <span className="text-amber-400 shrink-0">⚠</span>
        <span>Drawdown depth is descriptive, <span className="text-white">not investment advice</span>.
          A stock near its high may keep climbing; a deep drawdown may be value or a broken trend.</span>
      </p>
    </section>
  );
}
