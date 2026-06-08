"use client";

import { useMemo, useState } from "react";
import InfoDot from "../InfoDot";
import { SymbolLink } from "../ui";

const fmtPct = (v, d = 1) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`);
const fmtNum = (v, d = 2) => (v == null ? "—" : v.toFixed(d));

const LEADERBOARDS = [
  { key: "best_sharpe", label: "Best Risk-Adjusted (Sharpe)", metric: "sharpe", fmt: (v) => fmtNum(v), tone: (v) => (v >= 1 ? "text-up" : v >= 0 ? "text-white" : "text-down") },
  { key: "lowest_vol", label: "Calmest (Lowest Volatility)", metric: "ann_vol", fmt: (v) => `${v?.toFixed(0)}%`, tone: () => "text-accent" },
  { key: "lowest_beta", label: "Most Defensive (Lowest Beta)", metric: "beta", fmt: (v) => fmtNum(v), tone: () => "text-up" },
  { key: "highest_beta", label: "Most Aggressive (Highest Beta)", metric: "beta", fmt: (v) => fmtNum(v), tone: () => "text-down" },
];

function Board({ board, rows }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-3.5">
      <div className="font-semibold text-white text-xs mb-2">{board.label}</div>
      <ol className="space-y-1.5">
        {(rows || []).slice(0, 6).map((r, i) => (
          <li key={r.symbol} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-muted/60 font-mono w-3 text-right">{i + 1}</span>
              <SymbolLink symbol={r.symbol} name={r.company} />
            </span>
            <span className={`font-mono tabular-nums shrink-0 ${board.tone(r[board.metric])}`}>{board.fmt(r[board.metric])}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const COLS = [
  { key: "symbol", label: "Symbol", align: "left" },
  { key: "close", label: "Close", align: "right" },
  { key: "ann_ret", label: "Ann Ret", align: "right" },
  { key: "ann_vol", label: "Ann Vol", align: "right" },
  { key: "sharpe", label: "Sharpe", align: "right" },
  { key: "sortino", label: "Sortino", align: "right" },
  { key: "beta", label: "Beta", align: "right" },
  { key: "mdd", label: "Max DD", align: "right" },
];

export default function RiskLeaders({ risk }) {
  const [sortKey, setSortKey] = useState("sharpe");
  const [dir, setDir] = useState("desc");
  if (!risk || !risk.rows) return null;

  const sorted = useMemo(() => {
    const arr = [...risk.rows];
    arr.sort((a, b) => {
      if (sortKey === "symbol") return dir === "asc" ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
      const av = a[sortKey] ?? -Infinity, bv = b[sortKey] ?? -Infinity;
      return dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [risk.rows, sortKey, dir]);

  const onSort = (k) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setDir(k === "symbol" ? "asc" : "desc"); }
  };

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2">
            <span>Risk Metrics</span>
            <InfoDot topic="strategy.risk" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            Annualized return and volatility, Sharpe and Sortino ratios, beta versus an equal-weight market
            proxy, and maximum drawdown — computed from ~1 year of daily returns for the most liquid names.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {LEADERBOARDS.map((b) => <Board key={b.key} board={b} rows={risk.leaders?.[b.key]} />)}
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-line">
              {COLS.map((c) => (
                <th key={c.key} onClick={() => onSort(c.key)}
                  className={`py-2 px-2 font-semibold text-muted cursor-pointer select-none hover:text-white transition whitespace-nowrap ${
                    c.align === "right" ? "text-right" : "text-left"} ${sortKey === c.key ? "text-white" : ""}`}>
                  {c.label}{sortKey === c.key && <span className="ml-0.5 text-[9px]">{dir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.symbol} className={`border-b border-line/40 hover:bg-panel2/40 transition ${i % 2 ? "bg-panel2/15" : ""}`}>
                <td className="py-2 px-2"><SymbolLink symbol={r.symbol} name={r.company} /></td>
                <td className="py-2 px-2 text-right font-mono tabular-nums text-white">₹{r.close == null ? "—" : Number(r.close).toLocaleString("en-IN")}</td>
                <td className={`py-2 px-2 text-right font-mono tabular-nums ${(r.ann_ret ?? 0) >= 0 ? "text-up" : "text-down"}`}>{fmtPct(r.ann_ret)}</td>
                <td className="py-2 px-2 text-right font-mono tabular-nums text-muted">{r.ann_vol == null ? "—" : `${r.ann_vol.toFixed(0)}%`}</td>
                <td className={`py-2 px-2 text-right font-mono tabular-nums ${r.sharpe >= 1 ? "text-up" : r.sharpe >= 0 ? "text-white" : "text-down"}`}>{fmtNum(r.sharpe)}</td>
                <td className="py-2 px-2 text-right font-mono tabular-nums text-muted">{fmtNum(r.sortino)}</td>
                <td className="py-2 px-2 text-right font-mono tabular-nums text-muted">{fmtNum(r.beta)}</td>
                <td className="py-2 px-2 text-right font-mono tabular-nums text-down">{fmtPct(r.mdd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted flex items-start gap-1.5">
        <span className="text-amber-400 shrink-0">⚠</span>
        <span>Risk metrics are backward-looking statistics over a single ~1-year window and
          <span className="text-white"> not investment advice</span>. Volatility and beta shift over time.</span>
      </p>
    </section>
  );
}
