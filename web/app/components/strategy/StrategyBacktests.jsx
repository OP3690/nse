"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import InfoDot from "../InfoDot";

const DARK = { axis: "#8a96ab", grid: "#243049", ink: "#0b0f17", fg: "#dbe2f0" };
function readChrome() {
  if (typeof document === "undefined") return DARK;
  const cs = getComputedStyle(document.documentElement);
  const trip = (n) => cs.getPropertyValue(`--${n}`).trim().split(/\s+/).join(", ");
  const muted = trip("muted"), line = trip("line"), ink = trip("ink"), fg = trip("fg");
  if (!muted || !line) return DARK;
  return { axis: `rgb(${muted})`, grid: `rgb(${line})`, ink: `rgb(${ink})`, fg: `rgb(${fg})` };
}
function useChrome() {
  const [c, setC] = useState(DARK);
  useEffect(() => {
    const u = () => setC(readChrome());
    u();
    window.addEventListener("themechange", u);
    return () => window.removeEventListener("themechange", u);
  }, []);
  return c;
}

const fmtX = (t) => {
  const d = new Date(t);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

function Metric({ label, value, tone }) {
  return (
    <div className="rounded-lg bg-panel/60 px-2.5 py-1.5">
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className={`font-mono text-sm font-semibold ${tone || "text-white"}`}>{value}</div>
    </div>
  );
}

function Curve({ bt, chrome }) {
  const up = (bt.final_mult ?? 1) >= 1;
  const stroke = up ? "#16c784" : "#ea3943";
  const data = (bt.curve || []).map((p) => ({ t: p.t, s: p.s, b: p.b }));
  const cagrTone = bt.cagr >= 0 ? "text-up" : "text-down";
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

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 6, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id={`g-${bt.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chrome.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtX} tick={{ fill: chrome.axis, fontSize: 10 }}
              stroke={chrome.grid} minTickGap={28} />
            <YAxis tick={{ fill: chrome.axis, fontSize: 10 }} stroke={chrome.grid}
              tickFormatter={(v) => `${v.toFixed(1)}×`} domain={["auto", "auto"]} width={44} />
            <ReferenceLine y={1} stroke={chrome.axis} strokeDasharray="2 4" strokeOpacity={0.5} />
            <Tooltip
              contentStyle={{ background: chrome.ink, border: `1px solid ${chrome.grid}`, borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: chrome.axis }} labelFormatter={(t) => new Date(t).toLocaleDateString("en-IN")}
              formatter={(v, n) => [`${Number(v).toFixed(3)}×`, n === "s" ? "Strategy" : "Benchmark"]} />
            <Area type="monotone" dataKey="b" stroke={chrome.axis} strokeWidth={1} strokeDasharray="4 3"
              fill="none" dot={false} />
            <Area type="monotone" dataKey="s" stroke={stroke} strokeWidth={2}
              fill={`url(#g-${bt.key})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        <Metric label="CAGR" value={`${bt.cagr >= 0 ? "+" : ""}${bt.cagr?.toFixed(1)}%`} tone={cagrTone} />
        <Metric label="vs Eq-Wt" value={`${beatBench ? "+" : ""}${(bt.cagr - bt.bench_cagr).toFixed(1)}%`}
          tone={beatBench ? "text-up" : "text-down"} />
        <Metric label="Sharpe" value={bt.sharpe?.toFixed(2)} tone={bt.sharpe >= 1 ? "text-up" : bt.sharpe >= 0 ? "text-white" : "text-down"} />
        <Metric label="Max DD" value={`${bt.max_dd?.toFixed(1)}%`} tone="text-down" />
        <Metric label="Win Rate" value={`${bt.win_rate}%`} tone={bt.win_rate >= 60 ? "text-up" : "text-white"} />
      </div>
    </div>
  );
}

export default function StrategyBacktests({ backtests }) {
  const chrome = useChrome();
  if (!backtests || !backtests.length) return null;
  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2">
            <span>Strategy Backtests</span>
            <InfoDot topic="strategy.backtests" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            Walk-forward equity curves for three rules-based portfolios, each rebalanced monthly against an
            equal-weight benchmark of the same universe. Dashed grey line is the benchmark; the 1.0× line is
            the starting capital.
          </p>
        </div>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        {backtests.map((bt) => <Curve key={bt.key} bt={bt} chrome={chrome} />)}
      </div>
      <p className="text-[11px] text-muted flex items-start gap-1.5">
        <span className="text-amber-400 shrink-0">⚠</span>
        <span>Backtests are hypothetical, ignore costs/slippage/taxes and survivorship, and are
          <span className="text-white"> not investment advice</span>. Past simulated performance does not predict future returns.</span>
      </p>
    </section>
  );
}
