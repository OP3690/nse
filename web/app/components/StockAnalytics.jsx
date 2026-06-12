"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Cell,
  Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { useChartTheme } from "./charts";
import InfoDot from "./InfoDot";

const C = {
  up: "#16c784", down: "#ea3943", accent: "#5b8cff",
  amber: "#f5a524", purple: "#a78bfa", cyan: "#22d3ee",
};

const RANGES = [["3M", 66], ["6M", 132], ["1Y", 252], ["ALL", Infinity]];

const fmtVol = (n) => {
  if (n == null) return "—";
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return Number(n).toLocaleString("en-IN");
};
const fmtP = (n, d = 2) => (n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: d })}`);

function tipBox(label, items) {
  return (
    <div className="bg-panel2 border border-line rounded-lg px-3 py-2 text-xs shadow-lg min-w-[150px]">
      <div className="text-muted mb-1">{label}</div>
      {items.map((it, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: it.color }}>{it.name}</span>
          <span className="font-mono text-white">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, tone, hint }) {
  const c = tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "accent" ? "text-accent" : "text-white";
  return (
    <div className="rounded-lg border border-line bg-panel2/40 px-3 py-2">
      <div className="text-[10px] text-muted uppercase tracking-wide truncate">{label}</div>
      <div className={`font-mono text-sm font-bold tabular-nums leading-tight ${c}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted/70 truncate">{hint}</div>}
    </div>
  );
}

export default function StockAnalytics({ data }) {
  const t = useChartTheme();
  const [range, setRange] = useState("1Y");
  const sliceN = RANGES.find(([k]) => k === range)?.[1] ?? Infinity;
  const rows = useMemo(
    () => (sliceN === Infinity ? data : data.slice(Math.max(0, data.length - sliceN))),
    [data, sliceN]
  );
  const lastClose = rows.length ? rows[rows.length - 1].close : null;

  // ── Volume-by-price profile (Market Profile / POC + value area) ─────────────
  const profile = useMemo(() => {
    const closes = rows.map((r) => r.close).filter((x) => x != null);
    if (closes.length < 5) return null;
    const lo = Math.min(...closes), hi = Math.max(...closes);
    const BINS = 22;
    const w = (hi - lo) / BINS || 1;
    const bins = Array.from({ length: BINS }, (_, b) => ({
      lo: lo + b * w, hi: lo + (b + 1) * w, mid: lo + (b + 0.5) * w, vol: 0,
    }));
    for (const r of rows) {
      if (r.close == null || r.volume == null) continue;
      let b = Math.floor((r.close - lo) / w);
      b = Math.max(0, Math.min(BINS - 1, b));
      bins[b].vol += r.volume;
    }
    const total = bins.reduce((s, x) => s + x.vol, 0) || 1;
    // Point of control = heaviest bin.
    let pocIdx = 0;
    bins.forEach((x, i) => { if (x.vol > bins[pocIdx].vol) pocIdx = i; });
    // Value area = bins covering ~70% of volume, grown outward from the POC.
    const inVA = new Array(BINS).fill(false);
    inVA[pocIdx] = true;
    let acc = bins[pocIdx].vol, loI = pocIdx, hiI = pocIdx;
    while (acc < total * 0.7 && (loI > 0 || hiI < BINS - 1)) {
      const below = loI > 0 ? bins[loI - 1].vol : -1;
      const above = hiI < BINS - 1 ? bins[hiI + 1].vol : -1;
      if (above >= below) { hiI++; inVA[hiI] = true; acc += bins[hiI].vol; }
      else { loI--; inVA[loI] = true; acc += bins[loI].vol; }
    }
    const curIdx = Math.max(0, Math.min(BINS - 1, Math.floor((lastClose - lo) / w)));
    // Top-of-chart first → reverse so high prices render at top.
    const out = bins.map((x, i) => ({
      label: `₹${Math.round(x.mid).toLocaleString("en-IN")}`,
      mid: x.mid, vol: x.vol, pct: (x.vol / total) * 100,
      poc: i === pocIdx, va: inVA[i], cur: i === curIdx,
    })).reverse();
    return { out, poc: bins[pocIdx].mid, vaLo: bins[loI].lo, vaHi: bins[hiI].hi };
  }, [rows, lastClose]);

  // ── Drawdown (underwater) curve from running peak ──────────────────────────
  const dd = useMemo(() => {
    let peak = -Infinity; let maxDD = 0, maxDate = null;
    const series = rows.map((r) => {
      if (r.close != null && r.close > peak) peak = r.close;
      const v = peak > 0 ? (r.close / peak - 1) * 100 : 0;
      if (v < maxDD) { maxDD = v; maxDate = r.date; }
      return { date: r.date, dd: +v.toFixed(2) };
    });
    const cur = series.length ? series[series.length - 1].dd : 0;
    return { series, maxDD: +maxDD.toFixed(1), maxDate, cur: +cur.toFixed(1) };
  }, [rows]);

  // ── Daily-return distribution + risk stats ─────────────────────────────────
  const dist = useMemo(() => {
    const rets = rows.map((r) => r.pct).filter((x) => x != null && isFinite(x));
    if (rets.length < 5) return null;
    const n = rets.length;
    const mean = rets.reduce((a, b) => a + b, 0) / n;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    const skew = sd > 0 ? rets.reduce((a, b) => a + ((b - mean) / sd) ** 3, 0) / n : 0;
    const up = rets.filter((x) => x > 0).length;
    const best = Math.max(...rets), worst = Math.min(...rets);
    const annVol = sd * Math.sqrt(252);
    // Histogram: symmetric bins clamped to ±cap.
    const cap = Math.max(2, Math.min(12, Math.ceil(Math.max(Math.abs(best), Math.abs(worst)))));
    const BINS = 19;
    const w = (2 * cap) / BINS;
    const h = Array.from({ length: BINS }, (_, b) => {
      const c = -cap + (b + 0.5) * w;
      return { c, count: 0, label: `${c >= 0 ? "+" : ""}${c.toFixed(1)}` };
    });
    for (const x of rets) {
      let b = Math.floor((Math.max(-cap, Math.min(cap, x)) + cap) / w);
      b = Math.max(0, Math.min(BINS - 1, b));
      h[b].count++;
    }
    return { h, mean, sd, skew, upPct: (up / n) * 100, best, worst, annVol, n };
  }, [rows]);

  return (
    <section className="card">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
        <h2 className="card-title mb-0 flex items-center gap-2">
          <span>Price Structure &amp; Risk Analytics</span>
          <InfoDot topic="stock.technical" />
        </h2>
        <div className="flex rounded-md border border-line overflow-hidden">
          {RANGES.map(([k]) => (
            <button key={k} onClick={() => setRange(k)}
              className={`text-[11px] px-2 py-1 transition ${range === k ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>
              {k}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted mb-4">
        Where volume actually traded, how deep the falls from peak have been, and the shape of the
        day-to-day return distribution — the quantitative structure behind the price.
      </p>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Volume profile */}
        <div className="lg:col-span-2 rounded-xl border border-line bg-panel2/30 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">Volume by price</span>
            {profile && <span className="text-[10px] text-muted">POC {fmtP(profile.poc, 0)}</span>}
          </div>
          {profile ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={profile.out} layout="vertical" margin={{ top: 2, right: 10, left: 2, bottom: 0 }} barCategoryGap={1}>
                <XAxis type="number" tick={{ fill: t.axis, fontSize: 10 }} tickFormatter={fmtVol} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" tick={{ fill: t.axis, fontSize: 9.5 }} width={56}
                  axisLine={false} tickLine={false} interval={1} />
                <Tooltip cursor={{ fill: t.cursor }} content={({ active, payload }) =>
                  active && payload?.length
                    ? tipBox(payload[0].payload.label, [
                        { name: "Volume", color: C.accent, value: fmtVol(payload[0].payload.vol) },
                        { name: "Share", color: t.fg, value: `${payload[0].payload.pct.toFixed(1)}%` },
                        ...(payload[0].payload.poc ? [{ name: "Point of control", color: C.amber, value: "●" }] : []),
                      ])
                    : null} />
                {profile.out.some((b) => b.cur) && (
                  <ReferenceLine y={profile.out.find((b) => b.cur).label} stroke={C.cyan} strokeDasharray="4 2"
                    label={{ value: "now", position: "right", fill: C.cyan, fontSize: 9 }} />
                )}
                <Bar dataKey="vol" isAnimationActive animationDuration={700} radius={[0, 3, 3, 0]}>
                  {profile.out.map((b, i) => (
                    <Cell key={i} fill={b.poc ? C.amber : b.va ? C.accent : t.grid}
                      fillOpacity={b.poc ? 0.95 : b.va ? 0.7 : 0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-sm text-muted py-12 text-center">Not enough data.</div>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.amber }} />POC</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.accent }} />Value area (70%)</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-0.5" style={{ background: C.cyan }} />Current</span>
          </div>
        </div>

        {/* Drawdown + distribution */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-panel2/30 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">Drawdown from peak</span>
              <span className="text-[10px] text-muted">
                now <span className="font-mono text-down">{dd.cur}%</span> · max <span className="font-mono text-down">{dd.maxDD}%</span>
              </span>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={dd.series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.down} stopOpacity={0.05} />
                    <stop offset="100%" stopColor={C.down} stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: t.axis, fontSize: 10 }} tickFormatter={(d) => d?.slice(5)} minTickGap={36} />
                <YAxis tick={{ fill: t.axis, fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <ReferenceLine y={0} stroke={t.zero} />
                <ReferenceLine y={dd.maxDD} stroke={`${C.down}88`} strokeDasharray="3 3" />
                <Tooltip content={({ active, payload, label }) =>
                  active && payload?.length
                    ? tipBox(label, [{ name: "Drawdown", color: C.down, value: `${payload[0].value}%` }])
                    : null} />
                <Area dataKey="dd" stroke={C.down} strokeWidth={1.5} fill="url(#ddFill)" isAnimationActive animationDuration={700} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-line bg-panel2/30 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">Daily-return distribution</span>
              {dist && <span className="text-[10px] text-muted">{dist.n} sessions</span>}
            </div>
            {dist ? (
              <>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={dist.h} margin={{ top: 4, right: 8, left: -22, bottom: 0 }} barCategoryGap={1}>
                    <CartesianGrid stroke={t.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 9 }} interval={2} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: t.axis, fontSize: 9 }} axisLine={false} tickLine={false} />
                    <ReferenceLine x={dist.h.reduce((best, b) => (Math.abs(b.c) < Math.abs(best.c) ? b : best), dist.h[0]).label}
                      stroke={t.zero} />
                    <Tooltip cursor={{ fill: t.cursor }} content={({ active, payload }) =>
                      active && payload?.length
                        ? tipBox(`${payload[0].payload.label}%`, [{ name: "Days", color: payload[0].payload.c >= 0 ? C.up : C.down, value: payload[0].payload.count }])
                        : null} />
                    <Bar dataKey="count" isAnimationActive animationDuration={650} radius={[2, 2, 0, 0]}>
                      {dist.h.map((b, i) => <Cell key={i} fill={b.c >= 0 ? C.up : C.down} fillOpacity={0.8} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                  <Stat label="Ann. vol" value={`${dist.annVol.toFixed(1)}%`} hint="σ × √252" />
                  <Stat label="Up days" value={`${dist.upPct.toFixed(0)}%`} tone={dist.upPct >= 50 ? "up" : "down"} />
                  <Stat label="Best day" value={`+${dist.best.toFixed(1)}%`} tone="up" />
                  <Stat label="Worst day" value={`${dist.worst.toFixed(1)}%`} tone="down" />
                  <Stat label="Skew" value={dist.skew.toFixed(2)} tone={dist.skew >= 0 ? "up" : "down"}
                    hint={dist.skew >= 0 ? "right-tailed" : "left-tailed"} />
                </div>
              </>
            ) : <div className="text-sm text-muted py-8 text-center">Not enough data.</div>}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted/80 mt-3">
        Volume-by-price buckets each session's volume at its close; the Point of Control (POC) and 70%
        value area mark where most trading occurred — common support/resistance zones. Drawdown is the
        fall from the running peak. Stats are computed over the selected window from end-of-day data —
        not investment advice.
      </p>
    </section>
  );
}
