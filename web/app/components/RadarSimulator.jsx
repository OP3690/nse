"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { useChartTheme } from "./charts";
import { SymbolLink } from "./ui";

// Roll-forward capital simulator. Start with some capital, buy the model's
// highest-probability pick, sell the instant it hits your target % (or after a
// 30-day max hold if it never does), then roll the whole proceeds into the next
// available pick — and repeat down the archived history. Answers: "if I'd kept
// recycling ₹1L on a +5% rule, where would I be now?" Uses each pick's realised
// exit (return + calendar date) precomputed by the pipeline, so trades chain by
// real dates with no look-ahead.
const TARGETS = [2, 5, 10];
const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pctf = (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

function simulate(rows, T, initial) {
  const mature = rows.filter((r) => r[`sx${T}`] != null)
    .slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!mature.length) return null;
  let cap = initial;
  let cursor = mature[0].date;
  const trades = [];
  let guard = 0;
  while (guard++ < 2000) {
    const cand = mature.filter((r) => r.date >= cursor);
    if (!cand.length) break;
    let entryDate = cand[0].date;
    for (const r of cand) if (r.date < entryDate) entryDate = r.date;
    const dayPicks = cand.filter((r) => r.date === entryDate);
    let pick = dayPicks[0];
    for (const r of dayPicks) if ((r.prob ?? 0) > (pick.prob ?? 0)) pick = r;
    const ret = pick[`sr${T}`];
    const exitDate = pick[`sx${T}`];
    const before = cap;
    cap *= 1 + ret / 100;
    trades.push({ entryDate, exitDate, symbol: pick.symbol, company: pick.company, prob: pick.prob, ret, hit: pick[`hh${T}`], before, after: cap });
    if (!(exitDate > cursor)) break; // safety
    cursor = exitDate;
  }
  return { trades, final: cap, startDate: mature[0].date };
}

export default function RadarSimulator({ rows }) {
  const t = useChartTheme();
  const [capital, setCapital] = useState(100000);
  const [target, setTarget] = useState(5);

  const sim = useMemo(() => simulate(rows, target, capital || 0), [rows, target, capital]);

  if (!sim || !sim.trades.length) {
    return <div className="text-sm text-muted py-10 text-center">
      The simulator runs once picks have matured (a full 30-day window of forward prices).
    </div>;
  }

  const { trades, final } = sim;
  const pl = final - capital;
  const plPct = capital ? (final / capital - 1) * 100 : 0;
  const up = pl >= 0;
  const wins = trades.filter((x) => x.ret > 0).length;
  const tpHits = trades.filter((x) => x.hit).length;
  const best = trades.reduce((m, x) => (x.ret > m.ret ? x : m), trades[0]);
  const worst = trades.reduce((m, x) => (x.ret < m.ret ? x : m), trades[0]);
  const COL = up ? "#16c784" : "#ea3943";

  const equity = [{ step: 0, cap: capital, label: "Start" },
    ...trades.map((x, i) => ({ step: i + 1, cap: x.after, date: x.exitDate, symbol: x.symbol, ret: x.ret }))];

  const EqTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded-lg border border-line bg-ink/95 px-3 py-2 text-xs shadow-lg">
        {p.step === 0 ? <div className="font-semibold text-white">Start · {inr(p.cap)}</div> : (
          <>
            <div className="font-semibold text-white">Trade {p.step} · {p.symbol}</div>
            <div className="text-muted">{p.date} · <span className={p.ret >= 0 ? "text-up" : "text-down"}>{pctf(p.ret)}</span></div>
            <div className="font-mono" style={{ color: COL }}>{inr(p.cap)}</div>
          </>
        )}
      </div>
    );
  };

  const Stat = ({ label, value, cls }) => (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${cls || ""}`}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Starting capital</span>
          <span className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">₹</span>
            <input type="number" min="1000" step="1000" value={capital}
              onChange={(e) => setCapital(Math.max(0, +e.target.value))}
              className="rounded-lg border border-line/70 bg-panel2/40 pl-6 pr-2.5 py-2 text-sm font-semibold text-white/90 w-[150px] tabular-nums focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/25" />
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Sell &amp; reinvest at</span>
          <span className="inline-flex rounded-lg border border-line/70 bg-panel2/40 p-0.5 text-sm font-semibold">
            {TARGETS.map((v) => (
              <button key={v} type="button" onClick={() => setTarget(v)} aria-pressed={target === v}
                className={`px-3.5 py-1.5 rounded-md transition-colors ${target === v ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>+{v}%</button>
            ))}
          </span>
        </label>
        {[100000, 500000, 1000000].map((v) => (
          <button key={v} type="button" onClick={() => setCapital(v)}
            className="text-[11px] px-2 py-1 rounded-md border border-line/60 text-muted hover:text-white hover:border-accent/40 transition-colors self-end mb-0.5">
            {v === 100000 ? "1L" : v === 500000 ? "5L" : "10L"}
          </button>
        ))}
      </div>

      {/* headline result */}
      <div className="rounded-2xl border p-5" style={{ borderColor: COL + "55", background: COL + "10" }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Ending value</div>
            <div className="text-3xl font-bold tabular-nums" style={{ color: COL }}>{inr(final)}</div>
            <div className="text-sm mt-1">
              <span style={{ color: COL }} className="font-semibold">{up ? "+" : ""}{inr(pl)}</span>
              <span className="text-muted"> ({pctf(plPct)}) on {inr(capital)} · +{target}% rule</span>
            </div>
          </div>
          <div className="text-xs text-muted text-right leading-relaxed">
            {trades.length} trades · {trades[0].entryDate} → {trades[trades.length - 1].exitDate}<br />
            hit target {tpHits}/{trades.length} · {wins}/{trades.length} profitable
          </div>
        </div>
      </div>

      {/* equity curve */}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={equity} margin={{ top: 10, right: 16, left: 6, bottom: 4 }}>
          <defs>
            <linearGradient id="simArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COL} stopOpacity={0.24} />
              <stop offset="100%" stopColor={COL} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="step" tick={{ fill: t.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: t.grid }}
            label={{ value: "Trade sequence", position: "insideBottomRight", offset: -2, fill: t.axis, fontSize: 10 }} />
          <YAxis tick={{ fill: t.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={58}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} domain={["dataMin", "dataMax"]} />
          <Tooltip content={<EqTip />} cursor={{ stroke: t.cursor, strokeDasharray: "4 4" }} />
          <ReferenceLine y={capital} stroke={t.axis} strokeDasharray="5 4" strokeOpacity={0.5}
            label={{ value: "start", position: "right", fill: t.axis, fontSize: 9 }} />
          <Area type="monotone" dataKey="cap" stroke="none" fill="url(#simArea)" isAnimationActive={false} />
          <Line type="monotone" dataKey="cap" stroke={COL} strokeWidth={2.6} dot={{ r: 2, fill: COL }} activeDot={{ r: 4 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* trade stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Trades" value={trades.length} />
        <Stat label="Win rate" value={`${Math.round((100 * wins) / trades.length)}%`} cls={wins / trades.length >= 0.5 ? "text-up" : "text-down"} />
        <Stat label="Best trade" value={pctf(best.ret)} cls="text-up" />
        <Stat label="Worst trade" value={pctf(worst.ret)} cls="text-down" />
      </div>

      {/* trade log */}
      <details className="rounded-xl border border-line bg-panel2/30">
        <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-semibold text-muted hover:text-white">
          Trade log ({trades.length}) ▾
        </summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-xs" style={{ minWidth: 560 }}>
            <thead><tr>
              <th className="th">#</th><th className="th">Entry</th><th className="th">Stock</th>
              <th className="th">Exit</th><th className="th text-right">Return</th>
              <th className="th">Outcome</th><th className="th text-right">Capital</th>
            </tr></thead>
            <tbody>
              {trades.map((x, i) => (
                <tr key={i} className="hover:bg-panel2/50">
                  <td className="td text-muted">{i + 1}</td>
                  <td className="td font-mono text-muted">{x.entryDate}</td>
                  <td className="td"><SymbolLink symbol={x.symbol} name={x.company} /></td>
                  <td className="td font-mono text-muted">{x.exitDate}</td>
                  <td className={`td text-right font-mono ${x.ret >= 0 ? "text-up" : "text-down"}`}>{pctf(x.ret)}</td>
                  <td className="td">
                    <span className={`chip ${x.hit ? "chip-up" : "chip-amber"} text-[10px]`}>{x.hit ? `hit +${target}%` : "max hold"}</span>
                  </td>
                  <td className="td text-right font-mono tabular-nums">{inr(x.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-[10px] text-muted/80 leading-snug">
        Rule: buy the highest-probability pick, sell when it first closes ≥ +{target}% (else exit after 30 trading days),
        reinvest 100% of proceeds into the next available pick. End-of-day closes; no brokerage, taxes, slippage or
        position sizing. A mechanical what-if over past picks — not a live strategy and not investment advice.
      </p>
    </div>
  );
}
