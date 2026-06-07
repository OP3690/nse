"use client";

import { useState } from "react";
import StockTip from "./StockTip";
import InfoDot from "./InfoDot";

const WINDOWS = [
  ["1m", "1 Month", 21],
  ["3m", "3 Months", 63],
];

const fmtRet = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`);

// Human label for a gainer band given its lower / upper edge (% return).
function gainLabel(lo, hi) {
  return hi == null ? `+${lo}% and above` : `+${lo}% to +${hi}%`;
}
// Human label for a loser band. `hi` is the shallower (closer-to-zero) edge.
function lossLabel(hi, lo) {
  return lo == null ? `${hi}% and below` : `${hi}% to ${lo}%`;
}

// One band card: header (label + count) and the ranked stock list.
function BandCard({ title, count, items, gain }) {
  const accent = gain ? "text-up" : "text-down";
  const dot = gain ? "bg-up" : "bg-down";
  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-3 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
          <span className={`text-sm font-bold tabular-nums ${accent}`}>{title}</span>
        </span>
        <span className="chip chip-muted text-[10px] shrink-0">{count}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted py-1">—</div>
      ) : (
        <div className="space-y-1">
          {items.map((s) => (
            <div key={s.symbol} className="flex items-center justify-between gap-2 text-sm min-w-0">
              <StockTip symbol={s.symbol} name={s.company}
                className="font-medium hover:text-accent cursor-pointer truncate" />
              <span className={`font-mono text-xs tabular-nums shrink-0 ${accent}`}>{fmtRet(s.ret)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PerformanceBands({ data }) {
  const [win, setWin] = useState("1m");
  if (!data) return null;
  const set = data[win];
  if (!set) return null;

  const gainBands = (set.gainers || []).filter((b) => b.count > 0);
  const lossBands = (set.losers || []).filter((b) => b.count > 0);
  const winLabel = WINDOWS.find(([k]) => k === win)?.[1] || "";

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
            <span>Performance Bands</span>
            <InfoDot topic="screener.return_bands" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            Liquid stocks bucketed by trailing return over the selected window — gainers and decliners
            grouped into magnitude bands so you can spot momentum leaders and the deepest drawdowns at a glance.
          </p>
        </div>
        {/* window toggle */}
        <div className="inline-flex rounded-lg border border-line overflow-hidden shrink-0">
          {WINDOWS.map(([k, label]) => (
            <button key={k} onClick={() => setWin(k)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${
                win === k ? "bg-accent text-white" : "bg-panel text-muted hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* summary breadth row */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span><span className="text-up font-mono font-semibold tabular-nums">{set.up}</span> up ≥ +5%</span>
        <span><span className="text-down font-mono font-semibold tabular-nums">{set.down}</span> down ≥ -5%</span>
        <span><span className="text-white font-mono tabular-nums">{set.total}</span> stocks measured · {winLabel}</span>
      </div>

      {/* gainers */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-up font-semibold mb-2">Gainers</div>
        {gainBands.length === 0 ? (
          <div className="text-xs text-muted">No stocks up more than +5% over the {winLabel.toLowerCase()} window.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gainBands.map((b) => (
              <BandCard key={b.lo} title={gainLabel(b.lo, b.hi)} count={b.count} items={b.items} gain />
            ))}
          </div>
        )}
      </div>

      {/* losers */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-down font-semibold mb-2">Decliners</div>
        {lossBands.length === 0 ? (
          <div className="text-xs text-muted">No stocks down more than -5% over the {winLabel.toLowerCase()} window.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lossBands.map((b) => (
              <BandCard key={b.hi} title={lossLabel(b.hi, b.lo)} count={b.count} items={b.items} />
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted flex items-start gap-1.5">
        <span className="text-amber-400 shrink-0">⚠</span>
        <span>Trailing returns are descriptive, <span className="text-white">not investment advice</span>. Past
          performance does not predict future moves.</span>
      </p>
    </section>
  );
}
