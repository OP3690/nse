"use client";

import { useMemo, useState } from "react";
import StockTip from "./StockTip";
import InfoDot from "./InfoDot";
import { Pct, SignalBadge, OiBadge, Score } from "./ui";

// `hide` = Tailwind responsive class that keeps the column off small screens so
// the table never needs horizontal scroll. Symbol / Chg / Score always show.
const COLUMNS = [
  ["symbol", "Symbol", false, ""],
  ["sector", "Sector", false, "hidden lg:table-cell"],
  ["close", "Price", true, "hidden sm:table-cell"],
  ["pct_change", "Chg %", true, ""],
  ["deliv_pct", "Deliv %", true, "hidden md:table-cell"],
  ["vol_surge", "Vol", true, "hidden xl:table-cell"],
  ["turnover_cr", "Turnover", true, "hidden lg:table-cell"],
  ["oi_label", "OI", false, "hidden xl:table-cell"],
  ["inst_net_cr", "Inst Net", true, "hidden xl:table-cell"],
  ["mb_prob", "MB %", true, "hidden sm:table-cell"],
  ["signal", "Signal", false, "hidden md:table-cell"],
  ["score", "Score", true, ""],
];

const SIGNALS = ["All", "Strong Accumulation", "Accumulation", "Neutral", "Distribution"];
const PAGE_SIZES = [25, 50, 100];

// Canonical display priority for the Index filter — broad tiers first. Any index
// present on the rows but missing here sorts to the end, alphabetically.
const INDEX_ORDER = [
  "Nifty 50", "Nifty Next 50", "Nifty 100", "Nifty 200", "Nifty 500",
  "Nifty Midcap 50", "Nifty Midcap 100", "Nifty Midcap 150",
  "Nifty Smallcap 250", "Nifty Microcap 250",
];

function MbCell({ value }) {
  if (value == null) return <span className="text-muted">—</span>;
  const tone = value >= 50 ? "text-up" : value >= 35 ? "text-[#c77dff]" : "text-muted";
  return <span className={`font-mono font-semibold tabular-nums ${tone}`}>{value.toFixed(0)}%</span>;
}

export default function ScreenerTable({ rows, sectors }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("All");
  const [signal, setSignal] = useState("All");
  const [index, setIndex] = useState("All");
  const [sortKey, setSortKey] = useState("score");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // index labels actually present on the rows, canonically ordered for the filter
  const indexOptions = useMemo(() => {
    const seen = new Set();
    for (const e of rows) for (const ix of e.indices || []) seen.add(ix);
    const present = [...seen];
    present.sort((a, b) => {
      const ia = INDEX_ORDER.indexOf(a), ib = INDEX_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    return present;
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toUpperCase();
    let r = rows.filter((e) => {
      if (term && !e.symbol.includes(term) && !(e.sector || "").toUpperCase().includes(term)
          && !(e.company || "").toUpperCase().includes(term)) return false;
      if (sector !== "All" && e.sector !== sector) return false;
      if (signal !== "All" && e.signal !== signal) return false;
      if (index !== "All" && !(e.indices || []).includes(index)) return false;
      return true;
    });
    r = [...r].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string") return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      return asc ? va - vb : vb - va;
    });
    return r;
  }, [rows, q, sector, signal, index, sortKey, asc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const start = (curPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const setSort = (k) => {
    if (k === sortKey) setAsc(!asc);
    else { setSortKey(k); setAsc(false); }
    setPage(1);
  };
  const onFilter = (fn) => (e) => { fn(e.target.value); setPage(1); };

  // compact page-number window around the current page
  const pageNums = useMemo(() => {
    const out = [];
    const add = (n) => { if (n >= 1 && n <= pageCount && !out.includes(n)) out.push(n); };
    add(1); add(2);
    for (let i = curPage - 1; i <= curPage + 1; i++) add(i);
    add(pageCount - 1); add(pageCount);
    out.sort((a, b) => a - b);
    const withGaps = [];
    let prev = 0;
    for (const n of out) {
      if (n - prev > 1) withGaps.push("…");
      withGaps.push(n);
      prev = n;
    }
    return withGaps;
  }, [curPage, pageCount]);

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
            <span>Full Screener</span><InfoDot topic="screener.overview" />
          </h2>
          <p className="text-xs text-muted mt-1">Every liquid stock, sortable & paginated. Click a column to sort, a symbol for its flow history.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={q} onChange={onFilter(setQ)}
          placeholder="Search symbol, company or sector…"
          className="bg-panel border border-line rounded-lg px-3 py-2 text-sm w-full sm:w-56 focus:outline-none focus:border-accent"
        />
        <select value={sector} onChange={onFilter(setSector)}
          className="bg-panel border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent">
          <option>All</option>
          {sectors.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={signal} onChange={onFilter(setSignal)}
          className="bg-panel border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent">
          {SIGNALS.map((s) => <option key={s}>{s}</option>)}
        </select>
        {indexOptions.length > 0 && (
          <select value={index} onChange={onFilter(setIndex)} title="Filter by NSE index membership"
            className="bg-panel border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent">
            <option value="All">All indices</option>
            {indexOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className="text-xs text-muted ml-auto">{filtered.length.toLocaleString("en-IN")} stocks</span>
      </div>

      <div className="rounded-xl border border-line overflow-hidden">
        <table className="w-full table-fixed">
          <thead className="bg-panel2/60">
            <tr>
              {COLUMNS.map(([key, label, num, hide]) => (
                <th key={key}
                  onClick={() => setSort(key)}
                  className={`th cursor-pointer select-none hover:text-white ${num ? "text-right" : ""} ${hide}`}>
                  {label}{sortKey === key ? (asc ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((e) => (
              <tr key={e.symbol} className="row-hover">
                <td className="td">
                  <StockTip symbol={e.symbol} name={e.company}
                    className="font-semibold hover:text-accent cursor-pointer" />
                </td>
                <td className="td text-muted text-xs truncate hidden lg:table-cell" title={e.sector || undefined}>{e.sector || "—"}</td>
                <td className="td text-right font-mono hidden sm:table-cell">{e.close?.toLocaleString("en-IN")}</td>
                <td className="td text-right"><Pct value={e.pct_change} /></td>
                <td className="td text-right font-mono hidden md:table-cell">{e.deliv_pct != null ? `${e.deliv_pct.toFixed(0)}%` : "—"}</td>
                <td className="td text-right font-mono hidden xl:table-cell">{e.vol_surge ? `${e.vol_surge.toFixed(1)}×` : "—"}</td>
                <td className="td text-right font-mono hidden lg:table-cell">{e.turnover_cr?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                <td className="td hidden xl:table-cell"><OiBadge label={e.oi_label} /></td>
                <td className="td text-right font-mono hidden xl:table-cell">{e.inst_net_cr != null ? (e.inst_net_cr > 0 ? "+" : "") + e.inst_net_cr : "—"}</td>
                <td className="td text-right hidden sm:table-cell"><MbCell value={e.mb_prob} /></td>
                <td className="td hidden md:table-cell"><SignalBadge signal={e.signal} /></td>
                <td className="td"><Score value={e.score} /></td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td className="td text-muted text-sm py-6 text-center" colSpan={COLUMNS.length}>No stocks match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* pagination controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Rows</span>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="bg-panel border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-accent">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="hidden sm:inline">
            {filtered.length ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length.toLocaleString("en-IN")}` : "0 results"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(curPage - 1)} disabled={curPage <= 1}
            className="chip chip-muted px-2.5 py-1 disabled:opacity-40 enabled:hover:brightness-125 transition">‹ Prev</button>
          {pageNums.map((n, i) =>
            n === "…" ? (
              <span key={`g${i}`} className="px-1.5 text-xs text-muted">…</span>
            ) : (
              <button key={n} onClick={() => setPage(n)}
                className={`chip px-2.5 py-1 transition ${n === curPage ? "chip-accent" : "chip-muted hover:brightness-125"}`}>
                {n}
              </button>
            )
          )}
          <button onClick={() => setPage(curPage + 1)} disabled={curPage >= pageCount}
            className="chip chip-muted px-2.5 py-1 disabled:opacity-40 enabled:hover:brightness-125 transition">Next ›</button>
        </div>
      </div>
    </section>
  );
}
