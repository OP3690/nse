"use client";

import { useState } from "react";
import StockTip from "./StockTip";
import InfoDot from "./InfoDot";

const pctClass = (v) => (v == null ? "text-muted" : v >= 0 ? "text-up" : "text-down");
const fmtPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`);
const Sym = ({ s, name }) => <StockTip symbol={s} name={name} />;

// today's gainers / losers — magnitude bar scaled to the column's top move
function TodayList({ rows, up }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pct_change || 0)));
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.symbol} className="flex items-center gap-2 text-sm row-hover -mx-1.5 px-1.5 py-1 rounded-lg">
          <div className="w-24 truncate"><Sym s={r.symbol} name={r.company} /></div>
          <div className="flex-1 h-1.5 rounded bg-line overflow-hidden">
            <div className={`${up ? "bg-up" : "bg-down"} h-full rounded`}
              style={{ width: `${Math.min(100, (Math.abs(r.pct_change || 0) / max) * 100)}%` }} />
          </div>
          <div className="w-16 text-right font-mono tabular-nums text-xs">
            <span className={pctClass(r.pct_change)}>{fmtPct(r.pct_change)}</span>
          </div>
          <div className="w-16 text-right font-mono tabular-nums text-[11px] text-muted">
            {r.close != null ? Number(r.close).toLocaleString("en-IN") : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

// generic streak/consistency/year column with a highlighted metric chip
function MetricList({ rows, up, metric }) {
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.symbol} className="flex items-center justify-between gap-2 text-sm row-hover -mx-1.5 px-1.5 py-1 rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            <Sym s={r.symbol} name={r.company} />
            {r.sector && <span className="text-muted text-[11px] truncate hidden sm:inline">{r.sector}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {metric === "streak" && (
              <>
                <span className={`chip text-[10px] ${up ? "chip-up" : "chip-down"}`}>{r.streak}d</span>
                <span className={`font-mono text-xs tabular-nums ${pctClass(r.ret_streak)}`}>{fmtPct(r.ret_streak)}</span>
              </>
            )}
            {metric === "consistency" && (
              <>
                <span className="font-mono text-xs tabular-nums text-muted">{r.up_ratio}% up-days</span>
                <span className={`font-mono text-xs tabular-nums ${pctClass(r.ret_1y)}`}>{fmtPct(r.ret_1y)}</span>
              </>
            )}
            {metric === "year" && (
              <span className={`font-mono text-sm font-bold tabular-nums ${pctClass(r.ret_1y)}`}>
                {r.ret_1y >= 0 ? "+" : ""}{Number(r.ret_1y).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="text-xs text-muted py-2">No qualifying stocks.</div>}
    </div>
  );
}

const TABS = [
  { key: "streak", label: "Continued Runs · 5d+",
    desc: "Stocks closing same-direction for 3+ straight sessions (≥1.5% over the run).",
    up: ["streak_up", "Winning Streaks"], down: ["streak_down", "Losing Streaks"], metric: "streak" },
  { key: "year", label: "1-Year Movers",
    desc: "Biggest gainers and losers over the trailing ~250 sessions.",
    up: ["best_1y", "Top Gainers · 1Y"], down: ["worst_1y", "Top Losers · 1Y"], metric: "year" },
  { key: "consistency", label: "1-Year Consistency",
    desc: "Most up-day-heavy vs down-day-heavy stocks over the year (≥200 sessions).",
    up: ["consistent_up", "Mostly Gaining"], down: ["consistent_down", "Mostly Falling"], metric: "consistency" },
];

export default function MoversBoard({ movers }) {
  const [tab, setTab] = useState("streak");
  const active = TABS.find((t) => t.key === tab);
  const [upKey, upTitle] = active.up;
  const [downKey, downTitle] = active.down;

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap"><span>Top Gainers & Losers</span><InfoDot topic="movers.board" /></h2>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            Today's biggest moves plus history-aware reads the raw NSE board can't give —
            multi-session streaks and 1-year performance & consistency.
          </p>
        </div>
      </div>

      {/* today's gainers / losers */}
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-up" />
            <span className="text-sm font-bold text-up">Today's Gainers</span>
          </div>
          <TodayList rows={movers.gainers.slice(0, 8)} up />
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-down" />
            <span className="text-sm font-bold text-down">Today's Losers</span>
          </div>
          <TodayList rows={movers.losers.slice(0, 8)} up={false} />
        </div>
      </div>

      {/* tabbed history reads */}
      <div className="mt-6 pt-5 border-t border-line/60">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`chip text-xs transition ${tab === t.key ? "chip-accent" : "chip-muted hover:brightness-125"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted mb-4">{active.desc}</p>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <div className="text-sm font-bold text-up mb-2">{upTitle}</div>
            <MetricList rows={movers[upKey].slice(0, 8)} up metric={active.metric} />
          </div>
          <div>
            <div className="text-sm font-bold text-down mb-2">{downTitle}</div>
            <MetricList rows={movers[downKey].slice(0, 8)} up={false} metric={active.metric} />
          </div>
        </div>
      </div>
    </section>
  );
}
