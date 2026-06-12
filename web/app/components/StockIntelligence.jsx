"use client";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, LabelList,
  PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip,
} from "recharts";
import { useChartTheme } from "./charts";
import InfoDot from "./InfoDot";

// Semantic identity colors — read fine on both themes (kept hardcoded like the
// other chart components in this codebase).
const C = {
  up: "#16c784", down: "#ea3943", accent: "#5b8cff",
  amber: "#f5a524", purple: "#a78bfa", cyan: "#22d3ee",
};

const num = (n, d = 2) => (n == null || isNaN(n) ? null : Number(n).toFixed(d));
const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
// Map a cross-sectional z-score (~ -3..+3) onto a 0-100 percentile-style axis.
const zPct = (z) => (z == null ? 50 : clamp(((Number(z) + 2) / 4) * 100));

function tipBox(label, items) {
  return (
    <div className="bg-panel2 border border-line rounded-lg px-3 py-2 text-xs shadow-lg">
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

// ── Semicircle probability gauge ─────────────────────────────────────────────
function Gauge({ label, value, hint }) {
  const t = useChartTheme();
  const v = value == null ? null : clamp(Number(value));
  const col = v == null ? t.axis : v >= 60 ? C.up : v >= 45 ? C.accent : C.down;
  const data = [{ v: v ?? 0 }, { v: 100 - (v ?? 0) }];
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative w-full" style={{ height: 78 }}>
        <ResponsiveContainer width="100%" height={78}>
          <PieChart>
            <Pie data={data} dataKey="v" startAngle={180} endAngle={0} cx="50%" cy="98%"
              innerRadius={32} outerRadius={46} stroke="none" isAnimationActive
              animationDuration={700} cornerRadius={3}>
              <Cell fill={col} />
              <Cell fill={t.grid} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 bottom-0 flex justify-center pointer-events-none">
          <span className="font-mono text-lg font-bold tabular-nums leading-none" style={{ color: col }}>
            {v == null ? "—" : `${v.toFixed(0)}%`}
          </span>
        </div>
      </div>
      <div className="text-[11px] text-muted text-center mt-1 leading-tight">{label}</div>
      {hint && <div className="text-[10px] text-muted/60">{hint}</div>}
    </div>
  );
}

// ── Mini analytics tile ──────────────────────────────────────────────────────
function Metric({ label, value, tone, hint }) {
  const c = tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "accent" ? "text-accent" : "text-white";
  return (
    <div className="rounded-lg border border-line bg-panel2/40 px-3 py-2">
      <div className="text-[10px] text-muted uppercase tracking-wide truncate">{label}</div>
      <div className={`font-mono text-base font-bold tabular-nums leading-tight ${c}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted/70 truncate">{hint}</div>}
    </div>
  );
}

export default function StockIntelligence({ meta = {}, forecast }) {
  const t = useChartTheme();
  const m = meta;
  const f = forecast || {};

  // Factor-profile radar — z-score factors mapped to a common percentile axis,
  // plus delivery, 52-week position and blended up-probability.
  const upAvg = m.up_prob_5d != null && m.up_prob_20d != null
    ? (m.up_prob_5d + m.up_prob_20d) / 2
    : (m.up_prob_20d ?? m.up_prob_5d ?? null);
  const radar = [
    { axis: "Momentum", val: zPct(m.factor_momentum), raw: num(m.factor_momentum) ?? "—", unit: "z" },
    { axis: "Trend", val: zPct(m.factor_trend), raw: num(m.factor_trend) ?? "—", unit: "z" },
    { axis: "Flow", val: zPct(m.factor_flow), raw: num(m.factor_flow) ?? "—", unit: "z" },
    { axis: "Delivery", val: m.deliv_pct != null ? clamp(m.deliv_pct) : 50, raw: m.deliv_pct != null ? `${m.deliv_pct.toFixed(1)}%` : "—", unit: "%" },
    { axis: "52W Pos", val: m.wk52_pos != null ? clamp(m.wk52_pos) : 50, raw: m.wk52_pos != null ? `${m.wk52_pos.toFixed(0)}%` : "—", unit: "%" },
    { axis: "Up-Prob", val: upAvg != null ? clamp(upAvg) : 50, raw: upAvg != null ? `${upAvg.toFixed(0)}%` : "—", unit: "%" },
  ];

  // Trailing-return ladder (these live in meta but were never visualised).
  const rets = [["1M", m.ret_1m], ["3M", m.ret_3m], ["6M", m.ret_6m], ["1Y", m.ret_1y]]
    .filter(([, v]) => v != null)
    .map(([k, v]) => ({ k, v: +v, up: v >= 0 }));

  const composite = m.composite;
  const compPct = composite != null ? clamp(((composite + 3) / 6) * 100) : null; // -3..+3 → 0..100

  const bull = f.reasons_bull || [];
  const bear = f.reasons_bear || [];

  return (
    <section className="card">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
        <h2 className="card-title mb-0 flex items-center gap-2">
          <span>Intelligence Dashboard</span>
          <InfoDot topic="stock.quant_model" />
        </h2>
        <div className="flex items-center gap-2 text-[11px]">
          {m.trend_label && (
            <span className="px-2 py-0.5 rounded-md border border-line bg-panel2/50 text-muted">
              {m.trend_label}
            </span>
          )}
          {composite != null && (
            <span className={`px-2 py-0.5 rounded-md font-mono font-semibold ${composite >= 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
              z {composite >= 0 ? "+" : ""}{composite.toFixed(2)}
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-muted mb-4">
        A model-driven read of this stock: factor exposures, calibrated up-move probabilities,
        trailing performance and risk — synthesised into one view.
      </p>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Factor radar */}
        <div className="lg:col-span-2 rounded-xl border border-line bg-panel2/30 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Factor profile</div>
          <ResponsiveContainer width="100%" height={236}>
            <RadarChart data={radar} outerRadius="70%" margin={{ top: 8, right: 22, bottom: 4, left: 22 }}>
              <PolarGrid stroke={t.grid} />
              <PolarAngleAxis dataKey="axis" tick={{ fill: t.axis, fontSize: 10.5, fontWeight: 600 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey={() => 50} stroke={t.axis} strokeDasharray="4 3" strokeOpacity={0.4} fill="none" isAnimationActive={false} />
              <Radar dataKey="val" stroke={C.accent} strokeWidth={2} fill={C.accent} fillOpacity={0.26} isAnimationActive animationDuration={650} />
              <Tooltip content={({ active, payload }) =>
                active && payload?.length
                  ? tipBox(payload[0].payload.axis, [
                      { name: "Percentile", color: C.accent, value: `${Math.round(payload[0].payload.val)} / 100` },
                      { name: "Reading", color: t.fg, value: payload[0].payload.raw },
                    ])
                  : null} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="text-[10px] text-muted/70 text-center">Dashed ring = universe median (50)</div>
        </div>

        {/* Probabilities + composite */}
        <div className="lg:col-span-3 rounded-xl border border-line bg-panel2/30 p-3 flex flex-col">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">Model probabilities</div>
          <div className="grid grid-cols-3 gap-2">
            <Gauge label="Up-move · 5d" value={m.up_prob_5d} />
            <Gauge label="Up-move · 20d" value={m.up_prob_20d} />
            <Gauge label="Multibagger" value={m.mb_prob} hint="12–18mo model" />
          </div>
          {compPct != null && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] text-muted mb-1">
                <span>Composite z-score vs universe</span>
                <span className="font-mono">{composite >= 0 ? "+" : ""}{composite.toFixed(2)}</span>
              </div>
              <div className="relative h-1.5 rounded-full bg-gradient-to-r from-down/50 via-line to-up/50">
                <div className="absolute top-1/2 -translate-y-1/2 left-1/2 w-px h-2.5 bg-muted/50" />
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-accent shadow"
                  style={{ left: `${compPct}%` }} title={`z ${composite.toFixed(2)}`} />
              </div>
              <div className="flex justify-between text-[10px] text-muted/70 mt-1">
                <span>weakest</span><span>median</span><span>strongest</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <Metric label="Smart-money" value={m.score != null ? m.score.toFixed(0) : "—"}
              tone={m.score >= 60 ? "up" : m.score <= 35 ? "down" : "accent"} hint="0–100" />
            <Metric label="Daily vol" value={m.vol_20 != null ? `${m.vol_20}%` : "—"} hint="20-day σ" />
            <Metric label="Max DD 60d" value={m.mdd_60 != null ? `${m.mdd_60}%` : "—"}
              tone={m.mdd_60 != null ? "down" : undefined} hint="worst drawdown" />
            <Metric label="From high" value={m.from_high != null ? `${m.from_high}%` : "—"}
              tone={m.from_high < 0 ? "down" : "up"} hint="vs 52W high" />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        {/* Trailing returns */}
        {rets.length > 0 && (
          <div className="rounded-xl border border-line bg-panel2/30 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Trailing returns</div>
            <ResponsiveContainer width="100%" height={172}>
              <BarChart data={rets} margin={{ top: 18, right: 8, left: -14, bottom: 0 }}>
                <XAxis dataKey="k" tick={{ fill: t.axis, fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: t.axis, fontSize: 10 }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: t.cursor }} content={({ active, payload }) =>
                  active && payload?.length
                    ? tipBox(`${payload[0].payload.k} return`, [{ name: "Change", color: payload[0].payload.up ? C.up : C.down, value: `${payload[0].payload.v >= 0 ? "+" : ""}${payload[0].payload.v}%` }])
                    : null} />
                <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700} barSize={42}>
                  {rets.map((d, i) => <Cell key={i} fill={d.up ? C.up : C.down} fillOpacity={0.85} />)}
                  <LabelList dataKey="v" position="top" formatter={(v) => `${v >= 0 ? "+" : ""}${v}%`}
                    style={{ fill: t.fg, fontSize: 11, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Bull / bear drivers */}
        <div className="rounded-xl border border-line bg-panel2/30 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">What's driving the read</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-semibold text-up mb-1">▲ Bullish</div>
              <ul className="text-xs text-muted space-y-1">
                {bull.length ? bull.map((r, i) => <li key={i} className="leading-snug">· {r}</li>)
                  : <li className="text-muted/50">None flagged</li>}
              </ul>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-down mb-1">▼ Bearish</div>
              <ul className="text-xs text-muted space-y-1">
                {bear.length ? bear.map((r, i) => <li key={i} className="leading-snug">· {r}</li>)
                  : <li className="text-muted/50">None flagged</li>}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted/80 mt-3">
        Probabilities are calibrated to a cross-sectional logistic model — relative ranking across the
        universe, not a price target or certainty. Factor axes are percentile-style readings vs all
        tracked stocks. Not investment advice.
      </p>
    </section>
  );
}
