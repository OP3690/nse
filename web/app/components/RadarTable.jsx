"use client";

import { useMemo, useState } from "react";
import { SymbolLink } from "./ui";

// Interactive board for the Radar backtest: per-horizon accuracy cards + the full
// prediction table, both driven by the same filters. Change Min prob (or search /
// settled) and every card recomputes over the matching subset, so you can ask
// "how accurate are only the ≥85-probability picks?" and see it live. The table's
// Return / vs-NIFTY toggle swaps raw return for excess-over-index per pick.
const fmt = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
const tone = (v) => (v == null ? "text-muted" : v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted");
const cellBg = (v) => (v == null ? "" : v > 0 ? "bg-up/10" : v < 0 ? "bg-down/10" : "");
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Per-horizon accuracy over an arbitrary row subset (mirrors the pipeline's agg).
function agg(rows, k) {
  const s = rows.map((r) => r[`d${k}`]).filter((v) => v != null);
  if (!s.length) return null;
  const exc = rows.filter((r) => r[`d${k}`] != null && r[`b${k}`] != null).map((r) => r[`d${k}`] - r[`b${k}`]);
  return {
    n: s.length,
    hit: (100 * s.filter((v) => v > 0).length) / s.length,
    avg: mean(s),
    median: median(s),
    avg_excess: exc.length ? mean(exc) : null,
    beat: exc.length ? (100 * exc.filter((v) => v > 0).length) / exc.length : null,
  };
}

export default function RadarTable({ rows, horizons, total }) {
  const [q, setQ] = useState("");
  const [minProb, setMinProb] = useState(0);
  const [mode, setMode] = useState("return"); // return | excess
  const [settled, setSettled] = useState(false);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState(-1);

  const val = (r, k) => (mode === "excess"
    ? (r[`d${k}`] != null && r[`b${k}`] != null ? +(r[`d${k}`] - r[`b${k}`]).toFixed(2) : null)
    : r[`d${k}`]);

  // Row set after the (order-independent) filters — drives BOTH cards and table.
  const matched = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const maxHz = horizons[horizons.length - 1];
    return rows.filter((r) =>
      (r.prob == null || r.prob >= minProb) &&
      (!needle || `${r.symbol} ${r.company || ""}`.toUpperCase().includes(needle)) &&
      (!settled || r[`d${maxHz}`] != null));
  }, [rows, q, minProb, settled, horizons]);

  const cards = useMemo(() => horizons.map((k) => [k, agg(matched, k)]), [matched, horizons]);

  const sorted = useMemo(() => {
    const isHz = /^d\d+$/.test(sortKey);
    const out = [...matched];
    out.sort((a, b) => {
      if (sortKey === "date") return sortDir * (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
      let x = isHz ? val(a, +sortKey.slice(1)) : a[sortKey];
      let y = isHz ? val(b, +sortKey.slice(1)) : b[sortKey];
      if (x == null) x = -1e9; if (y == null) y = -1e9;
      return sortDir * (x - y);
    });
    return out;
  }, [matched, sortKey, sortDir, mode]);

  const clickSort = (k) => {
    if (k === sortKey) setSortDir((d) => -d);
    else { setSortKey(k); setSortDir(k === "symbol" ? 1 : -1); }
  };
  const arrow = (k) => (k === sortKey ? (sortDir > 0 ? " ▲" : " ▼") : "");
  const Th = ({ k, children, right }) => (
    <th className={`th cursor-pointer select-none hover:text-white ${right ? "text-right" : ""} ${k === sortKey ? "text-accent" : ""}`}
      onClick={() => clickSort(k)}>{children}{arrow(k)}</th>
  );

  return (
    <div className="space-y-6">
      {/* reactive accuracy cards */}
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h2 className="card-title mb-0">Accuracy by holding period</h2>
          <span className="text-xs text-muted">
            {minProb > 0 && <span className="chip chip-accent mr-2">prob ≥{minProb}</span>}
            <b className="text-white/90 tabular-nums">{matched.length}</b> of {total} predictions
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map(([k, s]) => (
            <div key={k} className="stat-tile">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-muted">{k}D</span>
                <span className="text-[10px] font-mono text-muted/70">n={s ? s.n : 0}</span>
              </div>
              <div className="text-2xl font-bold tabular-nums leading-none mt-1">
                {s ? s.hit.toFixed(1) : "—"}<span className="text-sm text-muted font-semibold">% hit</span>
              </div>
              <div className="h-1.5 rounded-full bg-down/30 overflow-hidden flex mt-1">
                <span className="bg-up/80 h-full" style={{ width: `${s ? s.hit : 0}%` }} />
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] font-mono">
                <div className="flex justify-between"><span className="text-muted font-sans">Avg</span><span className={tone(s?.avg)}>{fmt(s?.avg)}</span></div>
                <div className="flex justify-between"><span className="text-muted font-sans">Median</span><span className={tone(s?.median)}>{fmt(s?.median)}</span></div>
                <div className="flex justify-between border-t border-line/50 pt-0.5 mt-0.5"><span className="text-muted font-sans">vs NIFTY</span><span className={tone(s?.avg_excess)}>{fmt(s?.avg_excess)}</span></div>
                <div className="flex justify-between"><span className="text-muted font-sans">Beat idx</span><span className="text-white/80">{s?.beat == null ? "—" : `${s.beat.toFixed(1)}%`}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* prediction table */}
      <div className="card p-5">
        <h2 className="card-title mb-3">Every prediction</h2>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="inline-flex rounded-lg border border-line/70 bg-panel2/40 p-0.5 text-[11px] font-semibold">
            {[["return", "Return"], ["excess", "vs NIFTY"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
                className={`px-2.5 py-1 rounded-md transition-colors ${mode === k ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>{l}</button>
            ))}
          </div>
          <label className="text-xs text-muted flex items-center gap-1.5">Min prob
            <select value={minProb} onChange={(e) => setMinProb(+e.target.value)}
              className="rounded-lg border border-line/70 bg-panel2/40 px-2 py-1.5 text-xs text-white/90">
              <option value={0}>any</option>
              <option value={70}>≥70</option>
              <option value={75}>≥75</option>
              <option value={80}>≥80</option>
              <option value={85}>≥85</option>
              <option value={90}>≥90</option>
            </select>
          </label>
          <label className="text-xs text-muted flex items-center gap-1.5">
            <input type="checkbox" checked={settled} onChange={(e) => setSettled(e.target.checked)} /> Settled only
          </label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol…"
            className="rounded-lg border border-line/70 bg-panel2/40 px-2.5 py-1.5 text-xs text-white/90 placeholder:text-muted/70 w-[130px]" />
          <span className="ml-auto text-xs text-muted"><b className="text-white/90">{sorted.length}</b> of {rows.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <Th k="date">Date</Th>
                <Th k="symbol">Stock</Th>
                <Th k="prob" right>Prob</Th>
                {horizons.map((k) => <Th key={k} k={`d${k}`} right>{k}D</Th>)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={`${r.date}-${r.symbol}-${i}`} className="hover:bg-panel2/50">
                  <td className="td font-mono text-xs text-muted">{r.date}</td>
                  <td className="td">
                    <SymbolLink symbol={r.symbol} name={r.company} />
                    {r.sector && <div className="text-[10px] text-muted truncate max-w-[150px]">{r.sector}</div>}
                  </td>
                  <td className="td text-right">
                    <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent">{r.prob == null ? "—" : `${r.prob.toFixed(0)}%`}</span>
                  </td>
                  {horizons.map((k) => {
                    const v = val(r, k);
                    return <td key={k} className={`td text-right font-mono tabular-nums ${tone(v)} ${cellBg(v)}`}>{fmt(v)}</td>;
                  })}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={3 + horizons.length} className="td text-center text-muted py-8">No predictions match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted/80 leading-snug mt-2">
          {mode === "excess"
            ? "Excess = the pick's return minus the NIFTY 50 return over the identical holding window. Positive = it beat holding the index."
            : "Raw forward return from the prediction-day close over N real trading days. Toggle “vs NIFTY” for excess over the index."}
        </p>
      </div>
    </div>
  );
}
