"use client";

import { useMemo } from "react";
import StockTip from "./StockTip";
import InfoDot from "./InfoDot";

// Drawdown bands by distance below the 52-week high (from_high is ≤ 0%).
// `lo`/`hi` are the band edges in % (negative). `hi` = shallower edge.
const BANDS = [
  { key: "near", title: "Near high (≤5%)", hi: 0, lo: -5, tone: "text-up", dot: "bg-up" },
  { key: "10", title: "5–10% below", hi: -5, lo: -10, tone: "text-up", dot: "bg-up/70" },
  { key: "20", title: "10–20% below", hi: -10, lo: -20, tone: "text-amber-500", dot: "bg-amber-500" },
  { key: "30", title: "20–30% below", hi: -20, lo: -30, tone: "text-amber-500", dot: "bg-amber-500/70" },
  { key: "50", title: "30–50% below", hi: -30, lo: -50, tone: "text-down", dot: "bg-down/70" },
  { key: "deep", title: "50%+ below", hi: -50, lo: null, tone: "text-down", dot: "bg-down" },
];

const TOP = 15;

function BandCard({ band, items }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-3 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${band.dot}`} />
          <span className={`text-sm font-bold ${band.tone}`}>{band.title}</span>
        </span>
        <span className="chip chip-muted text-[10px] shrink-0">{items.length}</span>
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
  const { buckets, measured } = useMemo(() => {
    const buckets = Object.fromEntries(BANDS.map((b) => [b.key, []]));
    let measured = 0;
    for (const e of rows || []) {
      const fh = e.from_high;
      if (fh == null) continue;
      measured++;
      const b = BANDS.find((x) => fh <= x.hi && (x.lo == null || fh > x.lo));
      if (b) buckets[b.key].push(e);
    }
    // surface the strongest smart-money names first within each band
    for (const k of Object.keys(buckets)) buckets[k].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return { buckets, measured };
  }, [rows]);

  if (!measured) return null;

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

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {BANDS.map((b) => (
          <BandCard key={b.key} band={b} items={buckets[b.key]} />
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
