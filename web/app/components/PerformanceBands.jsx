"use client";

import { useState, useMemo } from "react";
import StockTip from "./StockTip";
import InfoDot from "./InfoDot";

const WINDOWS = [
  ["1m", "1 Month"],
  ["3m", "3 Months"],
];

const UP = "22 199 132";   // #16c784
const DOWN = "234 57 67";  // #ea3943

const fmtRet = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`);

// Full / compact labels for a gainer band given its lower / upper edge.
function gainLabel(lo, hi) {
  return hi == null ? `+${lo}% and above` : `+${lo}% to +${hi}%`;
}
function gainShort(lo, hi) {
  return hi == null ? `${lo}+` : `${lo}–${hi}`;
}
// `hi` is the shallower (closer-to-zero) edge for a decliner band.
function lossLabel(hi, lo) {
  return lo == null ? `${hi}% and below` : `${hi}% to ${lo}%`;
}
function lossShort(hi, lo) {
  return lo == null ? `${Math.abs(hi)}+` : `${Math.abs(lo)}–${Math.abs(hi)}`;
}

// Diverging distribution: decliner bars (red) left of a zero divider, gainer
// bars (green) right. Bar height ∝ count; deeper magnitudes render more vivid.
function Distribution({ bars }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  // splice a divider marker where the sign flips so left/right read as a gap
  const cells = [];
  bars.forEach((b, i) => {
    if (i > 0 && bars[i - 1].side !== b.side) cells.push({ divider: true, key: `div${i}` });
    cells.push({ ...b, key: `bar${i}` });
  });
  return (
    <div className="rounded-xl border border-line bg-panel2/30 px-3 pt-3 pb-2">
      <div className="flex items-end gap-1.5 h-28">
        {cells.map((b) =>
          b.divider ? (
            <div key={b.key} className="w-px self-stretch bg-line/80 mx-0.5" />
          ) : (
            <div key={b.key} title={`${b.full}: ${b.count}`}
              className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 group">
              <span className="text-[10px] font-mono tabular-nums text-muted group-hover:text-white transition">{b.count || ""}</span>
              <div className="w-full rounded-t-sm transition-all group-hover:brightness-125"
                style={{ height: `${b.count ? Math.max(4, (b.count / max) * 92) : 2}px`, backgroundColor: `rgb(${b.rgb} / ${b.alpha})` }} />
            </div>
          )
        )}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {cells.map((b) =>
          b.divider ? (
            <div key={b.key} className="w-px mx-0.5" />
          ) : (
            <span key={b.key} className={`flex-1 text-center text-[9px] font-mono tabular-nums ${b.side === "up" ? "text-up/70" : "text-down/70"}`}>
              {b.short}
            </span>
          )
        )}
      </div>
    </div>
  );
}

// One band card: header (label + count) with a count-share fill bar, then list.
function BandCard({ title, count, share, items, gain }) {
  const accent = gain ? "text-up" : "text-down";
  const rgb = gain ? UP : DOWN;
  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-3 flex flex-col min-w-0 transition hover:border-line/0 hover:ring-1 hover:ring-line">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-bold tabular-nums ${accent}`}>{title}</span>
        <span className="font-mono text-xs font-semibold text-white tabular-nums shrink-0">{count}</span>
      </div>
      <div className="h-1 rounded-full bg-line/60 overflow-hidden my-2">
        <div className="h-full rounded-full" style={{ width: `${Math.max(4, share * 100)}%`, backgroundColor: `rgb(${rgb} / 0.85)` }} />
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

  const view = useMemo(() => {
    const set = data?.[win];
    if (!set) return null;
    const gainers = (set.gainers || []).filter((b) => b.count > 0);
    const losers = (set.losers || []).filter((b) => b.count > 0);
    const maxGain = Math.max(1, ...gainers.map((b) => b.count));
    const maxLoss = Math.max(1, ...losers.map((b) => b.count));

    // diverging bars: deepest loss → … → deepest gain
    const lossBars = [...(set.losers || [])].reverse().map((b, i, a) => ({
      side: "down", rgb: DOWN, alpha: 1 - 0.45 * (i / (a.length - 1 || 1)),
      count: b.count, full: lossLabel(b.hi, b.lo), short: lossShort(b.hi, b.lo),
    }));
    const gainBars = (set.gainers || []).map((b, i, a) => ({
      side: "up", rgb: UP, alpha: 0.55 + 0.45 * (i / (a.length - 1 || 1)),
      count: b.count, full: gainLabel(b.lo, b.hi), short: gainShort(b.lo, b.hi),
    }));

    return { set, gainers, losers, maxGain, maxLoss, bars: [...lossBars, ...gainBars] };
  }, [data, win]);

  if (!view) return null;
  const { set, gainers, losers, maxGain, maxLoss, bars } = view;
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

      {/* breadth summary */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-up" />
          <span className="text-up font-mono font-semibold tabular-nums">{set.up}</span> up ≥ +5%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-down" />
          <span className="text-down font-mono font-semibold tabular-nums">{set.down}</span> down ≥ -5%
        </span>
        <span><span className="text-white font-mono tabular-nums">{set.total}</span> stocks measured · {winLabel}</span>
      </div>

      {/* distribution histogram */}
      <Distribution bars={bars} />

      {/* gainers */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-up font-semibold mb-2">Gainers</div>
        {gainers.length === 0 ? (
          <div className="text-xs text-muted">No stocks up more than +5% over the {winLabel.toLowerCase()} window.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gainers.map((b) => (
              <BandCard key={b.lo} title={gainLabel(b.lo, b.hi)} count={b.count} share={b.count / maxGain} items={b.items} gain />
            ))}
          </div>
        )}
      </div>

      {/* decliners */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-down font-semibold mb-2">Decliners</div>
        {losers.length === 0 ? (
          <div className="text-xs text-muted">No stocks down more than -5% over the {winLabel.toLowerCase()} window.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {losers.map((b) => (
              <BandCard key={b.hi} title={lossLabel(b.hi, b.lo)} count={b.count} share={b.count / maxLoss} items={b.items} />
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
