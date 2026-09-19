"use client";

import { useMemo, useState } from "react";
import { SymbolLink } from "./ui";

// Interactive table of every Radar prediction with per-horizon forward returns.
// The Benchmark toggle swaps raw stock return for excess-over-NIFTY (stock − index
// over the same window) — the honest test of whether a pick beat just holding the
// index. Filter by min model probability / symbol, sort any column, hide unsettled.
const fmt = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
const tone = (v) => (v == null ? "text-muted" : v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted");
const cellBg = (v) => (v == null ? "" : v > 0 ? "bg-up/10" : v < 0 ? "bg-down/10" : "");

export default function RadarTable({ rows, horizons }) {
  const [q, setQ] = useState("");
  const [minProb, setMinProb] = useState(0);
  const [mode, setMode] = useState("return"); // return | excess
  const [settled, setSettled] = useState(false);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState(-1);

  const val = (r, k) => (mode === "excess"
    ? (r[`d${k}`] != null && r[`b${k}`] != null ? +(r[`d${k}`] - r[`b${k}`]).toFixed(2) : null)
    : r[`d${k}`]);

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const maxHz = horizons[horizons.length - 1];
    const out = rows.filter((r) =>
      (r.prob == null || r.prob >= minProb) &&
      (!needle || `${r.symbol} ${r.company || ""}`.toUpperCase().includes(needle)) &&
      (!settled || r[`d${maxHz}`] != null));
    const acc = (r) => {
      if (sortKey === "date") return r.date;
      if (sortKey.startsWith("h")) return val(r, +sortKey.slice(1)) ?? -1e9;
      return r[sortKey] ?? -1e9;
    };
    return out.sort((a, b) => {
      const x = acc(a), y = acc(b);
      if (sortKey === "date") return sortDir * (x < y ? -1 : x > y ? 1 : 0);
      return sortDir * (x - y);
    });
  }, [rows, q, minProb, settled, sortKey, sortDir, mode, horizons]);

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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line/70 bg-panel2/40 p-0.5 text-[11px] font-semibold">
          {[["return", "Return"], ["excess", "vs NIFTY"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
              className={`px-2.5 py-1 rounded-md transition-colors ${mode === k ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>{l}</button>
          ))}
        </div>
        <label className="text-xs text-muted flex items-center gap-1.5">Min prob
          <select value={minProb} onChange={(e) => setMinProb(+e.target.value)}
            className="rounded-lg border border-line/70 bg-panel2/40 px-2 py-1.5 text-xs text-white/90">
            <option value={0}>any</option><option value={70}>≥70</option>
            <option value={72}>≥72</option><option value={75}>≥75</option>
          </select>
        </label>
        <label className="text-xs text-muted flex items-center gap-1.5">
          <input type="checkbox" checked={settled} onChange={(e) => setSettled(e.target.checked)} /> Settled only
        </label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol…"
          className="rounded-lg border border-line/70 bg-panel2/40 px-2.5 py-1.5 text-xs text-white/90 placeholder:text-muted/70 w-[130px]" />
        <span className="ml-auto text-xs text-muted"><b className="text-white/90">{filtered.length}</b> of {rows.length}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <Th k="date">Date</Th>
              <Th k="symbol">Stock</Th>
              <Th k="prob" right>Prob</Th>
              {horizons.map((k) => <Th key={k} k={`h${k}`} right>{k}D</Th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
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
                  return (
                    <td key={k} className={`td text-right font-mono tabular-nums ${tone(v)} ${cellBg(v)}`}>{fmt(v)}</td>
                  );
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={3 + horizons.length} className="td text-center text-muted py-8">No predictions match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted/80 leading-snug">
        {mode === "excess"
          ? "Excess = the pick's return minus the NIFTY 50 return over the identical holding window. Positive = it beat simply holding the index."
          : "Raw forward return from the prediction-day close over N real trading days. Toggle “vs NIFTY” for excess over the index."}
      </p>
    </div>
  );
}
