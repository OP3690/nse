"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { useChartTheme } from "./charts";
import { SymbolLink } from "./ui";

// Basket simulator. Split the invested capital equally across a day's top picks,
// hold every leg for a FIXED horizon (1/2/5/15/30 days), then exit the whole
// basket and reinvest the freed capital equally into the next day's picks — and
// repeat. Surplus is idle reserve cash shown in net worth. Uses each pick's
// horizon return + exit date, so baskets chain by real dates with no look-ahead.
const HORIZONS = [1, 2, 5, 15, 30];
const SPLITS = [1, 2, 3];
const PROBS = [[0, "any"], [70, "≥70"], [75, "≥75"], [80, "≥80"]];
const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pctf = (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

function simulate(rows, { capital, horizon, splits, minProb }) {
  const byDate = new Map();
  for (const r of rows) {
    if (r[`d${horizon}`] == null || r[`xd${horizon}`] == null) continue;
    if (r.prob != null && r.prob < minProb) continue;
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return null;
  let cap = capital;
  let cursor = dates[0];
  const baskets = [];
  let guard = 0;
  while (guard++ < 3000) {
    const d = dates.find((x) => x >= cursor);
    if (!d) break;
    const picks = byDate.get(d).slice().sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0)).slice(0, splits);
    if (!picks.length) break;
    const per = cap / picks.length;
    let newCap = 0;
    const legs = picks.map((p) => {
      const ret = p[`d${horizon}`];
      const value = per * (1 + ret / 100);
      newCap += value;
      return { symbol: p.symbol, company: p.company, prob: p.prob, ret, value };
    });
    const exitDate = picks[0][`xd${horizon}`];
    const before = cap;
    cap = newCap;
    baskets.push({ entryDate: d, exitDate, legs, before, after: cap, ret: (cap / before - 1) * 100 });
    if (!(exitDate > cursor)) break;
    cursor = exitDate;
  }
  return { baskets, final: cap };
}

export default function RadarBatchSimulator({ rows }) {
  const t = useChartTheme();
  const [capital, setCapital] = useState(100000);
  const [surplus, setSurplus] = useState(100000);
  const [horizon, setHorizon] = useState(5);
  const [splits, setSplits] = useState(3);
  const [minProb, setMinProb] = useState(0);

  const sim = useMemo(() => simulate(rows, { capital: capital || 0, horizon, splits, minProb }),
    [rows, capital, horizon, splits, minProb]);

  if (!sim || !sim.baskets.length) {
    return <div className="text-sm text-muted py-10 text-center">
      No baskets qualify for these settings yet — try a shorter horizon or a lower probability filter.
    </div>;
  }

  const { baskets, final } = sim;
  const pl = final - capital;
  const plPct = capital ? (final / capital - 1) * 100 : 0;
  const up = pl >= 0;
  const COL = up ? "#16c784" : "#ea3943";
  const legs = baskets.flatMap((b) => b.legs);
  const winLegs = legs.filter((l) => l.ret > 0).length;
  const winBaskets = baskets.filter((b) => b.ret > 0).length;
  const best = legs.reduce((m, x) => (x.ret > m.ret ? x : m), legs[0]);
  const worst = legs.reduce((m, x) => (x.ret < m.ret ? x : m), legs[0]);
  const totalStart = capital + surplus;
  const totalEnd = final + surplus;
  const totalPct = totalStart ? (totalEnd / totalStart - 1) * 100 : 0;

  const equity = [{ step: 0, cap: capital },
    ...baskets.map((b, i) => ({ step: i + 1, cap: b.after, date: b.exitDate, ret: b.ret, syms: b.legs.map((l) => l.symbol).join(", ") }))];

  const EqTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded-lg border border-line bg-ink/95 px-3 py-2 text-xs shadow-lg max-w-[220px]">
        {p.step === 0 ? <div className="font-semibold text-white">Start · {inr(p.cap)}</div> : (
          <>
            <div className="font-semibold text-white">Basket {p.step} · <span className={p.ret >= 0 ? "text-up" : "text-down"}>{pctf(p.ret)}</span></div>
            <div className="text-muted">{p.date}</div>
            <div className="text-muted/80 truncate">{p.syms}</div>
            <div className="font-mono mt-0.5" style={{ color: COL }}>{inr(p.cap)}</div>
          </>
        )}
      </div>
    );
  };

  const Seg = ({ label, options, value, onChange, fmt }) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">{label}</span>
      <span className="inline-flex rounded-lg border border-line/70 bg-panel2/40 p-0.5 text-xs font-semibold">
        {options.map((o) => {
          const v = Array.isArray(o) ? o[0] : o;
          const l = Array.isArray(o) ? o[1] : fmt ? fmt(o) : o;
          return (
            <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${value === v ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>{l}</button>
          );
        })}
      </span>
    </label>
  );
  const Money = ({ label, value, onChange }) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">{label}</span>
      <span className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">₹</span>
        <input type="number" min="0" step="1000" value={value} onChange={(e) => onChange(Math.max(0, +e.target.value))}
          className="rounded-lg border border-line/70 bg-panel2/40 pl-6 pr-2.5 py-2 text-sm font-semibold text-white/90 w-[130px] tabular-nums focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/25" />
      </span>
    </label>
  );
  const Stat = ({ label, value, cls }) => (
    <div className="stat-tile"><span className="stat-label">{label}</span><span className={`stat-value ${cls || ""}`}>{value}</span></div>
  );

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-wrap items-end gap-4">
        <Money label="Invest" value={capital} onChange={setCapital} />
        <Money label="Surplus (idle)" value={surplus} onChange={setSurplus} />
        <Seg label="Hold for" options={HORIZONS} value={horizon} onChange={setHorizon} fmt={(o) => `${o}D`} />
        <Seg label="Split into" options={SPLITS} value={splits} onChange={setSplits} />
        <Seg label="Min prob" options={PROBS} value={minProb} onChange={setMinProb} />
      </div>

      {/* headline */}
      <div className="rounded-2xl border p-5" style={{ borderColor: COL + "55", background: COL + "10" }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Invested {inr(capital)} → now</div>
            <div className="text-3xl font-bold tabular-nums" style={{ color: COL }}>{inr(final)}</div>
            <div className="text-sm mt-1">
              <span style={{ color: COL }} className="font-semibold">{up ? "+" : ""}{inr(pl)} ({pctf(plPct)})</span>
              <span className="text-muted"> · {splits}-way split · exit every {horizon}D</span>
            </div>
          </div>
          <div className="text-xs text-muted text-right leading-relaxed">
            Net worth {inr(totalStart)} → <b className="text-white/90">{inr(totalEnd)}</b> ({pctf(totalPct)})<br />
            {baskets.length} baskets · {legs.length} trades · {baskets[0].entryDate} → {baskets[baskets.length - 1].exitDate}
          </div>
        </div>
      </div>

      {/* equity curve */}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={equity} margin={{ top: 10, right: 16, left: 6, bottom: 4 }}>
          <defs>
            <linearGradient id="batchArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COL} stopOpacity={0.24} />
              <stop offset="100%" stopColor={COL} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="step" tick={{ fill: t.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: t.grid }}
            label={{ value: "Basket sequence", position: "insideBottomRight", offset: -2, fill: t.axis, fontSize: 10 }} />
          <YAxis tick={{ fill: t.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={58}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} domain={["dataMin", "dataMax"]} />
          <Tooltip content={<EqTip />} cursor={{ stroke: t.cursor, strokeDasharray: "4 4" }} />
          <ReferenceLine y={capital} stroke={t.axis} strokeDasharray="5 4" strokeOpacity={0.5}
            label={{ value: "start", position: "right", fill: t.axis, fontSize: 9 }} />
          <Area type="monotone" dataKey="cap" stroke="none" fill="url(#batchArea)" isAnimationActive={false} />
          <Line type="monotone" dataKey="cap" stroke={COL} strokeWidth={2.6} dot={{ r: 2, fill: COL }} activeDot={{ r: 4 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Baskets" value={`${winBaskets}/${baskets.length} up`} cls={winBaskets / baskets.length >= 0.5 ? "text-up" : "text-down"} />
        <Stat label="Trade win rate" value={`${Math.round((100 * winLegs) / legs.length)}%`} cls={winLegs / legs.length >= 0.5 ? "text-up" : "text-down"} />
        <Stat label="Best trade" value={pctf(best.ret)} cls="text-up" />
        <Stat label="Worst trade" value={pctf(worst.ret)} cls="text-down" />
      </div>

      {/* basket log */}
      <details className="rounded-xl border border-line bg-panel2/30">
        <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-semibold text-muted hover:text-white">
          Basket log ({baskets.length}) ▾
        </summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-xs" style={{ minWidth: 560 }}>
            <thead><tr>
              <th className="th">#</th><th className="th">Entry</th><th className="th">Held stocks</th>
              <th className="th">Exit</th><th className="th text-right">Basket</th><th className="th text-right">Capital</th>
            </tr></thead>
            <tbody>
              {baskets.map((b, i) => (
                <tr key={i} className="hover:bg-panel2/50 align-top">
                  <td className="td text-muted">{i + 1}</td>
                  <td className="td font-mono text-muted">{b.entryDate}</td>
                  <td className="td">
                    <div className="flex flex-col gap-0.5">
                      {b.legs.map((l, j) => (
                        <span key={j} className="flex items-center gap-1.5">
                          <SymbolLink symbol={l.symbol} name={l.company} />
                          <span className={`font-mono text-[11px] ${l.ret >= 0 ? "text-up" : "text-down"}`}>{pctf(l.ret)}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="td font-mono text-muted">{b.exitDate}</td>
                  <td className={`td text-right font-mono ${b.ret >= 0 ? "text-up" : "text-down"}`}>{pctf(b.ret)}</td>
                  <td className="td text-right font-mono tabular-nums">{inr(b.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-[10px] text-muted/80 leading-snug">
        Rule: split {inr(capital)} equally across the day's top {splits} pick{splits > 1 ? "s" : ""}
        {minProb > 0 ? ` (prob ≥ ${minProb})` : ""}, hold every leg {horizon} trading days, then reinvest the whole
        proceeds into the next day's basket. Surplus {inr(surplus)} sits idle in net worth. End-of-day closes; no
        brokerage, taxes or slippage. A mechanical what-if over past picks — not a live strategy, not investment advice.
      </p>
    </div>
  );
}
