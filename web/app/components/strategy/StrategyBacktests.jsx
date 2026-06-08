"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import InfoDot from "../InfoDot";
import { useChrome } from "./_util";

const COLORS = { momentum: "#16c784", lowvol: "#60a5fa", hi52: "#f59e0b" };
const fmtX = (t) => new Date(t).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

function Metric({ label, value, tone }) {
  return (
    <div className="rounded-lg bg-panel/60 px-2.5 py-1.5">
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className={`font-mono text-sm font-semibold ${tone || "text-white"}`}>{value}</div>
    </div>
  );
}

// running peak → drawdown series for the strategy equity
function drawdown(curve) {
  let peak = -Infinity;
  return curve.map((p) => {
    peak = Math.max(peak, p.s);
    return { t: p.t, dd: +(((p.s / peak) - 1) * 100).toFixed(2) };
  });
}

function Curve({ bt, chrome }) {
  const up = (bt.final_mult ?? 1) >= 1;
  const stroke = up ? "#16c784" : "#ea3943";
  const dd = useMemo(() => drawdown(bt.curve || []), [bt.curve]);
  const beatBench = bt.cagr > bt.bench_cagr;
  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-white text-sm">{bt.label}</div>
          <div className="text-[11px] text-muted mt-0.5 max-w-md leading-snug">{bt.desc}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`font-mono font-bold ${up ? "text-up" : "text-down"}`}>{bt.final_mult?.toFixed(2)}×</div>
          <div className="text-[10px] text-muted">{bt.years}y · {bt.periods} rebalances</div>
        </div>
      </div>

      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={bt.curve} margin={{ top: 5, right: 6, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id={`g-${bt.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chrome.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtX} tick={{ fill: chrome.axis, fontSize: 10 }} stroke={chrome.grid} minTickGap={32} />
            <YAxis tick={{ fill: chrome.axis, fontSize: 10 }} stroke={chrome.grid} tickFormatter={(v) => `${v.toFixed(1)}×`} domain={["auto", "auto"]} width={42} />
            <ReferenceLine y={1} stroke={chrome.axis} strokeDasharray="2 4" strokeOpacity={0.5} />
            <Tooltip contentStyle={{ background: chrome.ink, border: `1px solid ${chrome.grid}`, borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: chrome.axis }} labelFormatter={(t) => new Date(t).toLocaleDateString("en-IN")}
              formatter={(v, n) => [`${Number(v).toFixed(3)}×`, n === "s" ? "Strategy" : "Benchmark"]} />
            <Area type="monotone" dataKey="b" stroke={chrome.axis} strokeWidth={1} strokeDasharray="4 3" fill="none" dot={false} isAnimationActive animationDuration={800} />
            <Area type="monotone" dataKey="s" stroke={stroke} strokeWidth={2} fill={`url(#g-${bt.key})`} dot={false} isAnimationActive animationDuration={900} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* underwater drawdown strip */}
      <div className="h-14">
        <div className="text-[10px] text-muted mb-0.5">Drawdown</div>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dd} margin={{ top: 2, right: 6, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id={`dd-${bt.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ea3943" stopOpacity="0" />
                <stop offset="100%" stopColor="#ea3943" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" hide />
            <YAxis domain={[(min) => Math.floor(min), 0]} tick={{ fill: chrome.axis, fontSize: 9 }} stroke={chrome.grid} tickFormatter={(v) => `${v}%`} width={42} />
            <Tooltip contentStyle={{ background: chrome.ink, border: `1px solid ${chrome.grid}`, borderRadius: 8, fontSize: 12 }}
              labelFormatter={(t) => new Date(t).toLocaleDateString("en-IN")} formatter={(v) => [`${v}%`, "Drawdown"]} />
            <Area type="monotone" dataKey="dd" stroke="#ea3943" strokeWidth={1} fill={`url(#dd-${bt.key})`} dot={false} isAnimationActive animationDuration={900} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        <Metric label="CAGR" value={`${bt.cagr >= 0 ? "+" : ""}${bt.cagr?.toFixed(1)}%`} tone={bt.cagr >= 0 ? "text-up" : "text-down"} />
        <Metric label="vs Eq-Wt" value={`${beatBench ? "+" : ""}${(bt.cagr - bt.bench_cagr).toFixed(1)}%`} tone={beatBench ? "text-up" : "text-down"} />
        <Metric label="Sharpe" value={bt.sharpe?.toFixed(2)} tone={bt.sharpe >= 1 ? "text-up" : bt.sharpe >= 0 ? "text-white" : "text-down"} />
        <Metric label="Max DD" value={`${bt.max_dd?.toFixed(1)}%`} tone="text-down" />
        <Metric label="Win Rate" value={`${bt.win_rate}%`} tone={bt.win_rate >= 60 ? "text-up" : "text-white"} />
      </div>
    </div>
  );
}

function Overlay({ backtests, chrome }) {
  const data = useMemo(() => {
    const n = Math.max(...backtests.map((b) => b.curve.length));
    const rows = [];
    for (let i = 0; i < n; i++) {
      const row = { t: backtests[0].curve[i]?.t };
      backtests.forEach((b) => { if (b.curve[i]) row[b.key] = b.curve[i].s; });
      row.bench = backtests[0].curve[i]?.b;
      rows.push(row);
    }
    return rows;
  }, [backtests]);

  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-4">
      <div className="text-sm font-semibold text-white mb-2">Head-to-head — growth of ₹1</div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -14 }}>
            <CartesianGrid stroke={chrome.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtX} tick={{ fill: chrome.axis, fontSize: 11 }} stroke={chrome.grid} minTickGap={40} />
            <YAxis tick={{ fill: chrome.axis, fontSize: 11 }} stroke={chrome.grid} tickFormatter={(v) => `${v.toFixed(2)}×`} domain={["auto", "auto"]} width={48} />
            <ReferenceLine y={1} stroke={chrome.axis} strokeDasharray="2 4" strokeOpacity={0.5} />
            <Tooltip contentStyle={{ background: chrome.ink, border: `1px solid ${chrome.grid}`, borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: chrome.axis }} labelFormatter={(t) => new Date(t).toLocaleDateString("en-IN")}
              formatter={(v, n) => [`${Number(v).toFixed(3)}×`, n === "bench" ? "Equal-weight" : n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {backtests.map((b) => (
              <Line key={b.key} type="monotone" dataKey={b.key} name={b.label.replace("Cross-Sectional ", "")}
                stroke={COLORS[b.key] || chrome.fg} strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
            ))}
            <Line type="monotone" dataKey="bench" name="Equal-weight" stroke={chrome.axis} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive animationDuration={900} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function StrategyBacktests({ backtests }) {
  const chrome = useChrome();
  const [view, setView] = useState("compare");
  if (!backtests || !backtests.length) return null;

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2">
            <span>Strategy Backtests</span>
            <InfoDot topic="strategy.backtests" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            Walk-forward equity curves for three rules-based portfolios, each rebalanced monthly against an
            equal-weight benchmark of the same universe and marked to market daily.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-line overflow-hidden text-xs shrink-0">
          {[["compare", "Compare"], ["detail", "Detail"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)}
              className={`px-3 py-1.5 transition ${view === k ? "bg-accent/15 text-white font-medium" : "text-muted hover:text-white hover:bg-panel2"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {view === "compare"
        ? <Overlay backtests={backtests} chrome={chrome} />
        : <div className="grid lg:grid-cols-3 gap-4">{backtests.map((bt) => <Curve key={bt.key} bt={bt} chrome={chrome} />)}</div>}

      <p className="text-[11px] text-muted flex items-start gap-1.5">
        <span className="text-amber-400 shrink-0">⚠</span>
        <span>Backtests are hypothetical, ignore costs/slippage/taxes and survivorship, and are
          <span className="text-white"> not investment advice</span>. Past simulated performance does not predict future returns.</span>
      </p>
    </section>
  );
}
