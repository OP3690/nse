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

function useChartTheme() {
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

export function FiiDiiChart({ data }) {
  const t = useChartTheme();
  const AXIS = { stroke: t.axis, fontSize: 11 };
  const GRID = t.grid;
  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => d?.slice(5)} />
          <YAxis tick={AXIS} />
          <ReferenceLine y={0} stroke={t.zero} />
          <Tooltip
            cursor={{ fill: t.cursor }}
            content={({ active, payload, label }) =>
              active && payload?.length
                ? box(label, payload.map((p) => ({
                    name: p.name === "fii" ? "FII" : p.name === "dii" ? "DII" : p.name,
                    color: p.value >= 0
                      ? (p.dataKey === "fii" ? "#16c784" : "#5b8cff")
                      : (p.dataKey === "fii" ? "#ea3943" : "#f0a020"),
                    value: `${p.value >= 0 ? "+" : ""}₹${Number(p.value).toLocaleString("en-IN")} Cr ${p.value >= 0 ? "(net buy)" : "(net sell)"}`,
                  })))
                : null
            }
          />
          <Bar dataKey="fii" name="FII" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.fii >= 0 ? "#16c784" : "#ea3943"} />)}
          </Bar>
          <Bar dataKey="dii" name="DII" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.dii >= 0 ? "#5b8cff" : "#f0a020"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
        <span className="font-semibold text-white/80">FII</span>
        <LegendSwatch color="#16c784" label="net buy" />
        <LegendSwatch color="#ea3943" label="net sell" />
        <span className="mx-1 h-3 w-px bg-line" />
        <span className="font-semibold text-white/80">DII</span>
        <LegendSwatch color="#5b8cff" label="net buy" />
        <LegendSwatch color="#f0a020" label="net sell" />
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

      <div className="grid lg:grid-cols-3 gap-5">
        {/* chart + spotlight */}
        <div className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={rows} margin={{ top: 8, right: 10, left: -8, bottom: 0 }}>
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
                  if (sel) {
                    picks = [items.find((p) => p.dataKey === sel), mkt].filter(Boolean);
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
                const isSel = sel === s.sector;
                const dim = sel && !isSel;
                return (
                  <Line
                    key={s.sector}
                    dataKey={s.sector}
                    dot={false}
                    isAnimationActive={false}
                    stroke={dim ? t.grid : colorOf[s.sector]}
                    strokeOpacity={sel ? (isSel ? 1 : 0.12) : 0.5}
                    strokeWidth={isSel ? 2.75 : 1}
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
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
            <LegendSwatch color={t.axis} label="Market composite (dashed)" />
            <span>·</span>
            <span>Rebased to 100 at the start of the {hzLabel} window</span>
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
                  <div className="relative h-2.5 rounded-full overflow-hidden">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-down/50 via-line to-up/50" />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-5 rounded-full bg-white shadow"
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

        {/* ranked list */}
        <div className="rounded-xl border border-line bg-ink/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wide text-muted">Return · {hzLabel}</span>
            <span className="text-[11px] text-muted">{ranked.length} sectors</span>
          </div>
          <div className="space-y-0.5 max-h-[330px] overflow-y-auto pr-1">
            {ranked.map((s) => {
              const active = sel === s.sector;
              return (
                <button
                  key={s.sector}
                  onClick={() => setSel(active ? null : s.sector)}
                  className={`w-full flex items-center gap-2 text-xs -mx-1 px-1.5 py-1 rounded-lg transition ${
                    active ? "bg-accent/15" : "hover:bg-line/40"
                  }`}
                >
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colorOf[s.sector] }} />
                  <span className="w-[7.5rem] truncate text-left text-white/90" title={s.sector}>
                    {s.sector}
                  </span>
                  <span className="flex-1 h-1.5 rounded bg-line overflow-hidden">
                    <span
                      className={`${(s.ret ?? 0) >= 0 ? "bg-up" : "bg-down"} h-full block rounded`}
                      style={{ width: `${Math.min(100, (Math.abs(s.ret ?? 0) / maxAbs) * 100)}%` }}
                    />
                  </span>
                  <span className={`w-12 text-right font-mono tabular-nums ${(s.ret ?? 0) >= 0 ? "text-up" : "text-down"}`}>
                    {spFmt(s.ret, false)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted mt-4">
        Each sector curve is the median of its stocks&apos; prices rebased to the window start — a typical-stock read
        robust to any single outlier. Descriptive performance, <span className="text-white">not investment advice</span>.
      </p>
    </div>
  );
}
