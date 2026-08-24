"use client";

import { useMemo, useState } from "react";
import { Pct, SignalBadge, OiBadge, Score, SymbolLink } from "./ui";

// Interactive smart-money leaderboard for the dashboard. The server hands us the
// scored universe down to a floor (score >= 50) plus market-wide breadth counts.
// The user filters by minimum score, sector, an OI-signal toggle, and a symbol
// search, and sorts by any numeric column — so "show me only names smart money
// is genuinely accumulating" is one click, not a trip to the full screener.

const THRESHOLDS = [50, 60, 70, 80, 90];
const fmtCr = (n) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 1 })}`;

// Sort keys → accessor. Score is the default (desc).
const SORTS = {
  score: (r) => r.score ?? -1,
  pct_change: (r) => r.pct_change ?? -999,
  deliv_pct: (r) => r.deliv_pct ?? -1,
  vol_surge: (r) => r.vol_surge ?? -1,
  inst_net_cr: (r) => r.inst_net_cr ?? -1e9,
};

export default function SmartMoneyBoard({ rows, breadth }) {
  const [minScore, setMinScore] = useState(60);
  const [sector, setSector] = useState("All");
  const [oiOnly, setOiOnly] = useState(false);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("score");
  const [showAll, setShowAll] = useState(false);

  const sectors = useMemo(() => {
    const s = new Set(rows.map((r) => r.sector).filter(Boolean));
    return ["All", ...[...s].sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const out = rows.filter((r) => {
      if ((r.score ?? 0) < minScore) return false;
      if (sector !== "All" && r.sector !== sector) return false;
      if (oiOnly && !r.oi_label) return false;
      if (needle && !(`${r.symbol} ${r.company || ""}`.toUpperCase().includes(needle))) return false;
      return true;
    });
    const acc = SORTS[sortKey] || SORTS.score;
    return out.sort((a, b) => acc(b) - acc(a));
  }, [rows, minScore, sector, oiOnly, q, sortKey]);

  const shown = showAll ? filtered : filtered.slice(0, 25);

  const SortTh = ({ k, children, align = "right" }) => (
    <th className={`th ${align === "right" ? "text-right" : ""} cursor-pointer select-none hover:text-white`}
      onClick={() => setSortKey(k)} title="Sort by this column">
      <span className={sortKey === k ? "text-accent" : ""}>{children}{sortKey === k ? " ↓" : ""}</span>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* market-wide smart-money breadth read */}
      {breadth && (
        <div className="rounded-xl border border-line bg-panel2/40 p-3">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Smart-money breadth</span>
            <span className="text-[11px] text-muted">{breadth.scored.toLocaleString("en-IN")} liquid names scored today</span>
          </div>
          <div className="flex gap-3 flex-wrap text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-up" /> Elite ≥80 <b className="text-up tabular-nums">{breadth.elite}</b>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent" /> Strong 60–79 <b className="text-accent tabular-nums">{breadth.strong}</b>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-muted" /> Building 50–59 <b className="text-white/80 tabular-nums">{breadth.building}</b>
            </span>
          </div>
          <p className="text-[11px] text-muted/90 mt-2 leading-snug">{breadth.read}</p>
        </div>
      )}

      {/* filter controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line/70 bg-panel2/40 p-0.5 text-[11px] font-semibold">
          {THRESHOLDS.map((t) => (
            <button key={t} type="button" onClick={() => setMinScore(t)} aria-pressed={minScore === t}
              className={`px-2.5 py-1 rounded-md transition-colors ${minScore === t ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>
              ≥{t}
            </button>
          ))}
        </div>
        <select value={sector} onChange={(e) => setSector(e.target.value)}
          className="rounded-lg border border-line/70 bg-panel2/40 px-2.5 py-1.5 text-xs text-white/90 max-w-[160px]">
          {sectors.map((s) => <option key={s} value={s}>{s === "All" ? "All sectors" : s}</option>)}
        </select>
        <button type="button" onClick={() => setOiOnly((v) => !v)} aria-pressed={oiOnly}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${oiOnly ? "border-accent/50 text-accent bg-accent/10" : "border-line/70 text-muted hover:text-white"}`}>
          F&amp;O signal
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol…"
          className="rounded-lg border border-line/70 bg-panel2/40 px-2.5 py-1.5 text-xs text-white/90 placeholder:text-muted/70 w-[130px] focus:w-[170px] transition-[width]" />
        <span className="ml-auto text-xs text-muted">
          <b className="text-white/90 tabular-nums">{filtered.length}</b> match{filtered.length === 1 ? "" : "es"}
        </span>
      </div>

      {/* leaderboard */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Symbol</th>
              <th className="th hidden sm:table-cell">Sector</th>
              <th className="th text-right">Price</th>
              <SortTh k="pct_change">Chg</SortTh>
              <SortTh k="deliv_pct">Deliv %</SortTh>
              <SortTh k="vol_surge">Vol Surge</SortTh>
              <SortTh k="inst_net_cr">Inst net</SortTh>
              <th className="th hidden md:table-cell">OI</th>
              <th className="th hidden lg:table-cell">Signal</th>
              <SortTh k="score">Score</SortTh>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.symbol} className="hover:bg-panel2/50">
                <td className="td"><SymbolLink symbol={e.symbol} name={e.company} /></td>
                <td className="td text-muted text-xs max-w-[140px] truncate hidden sm:table-cell">{e.sector || "—"}</td>
                <td className="td text-right font-mono">{e.close?.toLocaleString("en-IN")}</td>
                <td className="td text-right"><Pct value={e.pct_change} /></td>
                <td className="td text-right font-mono">{e.deliv_pct != null ? `${e.deliv_pct.toFixed(0)}%` : "—"}</td>
                <td className="td text-right font-mono">{e.vol_surge ? `${e.vol_surge.toFixed(1)}×` : "—"}</td>
                <td className={`td text-right font-mono text-xs ${e.inst_net_cr > 0 ? "text-up" : e.inst_net_cr < 0 ? "text-down" : "text-muted"}`}>
                  {e.inst_net_cr != null ? fmtCr(e.inst_net_cr) : "—"}
                </td>
                <td className="td hidden md:table-cell"><OiBadge label={e.oi_label} /></td>
                <td className="td hidden lg:table-cell"><SignalBadge signal={e.signal} /></td>
                <td className="td"><Score value={e.score} /></td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={10} className="td text-center text-muted py-8">No stocks match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 25 && (
        <button type="button" onClick={() => setShowAll((v) => !v)}
          className="w-full text-xs text-accent hover:text-white transition-colors py-1">
          {showAll ? "Show top 25" : `Show all ${filtered.length} →`}
        </button>
      )}
    </div>
  );
}
