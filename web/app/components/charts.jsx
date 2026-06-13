"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  ComposedChart, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell,
  CartesianGrid, ReferenceLine, ReferenceArea, ReferenceDot, LabelList,
  PieChart, Pie, Customized,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

// ── Theme-aware chart "chrome" (axis/grid/zero-line/cursor/separators) ────────
// Semantic data colors (greens/reds/blues/ambers) read fine on both themes and
// stay hardcoded. Only the neutral chrome needs to follow the palette, so we
// read the live CSS-var triplets and re-render whenever the theme flips (the
// ThemeToggle dispatches a "themechange" event). SSR / pre-mount falls back to
// the dark values so the default first paint matches.
const DARK_CHROME = {
  axis: "#8a96ab", grid: "#243049", zero: "#3a4a66",
  cursor: "rgba(255,255,255,0.03)", ink: "#0b0f17", fg: "#dbe2f0", fg2: "#c7d0e0",
};

function readChrome() {
  if (typeof document === "undefined") return DARK_CHROME;
  const cs = getComputedStyle(document.documentElement);
  const trip = (n) => cs.getPropertyValue(`--${n}`).trim().split(/\s+/).join(", ");
  const muted = trip("muted"), line = trip("line"), ink = trip("ink"), fg = trip("fg");
  if (!muted || !line) return DARK_CHROME;
  const isLight = document.documentElement.classList.contains("light");
  return {
    axis: `rgb(${muted})`,
    grid: `rgb(${line})`,
    zero: `rgba(${muted}, 0.55)`,
    // Subtle hover overlay — dark wash on light bg, light wash on dark bg.
    cursor: isLight ? "rgba(15,23,42,0.05)" : "rgba(255,255,255,0.03)",
    ink: `rgb(${ink})`,
    fg: `rgb(${fg})`,
    fg2: `rgb(${fg})`,
  };
}

export function useChartTheme() {
  const [chrome, setChrome] = useState(DARK_CHROME);
  useEffect(() => {
    const update = () => setChrome(readChrome());
    update(); // sync to actual theme after mount
    window.addEventListener("themechange", update);
    return () => window.removeEventListener("themechange", update);
  }, []);
  return chrome;
}

function box(label, items) {
  return (
    <div className="bg-panel2 border border-line rounded-lg px-3 py-2 text-xs shadow-lg">
      <div className="text-muted mb-1">{label}</div>
      {items.map((it, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: it.color }}>{it.name}</span>
          <span className="font-mono">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function LegendSwatch({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      <span className="text-muted">{label}</span>
    </span>
  );
}

// Compact ₹-crore axis label: 0 → "0", lakh-crore → "1.2L", else thousands "34k".
function crK(v) {
  if (v === 0) return "0";
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 100000) return `${s}₹${(a / 100000).toFixed(1)}L`;
  if (a >= 1000) return `${s}₹${(a / 1000).toFixed(0)}k`;
  return `${s}₹${Math.round(a)}`;
}
const crFull = (v) => `${v >= 0 ? "+" : ""}₹${Number(v).toLocaleString("en-IN")} Cr`;

// One cumulative-flow figure in the scoreboard rail: a bordered mini-card with a
// colored left accent, the signed ₹ total and an up/down arrow.
function RailStat({ label, value, color }) {
  const up = value >= 0;
  return (
    <div className="relative flex-1 min-w-0 rounded-lg border border-line bg-panel2/40 pl-3 pr-2.5 py-2 overflow-hidden">
      <span className="absolute left-0 inset-y-0 w-1" style={{ background: color }} />
      <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</div>
      <div className="font-mono text-[15px] font-bold tabular-nums leading-tight truncate" style={{ color }}>
        <span className="mr-0.5 text-[10px]">{up ? "▲" : "▼"}</span>{crFull(value)}
      </div>
    </div>
  );
}

export function FiiDiiChart({ data }) {
  const t = useChartTheme();
  const [view, setView] = useState("both"); // both | bars | trend
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;

  // Accumulate running cumulative net for FII, DII and the combined institutional
  // line, then fit a least-squares regression of the combined cumulative against
  // the session index — its slope tells us whether the window is net accumulating
  // (rising) or distributing (falling), and gives the straight dashed trendline.
  const { rows, slope, totals } = useMemo(() => {
    let fc = 0, dc = 0, cc = 0;
    const rows = (data || []).map((d) => {
      const fii = d.fii || 0, dii = d.dii || 0;
      fc += fii; dc += dii; cc += fii + dii;
      return { date: d.date, fii, dii, fii_cum: fc, dii_cum: dc, comb_cum: cc };
    });
    const n = rows.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    rows.forEach((r, i) => { sx += i; sy += r.comb_cum; sxy += i * r.comb_cum; sxx += i * i; });
    const denom = n * sxx - sx * sx;
    const slope = denom ? (n * sxy - sx * sy) / denom : 0;
    const intercept = n ? (sy - slope * sx) / n : 0;
    rows.forEach((r, i) => { r.trend = intercept + slope * i; });
    return { rows, slope, totals: { fii: fc, dii: dc, comb: cc } };
  }, [data]);

  const last = rows[rows.length - 1] || {};
  const showBars = view === "both" || view === "bars";
  const showTrend = view === "both" || view === "trend";
  const barOpacity = view === "both" ? 0.5 : 0.92;
  const accumulating = slope >= 0;

  const TOOLTIP = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const byKey = {};
    payload.forEach((p) => { byKey[p.dataKey] = p.value; });
    const items = [];
    if (byKey.fii != null) items.push({ name: "FII (day)", color: byKey.fii >= 0 ? "#16c784" : "#ea3943", value: `${crFull(byKey.fii)} ${byKey.fii >= 0 ? "buy" : "sell"}` });
    if (byKey.dii != null) items.push({ name: "DII (day)", color: byKey.dii >= 0 ? "#5b8cff" : "#f0a020", value: `${crFull(byKey.dii)} ${byKey.dii >= 0 ? "buy" : "sell"}` });
    if (byKey.fii_cum != null) items.push({ name: "FII cumulative", color: "#16c784", value: crFull(byKey.fii_cum) });
    if (byKey.dii_cum != null) items.push({ name: "DII cumulative", color: "#5b8cff", value: crFull(byKey.dii_cum) });
    if (byKey.trend != null) items.push({ name: "Trend", color: "#a78bfa", value: crFull(Math.round(byKey.trend)) });
    return box(label, items);
  };

  const TABS = [["both", "Both"], ["bars", "Daily"], ["trend", "Trend"]];

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-5">
      {/* Left rail: cumulative scoreboard + regime banner + view toggle */}
      <div className="flex flex-col gap-2.5">
        <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">
          Cumulative · {rows.length} sessions
        </div>
        <div className="flex gap-2.5 lg:flex-col">
          <RailStat label="FII net" value={totals.fii} color="#16c784" />
          <RailStat label="DII net" value={totals.dii} color="#5b8cff" />
          <RailStat label="Combined" value={totals.comb} color="#a78bfa" />
        </div>

        {/* accumulation / distribution regime, read from the regression slope */}
        <div className={`rounded-lg border px-3 py-2 ${accumulating ? "border-up/30 bg-up/5" : "border-down/30 bg-down/5"}`}>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${accumulating ? "bg-up" : "bg-down"} animate-pulse`} />
            <span className={`text-xs font-bold ${accumulating ? "text-up" : "text-down"}`}>
              {accumulating ? "Accumulating" : "Distributing"}
            </span>
          </div>
          <div className="text-[10px] text-muted mt-0.5">
            trend ≈ <span className="font-mono text-white/80">{crK(Math.round(slope))}</span>/session
          </div>
        </div>

        {/* view toggle */}
        <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-line/70 bg-panel2/40 p-0.5 text-[11px] font-semibold">
          {TABS.map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              aria-pressed={view === k}
              className={`px-2 py-1 rounded-md transition-colors ${
                view === k ? "bg-accent/20 text-accent" : "text-muted hover:text-white"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Chart + legend */}
      <div className="min-w-0">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={rows} margin={{ top: 8, right: 6, left: -6, bottom: 0 }}>
          <defs>
            <linearGradient id="fdTrend" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => d?.slice(5)} minTickGap={28} />
          <YAxis yAxisId="bars" tick={AXIS} tickFormatter={crK} width={52} />
          <YAxis yAxisId="cum" orientation="right" tick={AXIS} tickFormatter={crK} width={52} hide={!showTrend} />
          <ReferenceLine yAxisId="bars" y={0} stroke={t.zero} />
          <Tooltip cursor={{ fill: t.cursor }} content={TOOLTIP} />

          {showBars && (
            <Bar yAxisId="bars" dataKey="fii" name="FII" radius={[2, 2, 0, 0]} fillOpacity={barOpacity} isAnimationActive={false}>
              {rows.map((d, i) => <Cell key={i} fill={d.fii >= 0 ? "#16c784" : "#ea3943"} />)}
            </Bar>
          )}
          {showBars && (
            <Bar yAxisId="bars" dataKey="dii" name="DII" radius={[2, 2, 0, 0]} fillOpacity={barOpacity} isAnimationActive={false}>
              {rows.map((d, i) => <Cell key={i} fill={d.dii >= 0 ? "#5b8cff" : "#f0a020"} />)}
            </Bar>
          )}

          {showTrend && (
            <Line yAxisId="cum" type="monotone" dataKey="fii_cum" name="FII cum" stroke="#16c784"
              strokeWidth={2.2} dot={false} isAnimationActive animationDuration={900} />
          )}
          {showTrend && (
            <Line yAxisId="cum" type="monotone" dataKey="dii_cum" name="DII cum" stroke="#5b8cff"
              strokeWidth={2.2} dot={false} isAnimationActive animationDuration={900} />
          )}
          {showTrend && (
            <Line yAxisId="cum" type="linear" dataKey="trend" name="Trend" stroke="url(#fdTrend)"
              strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          )}
          {showTrend && last.date != null && (
            <ReferenceDot yAxisId="cum" x={last.date} y={last.fii_cum} r={4} fill="#16c784" stroke={t.ink} strokeWidth={1.5} ifOverflow="extendDomain" isFront />
          )}
          {showTrend && last.date != null && (
            <ReferenceDot yAxisId="cum" x={last.date} y={last.dii_cum} r={4} fill="#5b8cff" stroke={t.ink} strokeWidth={1.5} ifOverflow="extendDomain" isFront />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
        <span className="font-semibold text-white/80">Daily bars</span>
        <LegendSwatch color="#16c784" label="FII buy" />
        <LegendSwatch color="#ea3943" label="FII sell" />
        <LegendSwatch color="#5b8cff" label="DII buy" />
        <LegendSwatch color="#f0a020" label="DII sell" />
        <span className="mx-1 h-3 w-px bg-line" />
        <span className="font-semibold text-white/80">Cumulative</span>
        <LegendSwatch color="#16c784" label="FII" />
        <LegendSwatch color="#5b8cff" label="DII" />
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full" style={{ background: "#a78bfa" }} />
          <span className="text-muted">regression trend</span>
        </span>
      </div>
      </div>
    </div>
  );
}

export function CumulativeFlowChart({ data }) {
  // Running cumulative net FII vs DII (₹ Cr) over the selected window. Reveals
  // the slower-moving accumulation/distribution trend that daily bars hide:
  // a rising line is sustained net buying, a falling line persistent selling.
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  // Cumulative ₹ Cr can run to six figures — show as thousands of crore ("k").
  const kfmt = (v) => {
    if (v === 0) return "0";
    const a = Math.abs(v);
    const s = v < 0 ? "-" : "";
    if (a >= 100000) return `${s}${(a / 100000).toFixed(1)}L`; // lakh-crore
    return `${s}${(a / 1000).toFixed(0)}k`;
  };
  const last = data[data.length - 1] || {};
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -2, bottom: 0 }}>
        <defs>
          <linearGradient id="cumFii" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16c784" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#16c784" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="cumDii" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5b8cff" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#5b8cff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => d?.slice(5)} minTickGap={36} />
        <YAxis tick={AXIS} tickFormatter={kfmt} width={50} />
        <ReferenceLine y={0} stroke={t.zero} />
        <Tooltip
          cursor={{ stroke: t.zero, strokeDasharray: "3 3" }}
          content={({ active, payload, label }) =>
            active && payload?.length
              ? box(label, payload.map((p) => ({
                  name: p.dataKey === "fii_cum" ? "FII cumulative" : "DII cumulative",
                  color: p.dataKey === "fii_cum" ? "#16c784" : "#5b8cff",
                  value: `${p.value >= 0 ? "+" : ""}₹${Number(p.value).toLocaleString("en-IN")} Cr`,
                })))
              : null
          }
        />
        <Area type="monotone" dataKey="dii_cum" name="DII" stroke="#5b8cff" strokeWidth={2}
          fill="url(#cumDii)" dot={false} isAnimationActive animationDuration={900} />
        <Area type="monotone" dataKey="fii_cum" name="FII" stroke="#16c784" strokeWidth={2}
          fill="url(#cumFii)" dot={false} isAnimationActive animationDuration={1000} />
        {last.date != null && (
          <ReferenceDot x={last.date} y={last.dii_cum} r={4} fill="#5b8cff" stroke={t.ink} strokeWidth={1.5} ifOverflow="extendDomain" isFront />
        )}
        {last.date != null && (
          <ReferenceDot x={last.date} y={last.fii_cum} r={4} fill="#16c784" stroke={t.ink} strokeWidth={1.5} ifOverflow="extendDomain" isFront />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PriceDeliveryChart({ data, trendline }) {
  // Overlay a straight regression trendline by attaching its two endpoints to
  // the matching rows; recharts connects them across nulls with connectNulls.
  let rows = data;
  if (trendline?.length === 2) {
    const byDate = Object.fromEntries(trendline.map((t) => [t.date, t.value]));
    rows = data.map((d) => ({ ...d, trend: byDate[d.date] ?? null }));
  }
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => d?.slice(5)} />
        <YAxis yAxisId="p" tick={AXIS} domain={["auto", "auto"]} />
        <YAxis yAxisId="d" orientation="right" tick={AXIS} domain={[0, 100]} unit="%" />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length
              ? box(label, payload.filter((p) => p.dataKey !== "trend").map((p) => ({
                  name: p.name, color: p.color,
                  value: p.dataKey === "deliv" ? `${Number(p.value).toFixed(1)}%` : Number(p.value).toLocaleString("en-IN"),
                })))
              : null
          }
        />
        <Bar yAxisId="d" dataKey="deliv" name="Delivery %" fill="#5b8cff33" radius={[2, 2, 0, 0]} />
        <Line yAxisId="p" dataKey="close" name="Close" stroke="#16c784" dot={false} strokeWidth={2} />
        {trendline?.length === 2 && (
          <Line yAxisId="p" dataKey="trend" name="Trend" stroke="#f0a020" dot={false}
            strokeWidth={1.5} strokeDasharray="5 4" connectNulls />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const inr = (v) => `₹${Number(v).toLocaleString("en-IN")} Cr`;

export function FlowChart({ data, showCum = true }) {
  // Net FII/DII per bucket (bars); cumulative trend lines overlaid when the
  // series share a common span (off for the reconciled chart, where FPI and DII
  // cover different histories and a shared cumulative would mislead).
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" tick={AXIS} tickFormatter={(d) => (d?.length > 7 ? d.slice(5) : d)} />
        <YAxis yAxisId="net" tick={AXIS} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        {showCum && (
          <YAxis yAxisId="cum" orientation="right" tick={AXIS} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        )}
        <ReferenceLine yAxisId="net" y={0} stroke={t.zero} />
        <Tooltip
          cursor={{ fill: t.cursor }}
          content={({ active, payload, label }) =>
            active && payload?.length
              ? box(label, payload.map((p) => ({ name: p.name, color: p.color, value: inr(p.value) })))
              : null
          }
        />
        <Bar yAxisId="net" dataKey="fii" name="FII net" radius={[2, 2, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.fii >= 0 ? "#16c784" : "#ea3943"} />)}
        </Bar>
        <Bar yAxisId="net" dataKey="dii" name="DII net" radius={[2, 2, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.dii >= 0 ? "#5b8cff" : "#f0a020"} />)}
        </Bar>
        {showCum && (
          <Line yAxisId="cum" dataKey="fii_cum" name="FII cumulative" stroke="#16c784" dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
        )}
        {showCum && (
          <Line yAxisId="cum" dataKey="dii_cum" name="DII cumulative" stroke="#5b8cff" dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function DestinationChart({ data }) {
  // NSDL FPI net by instrument (asset-class destination of foreign money).
  if (!data?.length) return <div className="text-sm text-muted py-8 text-center">No NSDL data yet.</div>;
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 46)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
        <YAxis type="category" dataKey="instrument" tick={AXIS} width={110} />
        <ReferenceLine x={0} stroke={t.zero} />
        <Tooltip
          cursor={{ fill: t.cursor }}
          content={({ active, payload, label }) =>
            active && payload?.length
              ? box(label, [{ name: "Net", color: payload[0].payload.net >= 0 ? "#16c784" : "#ea3943", value: inr(payload[0].value) }])
              : null
          }
        />
        <Bar dataKey="net" name="Net" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.net >= 0 ? "#16c784" : "#ea3943"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const DERIV_CATS = [
  { key: "Index Futures", color: "#16c784" },
  { key: "Stock Futures", color: "#5b8cff" },
  { key: "Index Options", color: "#f0a020" },
  { key: "Stock Options", color: "#c77dff" },
];

export function FiiDerivChart({ data }) {
  // FII F&O net (₹ Cr) per category, grouped bars per month. Index/stock
  // futures net is the classic directional gauge; options net adds nuance.
  if (!data?.length) return <div className="text-sm text-muted py-8 text-center">No FII derivatives data yet.</div>;
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" tick={AXIS} />
        <YAxis tick={AXIS} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        <ReferenceLine y={0} stroke={t.zero} />
        <Tooltip
          cursor={{ fill: t.cursor }}
          content={({ active, payload, label }) =>
            active && payload?.length
              ? box(label, payload.map((p) => ({ name: p.name, color: p.color, value: inr(p.value) })))
              : null
          }
        />
        {DERIV_CATS.map((c) => (
          <Bar key={c.key} dataKey={c.key} name={c.key} fill={c.color} radius={[2, 2, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

const ROT_COLORS = ["#16c784", "#5b8cff", "#f0a020", "#c77dff", "#2dd4bf", "#fb7185", "#a3e635", "#38bdf8"];

export function SectorShareChart({ data, keys }) {
  // Each sector's share of total delivered value over the trailing months —
  // rising lines = money rotating in, falling = rotating out.
  if (!data?.length || !keys?.length)
    return <div className="text-sm text-muted py-8 text-center">No rotation data yet.</div>;
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={AXIS} tickFormatter={(d) => d?.slice(2)} />
        <YAxis tick={AXIS} unit="%" />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length
              ? box(label, payload
                  .slice()
                  .sort((a, b) => b.value - a.value)
                  .map((p) => ({ name: p.name, color: p.color, value: `${Number(p.value).toFixed(1)}%` })))
              : null
          }
        />
        {keys.map((k, i) => (
          <Line key={k} dataKey={k} name={k} stroke={ROT_COLORS[i % ROT_COLORS.length]}
            dot={false} strokeWidth={2} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

const QUAD_COLOR = {
  Leading: "#16c784", Weakening: "#f0a020", Improving: "#5b8cff", Lagging: "#ea3943",
};

// SVG <defs> for the RRG — quadrant corner-gradients + a soft glow filter.
// Injected via recharts <Customized> so the ids resolve inside the chart SVG.
function RrgDefs() {
  const grads = [
    ["qgLeading", "#16c784", "100%", "0%", "0%", "100%"],
    ["qgWeakening", "#f0a020", "100%", "100%", "0%", "0%"],
    ["qgImproving", "#5b8cff", "0%", "0%", "100%", "100%"],
    ["qgLagging", "#ea3943", "0%", "100%", "100%", "0%"],
  ];
  return (
    <defs>
      {grads.map(([id, c, x1, y1, x2, y2]) => (
        <linearGradient key={id} id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
          <stop offset="0%" stopColor={c} stopOpacity={0.16} />
          <stop offset="62%" stopColor={c} stopOpacity={0.035} />
          <stop offset="100%" stopColor={c} stopOpacity={0} />
        </linearGradient>
      ))}
      <filter id="rrgGlow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="3.2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

// Comet-trail dot: brightens and grows toward the head (age 0 → 1 via payload.o).
function RrgTailDot(props) {
  const { cx, cy, payload, fill } = props;
  if (cx == null || cy == null) return null;
  const o = payload?.o ?? 0.5;
  return <circle cx={cx} cy={cy} r={1.3 + o * 2.4} fill={fill} fillOpacity={0.12 + o * 0.5} />;
}

// Glowing, gently-pulsing head marker for the RRG (SMIL-animated SVG).
function RrgHead(props) {
  const { cx, cy, payload, ink = "#0b0f17" } = props;
  if (cx == null || cy == null) return null;
  const c = QUAD_COLOR[payload?.quadrant] || "#8a96ab";
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill={c} fillOpacity={0.18} filter="url(#rrgGlow)">
        <animate attributeName="r" values="8;14;8" dur="2.8s" repeatCount="indefinite" />
        <animate attributeName="fill-opacity" values="0.26;0.05;0.26" dur="2.8s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={5.5} fill={c} stroke={ink} strokeWidth={1.6} />
      <circle cx={cx} cy={cy} r={2} fill={ink} fillOpacity={0.85} />
    </g>
  );
}

// Sector label rendered as a readable pill anchored to the right of each head.
function RrgLabel(props) {
  const { x, y, value, ink = "#0b0f17", grid = "#243049", fg = "#dbe2f0" } = props;
  if (x == null || y == null || !value) return null;
  const text = value.length > 14 ? value.slice(0, 13) + "…" : value;
  const w = text.length * 5.7 + 14;
  return (
    <g transform={`translate(${x + 10}, ${y - 8})`}>
      <rect width={w} height={16} rx={8} fill={ink} fillOpacity={0.78} stroke={grid} strokeWidth={1} />
      <text x={w / 2} y={11.5} textAnchor="middle" fill={fg} fontSize={9.5} fontWeight={600}>{text}</text>
    </g>
  );
}

const QLABEL = (value, fill, position) => ({
  value, position, fill, fontSize: 10.5, fontWeight: 800, opacity: 0.55, letterSpacing: 1,
});

export function RRGChart({ points, tails }) {
  // JdK Relative Rotation Graph: each sector plotted by RS-Ratio (x, relative
  // strength) vs RS-Momentum (y). 100/100 is the benchmark crossover — the four
  // quadrants are Leading (top-right), Weakening (bottom-right), Improving
  // (top-left), Lagging (bottom-left). Tails show ~6 weeks of travel.
  if (!points?.length) return <div className="text-sm text-muted py-8 text-center">No rotation data yet.</div>;
  const th = useChartTheme();
  const AXIS = { stroke: th.axis, fontSize: 11 };
  const GRID = th.grid;
  const xs = points.flatMap((p) => [p.rs_ratio, ...(tails?.[p.sector] || []).map((t) => t.ratio)]);
  const ys = points.flatMap((p) => [p.rs_momentum, ...(tails?.[p.sector] || []).map((t) => t.mom)]);
  const pad = 3.5;
  const xlo = Math.min(...xs) - pad, xhi = Math.max(...xs) + pad;
  const ylo = Math.min(...ys) - pad, yhi = Math.max(...ys) + pad;
  const head = points.map((p) => ({ x: p.rs_ratio, y: p.rs_momentum, sector: p.sector, quadrant: p.quadrant, share: p.share }));
  return (
    <ResponsiveContainer width="100%" height={460}>
      <ScatterChart margin={{ top: 14, right: 24, left: -4, bottom: 4 }}>
        <Customized component={RrgDefs} />
        <CartesianGrid stroke={GRID} strokeOpacity={0.4} />
        <ReferenceArea x1={100} x2={xhi} y1={100} y2={yhi} fill="url(#qgLeading)"
          label={QLABEL("LEADING", "#16c784", "insideTopRight")} />
        <ReferenceArea x1={100} x2={xhi} y1={ylo} y2={100} fill="url(#qgWeakening)"
          label={QLABEL("WEAKENING", "#f0a020", "insideBottomRight")} />
        <ReferenceArea x1={xlo} x2={100} y1={100} y2={yhi} fill="url(#qgImproving)"
          label={QLABEL("IMPROVING", "#5b8cff", "insideTopLeft")} />
        <ReferenceArea x1={xlo} x2={100} y1={ylo} y2={100} fill="url(#qgLagging)"
          label={QLABEL("LAGGING", "#ea3943", "insideBottomLeft")} />
        <XAxis type="number" dataKey="x" name="RS-Ratio" domain={[xlo, xhi]}
          tick={AXIS} tickFormatter={(v) => v.toFixed(0)} />
        <YAxis type="number" dataKey="y" name="RS-Momentum" domain={[ylo, yhi]}
          tick={AXIS} tickFormatter={(v) => v.toFixed(0)} />
        <ZAxis range={[60, 60]} />
        <ReferenceLine x={100} stroke={th.zero} strokeDasharray="4 4" />
        <ReferenceLine y={100} stroke={th.zero} strokeDasharray="4 4" />
        <ReferenceDot x={100} y={100} r={3.5} fill={th.axis} stroke={th.ink} strokeWidth={1.5} />
        <Tooltip
          cursor={{ stroke: th.zero, strokeDasharray: "3 3" }}
          content={({ active, payload }) =>
            active && payload?.length && payload[0].payload.sector
              ? box(payload[0].payload.sector, [
                  { name: payload[0].payload.quadrant, color: QUAD_COLOR[payload[0].payload.quadrant], value: "" },
                  { name: "RS-Ratio", color: "#c7d0e0", value: payload[0].payload.x?.toFixed(1) },
                  { name: "RS-Momentum", color: "#c7d0e0", value: payload[0].payload.y?.toFixed(1) },
                  { name: "Share", color: "#8a96ab", value: payload[0].payload.share != null ? `${payload[0].payload.share}%` : "—" },
                ])
              : null
          }
        />
        {points.map((p, idx) => {
          const t = tails?.[p.sector] || [];
          if (t.length < 2) return null;
          const tdata = t.map((d, i) => ({ x: d.ratio, y: d.mom, o: i / (t.length - 1) }));
          return (
            <Scatter key={`t-${p.sector}`} data={tdata}
              line={{ stroke: QUAD_COLOR[p.quadrant], strokeWidth: 1.3, strokeOpacity: 0.32 }}
              fill={QUAD_COLOR[p.quadrant]} shape={<RrgTailDot />}
              isAnimationActive animationBegin={idx * 60} animationDuration={700} />
          );
        })}
        <Scatter data={head} shape={<RrgHead ink={th.ink} />} isAnimationActive animationDuration={900}>
          <LabelList dataKey="sector" content={<RrgLabel ink={th.ink} grid={th.grid} fg={th.fg} />} />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ───────────────────────────── Sector analytics ────────────────────────────

const SECTOR_QUAD = {
  Leading: "#16c784", Weakening: "#f0a020", Improving: "#5b8cff", Lagging: "#ea3943",
};

function SectorDot({ cx, cy, payload, onSelect, selected, ink = "#0b0f17" }) {
  if (cx == null || cy == null) return null;
  const c = SECTOR_QUAD[payload?.phase] || "#8a96ab";
  const r = 5 + Math.min(7, (payload?.r || 0));
  const on = selected === payload.sector;
  return (
    <g style={{ cursor: "pointer" }} onClick={() => onSelect?.(on ? null : payload.sector)}>
      {on && <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke={c} strokeWidth={1.5} strokeOpacity={0.6} />}
      <circle cx={cx} cy={cy} r={r} fill={c} fillOpacity={on ? 0.95 : 0.7} stroke={ink} strokeWidth={1.4} />
    </g>
  );
}

// Rotation map: each sector by long-horizon relative strength (3M vs market, x)
// against short-horizon relative strength (1M vs market, y). The four quadrants
// are the classic RRG read — Leading (top-right) through Lagging (bottom-left).
export function SectorScatter({ points, selected, onSelect }) {
  if (!points?.length) return <div className="text-sm text-muted py-8 text-center">No rotation data yet.</div>;
  const th = useChartTheme();
  const AXIS = { stroke: th.axis, fontSize: 11 };
  const maxAbsX = Math.max(4, ...points.map((p) => Math.abs(p.x ?? 0))) * 1.15;
  const maxAbsY = Math.max(4, ...points.map((p) => Math.abs(p.y ?? 0))) * 1.15;
  const QL = (value, fill, position) => ({ value, position, fill, fontSize: 9.5, fontWeight: 800, opacity: 0.5, letterSpacing: 1 });
  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart margin={{ top: 14, right: 20, left: -4, bottom: 4 }}>
        <ReferenceArea x1={0} x2={maxAbsX} y1={0} y2={maxAbsY} fill="#16c784" fillOpacity={0.05}
          label={QL("LEADING", "#16c784", "insideTopRight")} />
        <ReferenceArea x1={0} x2={maxAbsX} y1={-maxAbsY} y2={0} fill="#f0a020" fillOpacity={0.05}
          label={QL("WEAKENING", "#f0a020", "insideBottomRight")} />
        <ReferenceArea x1={-maxAbsX} x2={0} y1={0} y2={maxAbsY} fill="#5b8cff" fillOpacity={0.05}
          label={QL("IMPROVING", "#5b8cff", "insideTopLeft")} />
        <ReferenceArea x1={-maxAbsX} x2={0} y1={-maxAbsY} y2={0} fill="#ea3943" fillOpacity={0.05}
          label={QL("LAGGING", "#ea3943", "insideBottomLeft")} />
        <CartesianGrid stroke={th.grid} strokeOpacity={0.4} />
        <XAxis type="number" dataKey="x" name="3M vs mkt" domain={[-maxAbsX, maxAbsX]}
          tick={AXIS} tickFormatter={(v) => v.toFixed(0)} unit="%" />
        <YAxis type="number" dataKey="y" name="1M vs mkt" domain={[-maxAbsY, maxAbsY]}
          tick={AXIS} tickFormatter={(v) => v.toFixed(0)} unit="%" />
        <ReferenceLine x={0} stroke={th.zero} strokeDasharray="4 4" />
        <ReferenceLine y={0} stroke={th.zero} strokeDasharray="4 4" />
        <Tooltip
          cursor={{ stroke: th.zero, strokeDasharray: "3 3" }}
          content={({ active, payload }) =>
            active && payload?.length && payload[0].payload.sector
              ? box(payload[0].payload.sector, [
                  { name: payload[0].payload.phase, color: SECTOR_QUAD[payload[0].payload.phase], value: "" },
                  { name: "3M vs mkt", color: "#c7d0e0", value: `${payload[0].payload.x >= 0 ? "+" : ""}${payload[0].payload.x?.toFixed(1)}%` },
                  { name: "1M vs mkt", color: "#c7d0e0", value: `${payload[0].payload.y >= 0 ? "+" : ""}${payload[0].payload.y?.toFixed(1)}%` },
                ])
              : null
          }
        />
        <Scatter data={points} shape={<SectorDot ink={th.ink} selected={selected} onSelect={onSelect} />}
          isAnimationActive animationDuration={700}>
          <LabelList dataKey="sector" position="top" offset={8}
            style={{ fill: th.fg, fontSize: 9.5, fontWeight: 600 }}
            formatter={(v) => (v.length > 12 ? v.slice(0, 11) + "…" : v)} />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// Grouped bars: the selected sector's median return vs the market median at
// each horizon (1M / 3M / 6M / 1Y). Instantly shows out/under-performance shape.
export function SectorHorizonBars({ data }) {
  if (!data?.length) return <div className="text-sm text-muted py-8 text-center">No data.</div>;
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} barGap={2} barCategoryGap="28%">
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ ...AXIS, fontWeight: 700, fill: t.fg }} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} tickFormatter={(v) => `${v}%`} />
        <ReferenceLine y={0} stroke={t.zero} />
        <Tooltip
          cursor={{ fill: t.cursor }}
          content={({ active, payload, label }) =>
            active && payload?.length
              ? box(label, payload.map((p) => ({
                  name: p.name,
                  color: p.color,
                  value: `${p.value >= 0 ? "+" : ""}${Number(p.value).toFixed(1)}%`,
                })))
              : null
          }
        />
        <Bar dataKey="sector" name="Sector" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={700}>
          {data.map((d, i) => <Cell key={i} fill={d.sector >= 0 ? "#16c784" : "#ea3943"} />)}
        </Bar>
        <Bar dataKey="market" name="Market" radius={[3, 3, 0, 0]} fill="#5b8cff55" isAnimationActive animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Constituent map: every liquid stock in the selected sector plotted as
// momentum (x = trailing return) vs smart-money score (y), bubble sized by
// market cap. Quadrant split (x=0, y=score median) isolates the names that are
// both rising AND being accumulated — the top-right "conviction" corner.
function CDot({ cx, cy, payload, onSelect }) {
  if (cx == null || cy == null) return null;
  const up = (payload.x ?? 0) >= 0;
  const col = up ? "#16c784" : "#ea3943";
  return (
    <g style={{ cursor: onSelect ? "pointer" : "default" }} onClick={() => onSelect?.(payload.symbol)}>
      <circle cx={cx} cy={cy} r={payload.r ?? 5} fill={col} fillOpacity={0.55} stroke={col} strokeWidth={1.2} />
    </g>
  );
}

export function ConstituentScatter({ points, scoreRef = 0, onSelect }) {
  if (!points?.length) return <div className="text-sm text-muted py-10 text-center">No constituent data.</div>;
  const th = useChartTheme();
  const AXIS = { stroke: th.axis, fontSize: 11 };
  const maxAbsX = Math.max(6, ...points.map((p) => Math.abs(p.x ?? 0))) * 1.12;
  const ys = points.map((p) => p.y ?? 0);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const yPad = Math.max(4, (yMax - yMin) * 0.12);
  const QL = (value, fill, position) => ({ value, position, fill, fontSize: 9, fontWeight: 800, opacity: 0.55, letterSpacing: 0.6 });
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 14, right: 18, left: -6, bottom: 2 }}>
        <ReferenceArea x1={0} x2={maxAbsX} y1={scoreRef} y2={yMax + yPad} fill="#16c784" fillOpacity={0.06}
          label={QL("RISING · ACCUMULATED", "#16c784", "insideTopRight")} />
        <ReferenceArea x1={-maxAbsX} x2={0} y1={scoreRef} y2={yMax + yPad} fill="#5b8cff" fillOpacity={0.05}
          label={QL("WEAK · ACCUMULATED", "#5b8cff", "insideTopLeft")} />
        <ReferenceArea x1={-maxAbsX} x2={0} y1={yMin - yPad} y2={scoreRef} fill="#ea3943" fillOpacity={0.05} />
        <CartesianGrid stroke={th.grid} strokeOpacity={0.4} />
        <XAxis type="number" dataKey="x" name="Return" domain={[-maxAbsX, maxAbsX]} tick={AXIS} tickFormatter={(v) => v.toFixed(0)} unit="%" />
        <YAxis type="number" dataKey="y" name="Score" domain={[yMin - yPad, yMax + yPad]} tick={AXIS} tickFormatter={(v) => v.toFixed(0)} />
        <ZAxis type="number" dataKey="z" range={[30, 420]} />
        <ReferenceLine x={0} stroke={th.zero} strokeDasharray="4 4" />
        <ReferenceLine y={scoreRef} stroke={th.zero} strokeDasharray="4 4" />
        <Tooltip
          cursor={{ stroke: th.zero, strokeDasharray: "3 3" }}
          content={({ active, payload }) =>
            active && payload?.length && payload[0].payload.symbol
              ? box(payload[0].payload.symbol, [
                  { name: "Return", color: payload[0].payload.x >= 0 ? "#16c784" : "#ea3943", value: `${payload[0].payload.x >= 0 ? "+" : ""}${payload[0].payload.x?.toFixed(1)}%` },
                  { name: "Smart-money", color: "#c7d0e0", value: payload[0].payload.y?.toFixed(0) },
                  { name: "Mkt cap", color: "#c7d0e0", value: `₹${Math.round(payload[0].payload.z).toLocaleString("en-IN")} Cr` },
                ])
              : null
          }
        />
        <Scatter data={points} shape={<CDot onSelect={onSelect} />} isAnimationActive animationDuration={600} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// Sector "style fingerprint": six factor axes, each min-max ranked across all
// sectors so the shape reads as this sector's percentile vs peers (further out
// = stronger). The dashed ring marks the cross-sector midpoint (50).
export function SectorFactorRadar({ data }) {
  if (!data?.length) return <div className="text-sm text-muted py-10 text-center">No factor data.</div>;
  const th = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data} outerRadius="72%" margin={{ top: 10, right: 18, bottom: 6, left: 18 }}>
        <PolarGrid stroke={th.grid} />
        <PolarAngleAxis dataKey="axis" tick={{ fill: th.axis, fontSize: 10.5, fontWeight: 600 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey={() => 50} stroke={th.axis} strokeDasharray="4 3" strokeOpacity={0.45} fill="none" isAnimationActive={false} />
        <Radar dataKey="val" stroke="#5b8cff" strokeWidth={2} fill="#5b8cff" fillOpacity={0.26} isAnimationActive animationDuration={650} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length
              ? box(payload[0].payload.axis, [
                  { name: "Percentile", color: "#5b8cff", value: `${Math.round(payload[0].payload.val)} / 100` },
                  { name: payload[0].payload.unit || "value", color: "#c7d0e0", value: payload[0].payload.raw },
                ])
              : null
          }
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ───────────────────── Intelligence visual-analytics charts ─────────────────

export function QuadrantDonut({ quadrants }) {
  // Donut of how many sectors sit in each rotation quadrant right now.
  const ORDER = ["Leading", "Improving", "Weakening", "Lagging"];
  const data = ORDER
    .map((k) => ({ name: k, value: (quadrants?.[k] || []).length, color: QUAD_COLOR[k] }))
    .filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className="text-sm text-muted py-8 text-center">No rotation data yet.</div>;
  const t = useChartTheme();
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
            innerRadius={58} outerRadius={92} paddingAngle={3} stroke={t.ink} strokeWidth={2}
            isAnimationActive animationDuration={800}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length
                ? box(payload[0].name, [{ name: "Sectors", color: payload[0].payload.color, value: `${payload[0].value} · ${((payload[0].value / total) * 100).toFixed(0)}%` }])
                : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-2xl font-bold text-white tabular-nums">{total}</div>
        <div className="text-[10px] text-muted uppercase tracking-wide">sectors</div>
      </div>
    </div>
  );
}

// Gradient defs for the conviction bars (one per band).
function CvDefs() {
  const grads = [
    ["cvHigh", "#0c8f60", "#22e29a"],
    ["cvMid", "#3f6fe0", "#7aa2ff"],
    ["cvLow", "#5b677e", "#8a96ab"],
  ];
  return (
    <defs>
      {grads.map(([id, a, b]) => (
        <linearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      ))}
    </defs>
  );
}

export function ConvictionBar({ rows }) {
  // Top model-conviction names (horizontal bars, colored by conviction band).
  const data = (rows || []).slice(0, 10)
    .map((s, i) => ({ symbol: s.symbol, rank: i + 1, conviction: s.conviction, up_prob: s.up_prob, price_chg: s.price_chg }))
    .reverse(); // recharts vertical layout renders bottom-up
  if (!data.length) return <div className="text-sm text-muted py-8 text-center">No conviction data yet.</div>;
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const grad = (v) => (v >= 80 ? "url(#cvHigh)" : v >= 60 ? "url(#cvMid)" : "url(#cvLow)");
  const col = (v) => (v >= 80 ? "#16c784" : v >= 60 ? "#5b8cff" : "#8a96ab");
  return (
    <ResponsiveContainer width="100%" height={Math.max(230, data.length * 30)}>
      <BarChart data={data} layout="vertical" barCategoryGap="26%" margin={{ top: 4, right: 40, left: 6, bottom: 0 }}>
        <Customized component={CvDefs} />
        <XAxis type="number" tick={AXIS} domain={[0, 100]} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="symbol" tick={{ ...AXIS, fontWeight: 600, fill: t.fg }}
          width={92} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: t.cursor }}
          content={({ active, payload }) =>
            active && payload?.length
              ? box(`#${payload[0].payload.rank} · ${payload[0].payload.symbol}`, [
                  { name: "Conviction", color: col(payload[0].value), value: Math.round(payload[0].value) },
                  { name: "Up-prob", color: "#5b8cff", value: `${payload[0].payload.up_prob}%` },
                  { name: "Price 6m", color: payload[0].payload.price_chg >= 0 ? "#16c784" : "#ea3943", value: `${payload[0].payload.price_chg >= 0 ? "+" : ""}${payload[0].payload.price_chg}%` },
                ])
              : null
          }
        />
        <Bar dataKey="conviction" name="Conviction" radius={[0, 4, 4, 0]} barSize={14}
          background={{ fill: t.cursor, radius: [0, 4, 4, 0] }} isAnimationActive animationDuration={850}>
          {data.map((d, i) => <Cell key={i} fill={grad(d.conviction)} />)}
          <LabelList dataKey="conviction" position="right" offset={8} formatter={(v) => Math.round(v)}
            style={{ fill: t.fg, fontSize: 11, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SignalDonut({ data, onSliceClick, activeLabel }) {
  // Donut of the screener's accumulation/distribution signal mix.
  const slices = (data || []).filter((d) => d.count > 0);
  const total = slices.reduce((s, d) => s + d.count, 0);
  if (!total) return <div className="text-sm text-muted py-8 text-center">No signal data.</div>;
  // net breadth = (accumulation share − distribution share)
  const acc = slices.filter((d) => /Accumulation/i.test(d.label)).reduce((s, d) => s + d.count, 0);
  const dist = slices.filter((d) => /Distribution/i.test(d.label)).reduce((s, d) => s + d.count, 0);
  const netPct = Math.round(((acc - dist) / total) * 100);
  const t = useChartTheme();
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={slices} dataKey="count" nameKey="label" cx="50%" cy="50%"
            innerRadius={58} outerRadius={92} paddingAngle={3} stroke={t.ink} strokeWidth={2}
            onClick={(d) => onSliceClick?.(d?.label)} isAnimationActive animationDuration={800}
            cursor={onSliceClick ? "pointer" : "default"}>
            {slices.map((d, i) => (
              <Cell key={i} fill={d.hex}
                opacity={activeLabel && activeLabel !== d.label ? 0.35 : 1}
                stroke={activeLabel === d.label ? t.fg : t.ink} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length
                ? box(payload[0].name, [{ name: "Stocks", color: payload[0].payload.hex, value: `${payload[0].value} · ${((payload[0].value / total) * 100).toFixed(0)}%` }])
                : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className={`text-2xl font-bold tabular-nums ${netPct >= 0 ? "text-up" : "text-down"}`}>
          {netPct >= 0 ? "+" : ""}{netPct}%
        </div>
        <div className="text-[10px] text-muted uppercase tracking-wide">net breadth</div>
      </div>
    </div>
  );
}

export function IpiChart({ data }) {
  // Institutional Pressure Index per month (−100…+100): blended z-scores of FII
  // cash, DII, and FII index-futures nets. Bars above zero = net institutional
  // demand, below = de-risking.
  if (!data?.length) return <div className="text-sm text-muted py-8 text-center">No regime data yet.</div>;
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={AXIS} tickFormatter={(d) => d?.slice(2)} />
        <YAxis tick={AXIS} domain={[-100, 100]} />
        <ReferenceLine y={0} stroke={t.zero} />
        <Tooltip
          cursor={{ fill: t.cursor }}
          content={({ active, payload, label }) =>
            active && payload?.length && payload[0].value != null
              ? box(label, [
                  { name: "IPI", color: payload[0].value >= 0 ? "#16c784" : "#ea3943", value: Number(payload[0].value).toFixed(0) },
                  { name: "FII cash", color: "#8a96ab", value: inr(payload[0].payload.fii) },
                  { name: "DII", color: "#8a96ab", value: inr(payload[0].payload.dii) },
                ])
              : null
          }
        />
        <Bar dataKey="ipi" name="IPI" radius={[2, 2, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.ipi >= 0 ? "#16c784" : "#ea3943"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ───────────────────────── Screener insight charts ─────────────────────────

export function ScoreHistogram({ data, onBarClick, activeBucket }) {
  // Distribution of smart-money scores across the screened universe.
  // Bars are clickable to drill into the stocks in each score band.
  if (!data?.length) return <div className="text-sm text-muted py-8 text-center">No data.</div>;
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  const clickable = typeof onBarClick === "function";
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="bucket" tick={AXIS} interval={0} />
        <YAxis tick={AXIS} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: t.cursor }}
          content={({ active, payload, label }) =>
            active && payload?.length
              ? box(`Score ${label}`, [
                  { name: "Stocks", color: payload[0].payload.color, value: payload[0].value },
                  ...(clickable ? [{ name: "", color: "#8a96ab", value: "click to view" }] : []),
                ])
              : null
          }
        />
        <Bar dataKey="count" name="Stocks" radius={[3, 3, 0, 0]}
          cursor={clickable ? "pointer" : "default"}
          onClick={clickable ? (entry) => onBarClick(entry) : undefined}
          isAnimationActive animationDuration={700}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color}
              opacity={activeBucket && activeBucket !== d.bucket ? 0.4 : 1}
              stroke={activeBucket === d.bucket ? t.fg : "none"} strokeWidth={1.5} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BreadthScatter({ data, onPointClick }) {
  // Each stock by day % change (x) vs delivery % (y); bubble size = turnover.
  // Top-right = rising on heavy real delivery (genuine demand). Clickable.
  if (!data?.length) return <div className="text-sm text-muted py-8 text-center">No data.</div>;
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  const clickable = typeof onPointClick === "function";
  return (
    <ResponsiveContainer width="100%" height={210}>
      <ScatterChart margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} />
        <ReferenceArea x1={0} x2={8} y1={50} y2={100} fill="#16c784" fillOpacity={0.05}
          label={{ value: "REAL DEMAND", position: "insideTopRight", fill: "#16c784", fontSize: 9, fontWeight: 800, opacity: 0.5 }} />
        <ReferenceArea x1={-8} x2={0} y1={50} y2={100} fill="#f0a020" fillOpacity={0.05}
          label={{ value: "ABSORPTION", position: "insideTopLeft", fill: "#f0a020", fontSize: 9, fontWeight: 800, opacity: 0.5 }} />
        <XAxis type="number" dataKey="x" name="Chg %" tick={AXIS} unit="%"
          domain={[-8, 8]} allowDataOverflow tickFormatter={(v) => v.toFixed(0)} />
        <YAxis type="number" dataKey="y" name="Deliv %" tick={AXIS} unit="%" domain={[0, 100]} />
        <ZAxis type="number" dataKey="z" range={[18, 260]} />
        <ReferenceLine x={0} stroke={t.zero} />
        <ReferenceLine y={50} stroke={t.zero} strokeDasharray="3 3" />
        <Tooltip
          cursor={{ stroke: t.zero, strokeDasharray: "3 3" }}
          content={({ active, payload }) =>
            active && payload?.length && payload[0].payload.symbol
              ? box(payload[0].payload.symbol, [
                  { name: "Chg", color: payload[0].payload.x >= 0 ? "#16c784" : "#ea3943", value: `${payload[0].payload.x.toFixed(2)}%` },
                  { name: "Delivery", color: "#5b8cff", value: `${payload[0].payload.y.toFixed(0)}%` },
                  { name: "Turnover", color: "#8a96ab", value: `₹${Number(payload[0].payload.turnover).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr` },
                  ...(clickable ? [{ name: "", color: "#8a96ab", value: "click to open" }] : []),
                ])
              : null
          }
        />
        <Scatter data={data} shape="circle" cursor={clickable ? "pointer" : "default"}
          onClick={clickable ? (node) => onPointClick(node?.symbol || node?.payload?.symbol) : undefined}>
          {data.map((d, i) => <Cell key={i} fill={d.x >= 0 ? "#16c78488" : "#ea394388"} />)}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function MbProbBar({ data }) {
  // Highest KNN multibagger probabilities (horizontal bars).
  if (!data?.length) return <div className="text-sm text-muted py-8 text-center">No probabilities yet.</div>;
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} unit="%" domain={[0, "dataMax"]} />
        <YAxis type="category" dataKey="symbol" tick={AXIS} width={78} />
        <Tooltip
          cursor={{ fill: t.cursor }}
          content={({ active, payload, label }) =>
            active && payload?.length
              ? box(label, [{ name: "Probability", color: "#c77dff", value: `${Number(payload[0].value).toFixed(1)}%` }])
              : null
          }
        />
        <Bar dataKey="prob" name="Probability" fill="#c77dff" radius={[0, 3, 3, 0]}>
          <LabelList dataKey="prob" position="right" formatter={(v) => `${v.toFixed(0)}%`}
            style={{ fill: t.fg, fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OiChart({ data }) {
  const has = data.some((d) => d.oi != null);
  if (!has) return <div className="text-sm text-muted py-8 text-center">Not in F&O segment.</div>;
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <defs>
          <linearGradient id="oi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5b8cff" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#5b8cff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => d?.slice(5)} />
        <YAxis tick={AXIS} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length
              ? box(label, [{ name: "Open Interest", color: "#5b8cff", value: Number(payload[0].value).toLocaleString("en-IN") }])
              : null
          }
        />
        <Area dataKey="oi" name="OI" stroke="#5b8cff" fill="url(#oi)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Interactive sector-performance explorer (dashboard) ───────────────────────
// Each sector is an equal-weight composite (median of its stocks' prices rebased
// to the window start). Pick a horizon to reset the window; pick a sector to
// spotlight it against the all-stock market composite and see the min/median/max
// spread of its constituents' returns. Reads the `sector_performance` payload.
const SECPERF_HZ = [
  { k: "1m", label: "1M", on: true },
  { k: "3m", label: "3M", on: true },
  { k: "6m", label: "6M", on: true },
  { k: "1y", label: "1Y", on: true },
  { k: "2y", label: "2Y", on: false },
  { k: "3y", label: "3Y", on: false },
];
const SECTOR_PALETTE = [
  "#5b8cff", "#16c784", "#f0a020", "#c77dff", "#ff6b9d", "#22d3ee",
  "#a3e635", "#fb923c", "#e879f9", "#34d399", "#facc15", "#60a5fa",
  "#f87171", "#4ade80", "#fbbf24", "#a78bfa", "#2dd4bf", "#fb7185",
  "#38bdf8", "#84cc16", "#fcd34d", "#c084fc", "#10b981", "#f97316",
];
const spFmt = (v, sign = true) =>
  v == null ? "—" : `${v >= 0 ? (sign ? "+" : "") : ""}${Number(v).toFixed(1)}%`;
const spMonth = (iso) => {
  const [y, m] = (iso || "").split("-");
  if (!m) return iso;
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1]} '${y.slice(2)}`;
};

export function SectorPerformanceChart({ data }) {
  const t = useChartTheme();
  const [hz, setHz] = useState("1y");
  const [sel, setSel] = useState(null);
  const [hov, setHov] = useState(null);

  const sectors = data?.sectors || [];
  const colorOf = useMemo(() => {
    const m = {};
    sectors.forEach((s, i) => { m[s.sector] = SECTOR_PALETTE[i % SECTOR_PALETTE.length]; });
    return m;
  }, [sectors]);

  const hzLabel = SECPERF_HZ.find((h) => h.k === hz)?.label || hz;

  const view = useMemo(() => {
    const dates = data?.dates || [];
    const n = dates.length;
    if (!n) return null;
    const sessions = data?.sessions?.[hz] ?? n - 1;
    const start = Math.max(0, n - 1 - sessions);
    const rebase = (series) => {
      const base = series?.[start];
      if (!base) return series?.slice(start).map(() => null) || [];
      return series.slice(start).map((v) => (v == null ? null : (v / base - 1) * 100));
    };
    const slicedDates = dates.slice(start);
    const perSector = sectors.map((s) => {
      const reb = rebase(s.series);
      return { ...s, reb, ret: reb.length ? reb[reb.length - 1] : null };
    });
    const mktReb = rebase(data?.market?.series || []);
    const mktRet = mktReb.length ? mktReb[mktReb.length - 1] : null;
    const rows = slicedDates.map((date, i) => {
      const o = { date, __mkt: mktReb[i] };
      perSector.forEach((s) => { o[s.sector] = s.reb[i]; });
      return o;
    });
    const ranked = [...perSector].sort((a, b) => (b.ret ?? -1e9) - (a.ret ?? -1e9));
    const maxAbs = Math.max(1, ...ranked.map((s) => Math.abs(s.ret ?? 0)));
    return { rows, ranked, maxAbs, mktReb, mktRet, sessions };
  }, [data, sectors, hz]);

  // auto-generated, horizon-aware takeaways — breadth, rotation, dispersion
  const insights = useMemo(() => {
    if (!view) return [];
    const { ranked, mktRet } = view;
    const dates = data?.dates || [];
    const n = dates.length;
    const s1m = data?.sessions?.["1m"] ?? 21;
    const start1m = Math.max(0, n - 1 - s1m);
    const ret1m = (series) => {
      const b = series?.[start1m], l = series?.[n - 1];
      return b != null && l != null && b !== 0 ? (l / b - 1) * 100 : null;
    };
    const mom = ranked.map((s) => ({ ...s, m1: ret1m(s.series) }));
    const out = [];

    // 1) breadth & regime
    const beat = ranked.filter((s) => (s.ret ?? -1e9) > (mktRet ?? 0)).length;
    const majUp = ranked.filter((s) => (s.stats?.[hz]?.median ?? -1) > 0).length;
    out.push({
      kind: "breadth",
      beat,
      total: ranked.length,
      majUp,
      mktMedian: data?.market?.stats?.[hz]?.median ?? null,
      tone: beat * 2 >= ranked.length ? "up" : "down",
    });

    // 2) momentum rotation — surface the single most notable shift (window > 1M)
    if (hz !== "1m") {
      const turnUp = mom
        .filter((s) => (s.ret ?? 0) < 0 && (s.m1 ?? -99) > 1.5)
        .sort((a, b) => b.m1 - a.m1)[0];
      const rollOver = mom
        .filter((s) => (s.ret ?? 0) > 0 && (s.m1 ?? 99) < -1.5)
        .sort((a, b) => a.m1 - b.m1)[0];
      const upMag = turnUp ? turnUp.m1 : -1e9;
      const downMag = rollOver ? -rollOver.m1 : -1e9;
      if (upMag >= downMag && turnUp) {
        out.push({ kind: "turnUp", sector: turnUp.sector, ret: turnUp.ret, m1: turnUp.m1, tone: "up" });
      } else if (rollOver) {
        out.push({ kind: "rollOver", sector: rollOver.sector, ret: rollOver.ret, m1: rollOver.m1, tone: "down" });
      }
    }

    // 3) widest constituent dispersion — where stock selection matters most
    const disp = ranked
      .map((s) => ({ sector: s.sector, st: s.stats?.[hz] }))
      .filter((d) => d.st && d.st.max != null && d.st.min != null)
      .map((d) => ({ ...d, spread: d.st.max - d.st.min }))
      .sort((a, b) => b.spread - a.spread)[0];
    if (disp) out.push({ kind: "disp", sector: disp.sector, min: disp.st.min, max: disp.st.max, median: disp.st.median, tone: "accent" });

    return out.slice(0, 3);
  }, [view, data, hz]);

  if (!sectors.length || !view) {
    return (
      <div className="text-sm text-muted py-10 text-center">
        Sector-performance history builds as the pipeline runs daily.
      </div>
    );
  }

  const { rows, ranked, maxAbs, mktRet } = view;
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const selObj = sel ? ranked.find((s) => s.sector === sel) : null;
  const stat = selObj?.stats?.[hz] || null;
  const rank = selObj ? ranked.findIndex((s) => s.sector === sel) + 1 : 0;
  const mStat = data?.market?.stats?.[hz] || null;
  const pos = (v) =>
    stat && stat.max !== stat.min
      ? Math.max(0, Math.min(100, ((v - stat.min) / (stat.max - stat.min)) * 100))
      : 50;

  // sector being emphasised on the chart — a click pins it, a hover previews it
  const emph = sel || hov;
  const emphColor = emph ? colorOf[emph] : "#5b8cff";
  const leader = ranked[0];
  const laggard = ranked[ranked.length - 1];
  const adv = ranked.filter((s) => (s.ret ?? 0) >= 0).length;
  const dec = ranked.length - adv;

  return (
    <div>
      {/* controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-line bg-ink/40 p-0.5">
          {SECPERF_HZ.map((h) => (
            <button
              key={h.k}
              disabled={!h.on}
              onClick={() => h.on && setHz(h.k)}
              title={h.on ? undefined : "Needs more than 1 year of history — a deeper backfill is pending"}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                hz === h.k
                  ? "bg-accent text-white shadow"
                  : h.on
                  ? "text-muted hover:text-white"
                  : "text-muted/40 cursor-not-allowed"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
        <select
          value={sel || ""}
          onChange={(e) => setSel(e.target.value || null)}
          className="bg-ink/40 border border-line rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-accent max-w-[14rem]"
        >
          <option value="">All sectors</option>
          {[...sectors]
            .sort((a, b) => a.sector.localeCompare(b.sector))
            .map((s) => (
              <option key={s.sector} value={s.sector}>
                {s.sector} ({s.count})
              </option>
            ))}
        </select>
      </div>

      {/* at-a-glance KPI band */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        <button
          onClick={() => setSel(sel === leader?.sector ? null : leader?.sector)}
          onMouseEnter={() => setHov(leader?.sector)}
          onMouseLeave={() => setHov(null)}
          className="text-left rounded-xl border border-up/20 bg-up/[0.05] p-3 transition hover:border-up/40"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted mb-1">Leader · {hzLabel}</div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colorOf[leader?.sector] }} />
            <span className="text-sm font-semibold text-white truncate" title={leader?.sector}>{leader?.sector}</span>
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-up mt-0.5">{spFmt(leader?.ret)}</div>
        </button>
        <button
          onClick={() => setSel(sel === laggard?.sector ? null : laggard?.sector)}
          onMouseEnter={() => setHov(laggard?.sector)}
          onMouseLeave={() => setHov(null)}
          className="text-left rounded-xl border border-down/20 bg-down/[0.05] p-3 transition hover:border-down/40"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted mb-1">Laggard · {hzLabel}</div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colorOf[laggard?.sector] }} />
            <span className="text-sm font-semibold text-white truncate" title={laggard?.sector}>{laggard?.sector}</span>
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-down mt-0.5">{spFmt(laggard?.ret)}</div>
        </button>
        <div className="rounded-xl border border-line bg-ink/30 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted mb-1">Market composite</div>
          <div className="text-sm font-semibold text-white">All {mStat?.n ?? "—"} stocks</div>
          <div className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${(mktRet ?? 0) >= 0 ? "text-up" : "text-down"}`}>
            {spFmt(mktRet)}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-ink/30 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted mb-1">Breadth</div>
          <div className="text-sm font-semibold text-white">{adv} up · {dec} down</div>
          <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-line">
            <span className="bg-up h-full" style={{ width: `${(adv / ranked.length) * 100}%` }} />
            <span className="bg-down h-full" style={{ width: `${(dec / ranked.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* chart + spotlight */}
        <div className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={rows} margin={{ top: 8, right: 10, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="spEmphFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={emphColor} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={emphColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickFormatter={spMonth} minTickGap={48} />
              <YAxis tick={AXIS} width={46} tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`} />
              <ReferenceLine y={0} stroke={t.zero} />
              <Tooltip
                cursor={{ stroke: t.axis, strokeDasharray: "3 3" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const mkt = payload.find((p) => p.dataKey === "__mkt");
                  const items = payload.filter((p) => p.dataKey !== "__mkt" && p.value != null);
                  let picks;
                  if (emph) {
                    picks = [items.find((p) => p.dataKey === emph), mkt].filter(Boolean);
                  } else {
                    const s = [...items].sort((a, b) => b.value - a.value);
                    picks = [s[0], s[s.length - 1], mkt].filter(Boolean);
                  }
                  return box(
                    spMonth(label),
                    picks.map((p) => ({
                      name: p.dataKey === "__mkt" ? "Market" : p.dataKey,
                      color: p.dataKey === "__mkt" ? t.axis : colorOf[p.dataKey],
                      value: spFmt(p.value),
                    }))
                  );
                }}
              />
              {sectors.map((s) => {
                if (s.sector === emph) return null; // emphasised drawn as an area on top
                const dim = !!emph;
                return (
                  <Line
                    key={s.sector}
                    dataKey={s.sector}
                    dot={false}
                    isAnimationActive={false}
                    stroke={dim ? t.grid : colorOf[s.sector]}
                    strokeOpacity={emph ? 0.12 : 0.5}
                    strokeWidth={1}
                  />
                );
              })}
              <Line
                dataKey="__mkt"
                name="Market"
                dot={false}
                isAnimationActive={false}
                stroke={t.axis}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              {emph && (
                <Area
                  dataKey={emph}
                  isAnimationActive={false}
                  baseValue={0}
                  stroke={emphColor}
                  strokeWidth={2.75}
                  fill="url(#spEmphFill)"
                  dot={false}
                  activeDot={{ r: 3, fill: emphColor, stroke: t.ink }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
            <LegendSwatch color={t.axis} label="Market composite (dashed)" />
            <span>·</span>
            <span>Rebased to 100 at the start of the {hzLabel} window</span>
            {!sel && <span className="ml-auto text-muted/70">Hover or click a sector to spotlight it →</span>}
          </div>

          {/* spotlight drill-down */}
          {selObj ? (
            <div className="mt-4 rounded-xl border border-accent/25 bg-accent/[0.04] p-4">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorOf[sel] }} />
                <span className="font-semibold text-white">{sel}</span>
                <span className="chip text-[10px] bg-line/40 text-muted">{selObj.count} stocks</span>
                <button onClick={() => setSel(null)} className="ml-auto text-[11px] text-muted hover:text-white">
                  Clear ✕
                </button>
              </div>
              <div className="flex items-end gap-3 flex-wrap mb-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted">Composite · {hzLabel}</div>
                  <div className={`text-2xl font-bold font-mono tabular-nums ${(selObj.ret ?? 0) >= 0 ? "text-up" : "text-down"}`}>
                    {spFmt(selObj.ret)}
                  </div>
                </div>
                <div className="text-xs text-muted pb-1">
                  vs market{" "}
                  <span className={(selObj.ret - mktRet) >= 0 ? "text-up" : "text-down"}>
                    {spFmt(selObj.ret - mktRet)}
                  </span>{" "}
                  · rank #{rank} of {ranked.length}
                </div>
              </div>
              {stat ? (
                <div>
                  <div className="flex justify-between text-[11px] text-muted mb-1">
                    <span>Worst stock</span>
                    <span>Median</span>
                    <span>Best stock</span>
                  </div>
                  <div className="relative h-2.5 rounded-full overflow-visible">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-down/50 via-line to-up/50" />
                    <span className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-3.5 rounded bg-down/80" />
                    <span className="absolute top-1/2 -translate-y-1/2 right-0 w-0.5 h-3.5 rounded bg-up/80" />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-5 rounded-full bg-white shadow ring-2 ring-accent/40"
                      style={{ left: `${pos(stat.median)}%` }}
                      title={`Median ${spFmt(stat.median)}`}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 font-mono text-xs tabular-nums">
                    <span className="text-down">{spFmt(stat.min)}</span>
                    <span className={stat.median >= 0 ? "text-up font-semibold" : "text-down font-semibold"}>
                      {spFmt(stat.median)}
                    </span>
                    <span className="text-up">{spFmt(stat.max)}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-2">
                    {stat.n} of {selObj.count} stocks have ≥{hzLabel} of history · spread of trailing returns
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted">No constituent has a full {hzLabel} of history yet.</div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-line bg-ink/30 p-3 text-xs text-muted flex items-center gap-2 flex-wrap">
              <span className="text-white/80 font-medium">Market composite {spFmt(mktRet)} over {hzLabel}</span>
              {mStat && <span>· {mStat.n} stocks · median {spFmt(mStat.median)}</span>}
              <span className="ml-auto">Pick a sector to see its stock-level spread →</span>
            </div>
          )}
        </div>

        {/* ranked list — diverging bars around a centre line */}
        <div className="rounded-xl border border-line bg-ink/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wide text-muted">Return · {hzLabel}</span>
            <span className="text-[11px] text-muted">{ranked.length} sectors</span>
          </div>
          <div className="space-y-0.5 max-h-[360px] overflow-y-auto pr-1">
            {ranked.map((s, i) => {
              const active = sel === s.sector;
              const previewed = hov === s.sector;
              const up = (s.ret ?? 0) >= 0;
              const half = Math.min(50, (Math.abs(s.ret ?? 0) / maxAbs) * 50);
              return (
                <button
                  key={s.sector}
                  onClick={() => setSel(active ? null : s.sector)}
                  onMouseEnter={() => setHov(s.sector)}
                  onMouseLeave={() => setHov(null)}
                  className={`w-full flex items-center gap-2 text-xs -mx-1 px-1.5 py-1 rounded-lg transition ${
                    active ? "bg-accent/15 ring-1 ring-accent/30" : previewed ? "bg-line/50" : "hover:bg-line/40"
                  }`}
                >
                  <span className="w-4 text-right text-[10px] tabular-nums text-muted/70 shrink-0">{i + 1}</span>
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colorOf[s.sector] }} />
                  <span className="w-[6.5rem] truncate text-left text-white/90" title={s.sector}>
                    {s.sector}
                  </span>
                  <span className="relative flex-1 h-2 rounded bg-line/40">
                    <span className="absolute top-0 bottom-0 left-1/2 w-px bg-line" />
                    {up ? (
                      <span className="absolute top-0 bottom-0 left-1/2 bg-up rounded-r" style={{ width: `${half}%` }} />
                    ) : (
                      <span className="absolute top-0 bottom-0 right-1/2 bg-down rounded-l" style={{ width: `${half}%` }} />
                    )}
                  </span>
                  <span className={`w-12 text-right font-mono tabular-nums ${up ? "text-up" : "text-down"}`}>
                    {spFmt(s.ret, false)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* auto-generated takeaways */}
      {insights.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wide text-muted mb-2">What the data is telling you · {hzLabel}</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {insights.map((ins) => {
              const tone =
                ins.tone === "up" ? "text-up" : ins.tone === "down" ? "text-down" : "text-accent";
              const ring =
                ins.tone === "up" ? "border-up/25" : ins.tone === "down" ? "border-down/25" : "border-accent/25";
              if (ins.kind === "breadth") {
                return (
                  <div key="breadth" className={`rounded-xl border ${ring} bg-ink/30 p-3`}>
                    <div className="text-[10px] uppercase tracking-wide text-muted mb-1">Market breadth</div>
                    <div className="text-sm text-white/90 leading-snug">
                      <span className={`font-bold ${tone}`}>{ins.beat} of {ins.total}</span> sectors beat the market.
                    </div>
                    <div className="text-[11px] text-muted mt-1.5">
                      {ins.majUp} sectors have most stocks up (median &gt; 0)
                      {ins.mktMedian != null && <> · median NSE stock {spFmt(ins.mktMedian)}</>}.
                    </div>
                  </div>
                );
              }
              if (ins.kind === "turnUp" || ins.kind === "rollOver") {
                const up = ins.kind === "turnUp";
                return (
                  <button
                    key={ins.kind}
                    onClick={() => setSel(ins.sector)}
                    className={`text-left rounded-xl border ${ring} bg-ink/30 p-3 transition hover:bg-line/30`}
                  >
                    <div className="text-[10px] uppercase tracking-wide text-muted mb-1">
                      {up ? "Turning up" : "Losing steam"}
                    </div>
                    <div className="text-sm text-white/90 leading-snug">
                      <span className="font-semibold text-white">{ins.sector}</span>{" "}
                      <span className={`font-bold ${tone}`}>{spFmt(ins.m1)}</span> last month.
                    </div>
                    <div className="text-[11px] text-muted mt-1.5">
                      {up
                        ? `Down ${spFmt(ins.ret, false)} over ${hzLabel} but leading the recent tape — a possible reversal.`
                        : `Up ${spFmt(ins.ret, false)} over ${hzLabel} yet rolling over lately — momentum is cooling.`}
                    </div>
                  </button>
                );
              }
              // dispersion
              return (
                <button
                  key="disp"
                  onClick={() => setSel(ins.sector)}
                  className={`text-left rounded-xl border ${ring} bg-ink/30 p-3 transition hover:bg-line/30`}
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted mb-1">Stock-picker&apos;s sector</div>
                  <div className="text-sm text-white/90 leading-snug">
                    <span className="font-semibold text-white">{ins.sector}</span> stocks span{" "}
                    <span className="font-bold text-down">{spFmt(ins.min, false)}</span> to{" "}
                    <span className="font-bold text-up">{spFmt(ins.max, false)}</span>.
                  </div>
                  <div className="text-[11px] text-muted mt-1.5">
                    Widest constituent spread over {hzLabel} — selection matters most here.
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted mt-4">
        Each sector curve is the median of its stocks&apos; prices rebased to the window start — a typical-stock read
        robust to any single outlier. Descriptive performance, <span className="text-white">not investment advice</span>.
      </p>
    </div>
  );
}
