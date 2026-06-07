"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Area, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, ReferenceArea, Cell,
} from "recharts";

const AXIS = { stroke: "#8a96ab", fontSize: 11 };
const GRID = "#243049";
const fmtN = (n) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
const fmtVol = (n) => {
  if (n == null) return "—";
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return Number(n).toLocaleString("en-IN");
};

// ---- indicator math (computed client-side over the close series) ------------
function sma(closes, n) {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function bollinger(closes, n = 20, k = 2) {
  const mid = sma(closes, n);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = n - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / n);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
  }
  return { mid, upper, lower };
}

function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let avgG = 0, avgL = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (i <= period) {
      avgG += g; avgL += l;
      if (i === period) {
        avgG /= period; avgL /= period;
        out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
      }
    } else {
      avgG = (avgG * (period - 1) + g) / period;
      avgL = (avgL * (period - 1) + l) / period;
      out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
  }
  return out;
}

const RANGES = [
  ["1M", 22], ["3M", 66], ["6M", 132], ["1Y", 252], ["ALL", Infinity],
];

export default function StockTechnicals({ data }) {
  const [range, setRange] = useState("6M");
  const [showBoll, setShowBoll] = useState(true);

  const enriched = useMemo(() => {
    const closes = data.map((d) => d.close);
    const s20 = sma(closes, 20);
    const s50 = sma(closes, 50);
    const bb = bollinger(closes, 20, 2);
    const r = rsi(closes, 14);
    return data.map((d, i) => ({
      ...d,
      sma20: s20[i] != null ? +s20[i].toFixed(2) : null,
      sma50: s50[i] != null ? +s50[i].toFixed(2) : null,
      bbU: bb.upper[i] != null ? +bb.upper[i].toFixed(2) : null,
      bbL: bb.lower[i] != null ? +bb.lower[i].toFixed(2) : null,
      // range-area tuple [lower, upper] — does NOT anchor to 0 like a stacked area
      bb: bb.upper[i] != null ? [+bb.lower[i].toFixed(2), +bb.upper[i].toFixed(2)] : null,
      rsi: r[i] != null ? +r[i].toFixed(1) : null,
      up: (d.pct ?? 0) >= 0,
    }));
  }, [data]);

  const rows = useMemo(() => {
    const n = RANGES.find(([k]) => k === range)?.[1] ?? Infinity;
    return n === Infinity ? enriched : enriched.slice(Math.max(0, enriched.length - n));
  }, [enriched, range]);

  const last = enriched[enriched.length - 1] || {};
  const rsiVal = last.rsi;
  const rsiTone = rsiVal == null ? "text-muted" : rsiVal >= 70 ? "text-down" : rsiVal <= 30 ? "text-up" : "text-white";
  const priceVsSma = last.close != null && last.sma50 != null
    ? (last.close >= last.sma50 ? "above" : "below") : null;

  const tip = (active, payload, label) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload || {};
    return (
      <div className="bg-panel2 border border-line rounded-lg px-3 py-2 text-xs shadow-lg min-w-[170px]">
        <div className="text-muted mb-1">{label}</div>
        <Row k="Close" v={`₹${fmtN(p.close)}`} c={p.up ? "#16c784" : "#ea3943"} />
        {p.sma20 != null && <Row k="SMA 20" v={`₹${fmtN(p.sma20)}`} c="#f0a020" />}
        {p.sma50 != null && <Row k="SMA 50" v={`₹${fmtN(p.sma50)}`} c="#5b8cff" />}
        {showBoll && p.bbU != null && <Row k="Boll U/L" v={`${fmtN(p.bbU)} / ${fmtN(p.bbL)}`} c="#8a96ab" />}
        <Row k="Volume" v={fmtVol(p.volume)} c="#8a96ab" />
        {p.deliv != null && <Row k="Delivery" v={`${p.deliv.toFixed(1)}%`} c="#8a96ab" />}
        {p.rsi != null && <Row k="RSI 14" v={p.rsi.toFixed(1)} c="#c77dff" />}
      </div>
    );
  };

  return (
    <div>
      {/* header: live indicator readout + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-mono">
          <span><span className="text-muted">SMA20 </span><span className="text-[#f0a020]">{last.sma20 != null ? `₹${fmtN(last.sma20)}` : "—"}</span></span>
          <span><span className="text-muted">SMA50 </span><span className="text-[#5b8cff]">{last.sma50 != null ? `₹${fmtN(last.sma50)}` : "—"}</span></span>
          <span><span className="text-muted">RSI </span><span className={rsiTone}>{rsiVal != null ? rsiVal.toFixed(1) : "—"}</span></span>
          {priceVsSma && (
            <span className={priceVsSma === "above" ? "text-up" : "text-down"}>
              Price {priceVsSma} 50-DMA
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBoll((b) => !b)}
            className={`text-[11px] px-2 py-1 rounded-md border transition ${showBoll ? "border-accent/40 text-accent bg-accent/10" : "border-line text-muted hover:text-white"}`}>
            Bollinger
          </button>
          <div className="flex rounded-md border border-line overflow-hidden">
            {RANGES.map(([k]) => (
              <button key={k} onClick={() => setRange(k)}
                className={`text-[11px] px-2 py-1 transition ${range === k ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* price + indicators + volume */}
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={rows} margin={{ top: 6, right: 8, left: -8, bottom: 0 }} syncId="tech">
          <defs>
            <linearGradient id="bbFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5b8cff" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#5b8cff" stopOpacity={0.12} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => d?.slice(5)} minTickGap={28} />
          <YAxis yAxisId="p" tick={AXIS} width={52}
            domain={[(min) => Math.floor(min * 0.985), (max) => Math.ceil(max * 1.015)]}
            tickFormatter={(v) => `₹${Math.round(v)}`} />
          <YAxis yAxisId="v" orientation="right" tick={AXIS} width={40}
            domain={[0, (max) => max * 4]} tickFormatter={(v) => fmtVol(v)} hide />
          <Tooltip content={({ active, payload, label }) => tip(active, payload, label)} />
          {/* volume bars (compressed into the lower quarter via the 0..4*max domain) */}
          <Bar yAxisId="v" dataKey="volume" name="Volume" isAnimationActive={false}>
            {rows.map((d, i) => <Cell key={i} fill={d.up ? "#16c78433" : "#ea394333"} />)}
          </Bar>
          {/* Bollinger band as a range-area [lower, upper] (no zero anchoring) */}
          {showBoll && <Area yAxisId="p" dataKey="bb" name="Bollinger" stroke="none" fill="url(#bbFill)" isAnimationActive={false} connectNulls />}
          {showBoll && <Line yAxisId="p" dataKey="bbU" name="Boll U" stroke="#5b8cff55" dot={false} strokeWidth={1} strokeDasharray="3 3" connectNulls isAnimationActive={false} />}
          {showBoll && <Line yAxisId="p" dataKey="bbL" name="Boll L" stroke="#5b8cff55" dot={false} strokeWidth={1} strokeDasharray="3 3" connectNulls isAnimationActive={false} />}
          <Line yAxisId="p" dataKey="close" name="Close" stroke="#e6ecf7" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line yAxisId="p" dataKey="sma20" name="SMA20" stroke="#f0a020" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
          <Line yAxisId="p" dataKey="sma50" name="SMA50" stroke="#5b8cff" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* RSI subpanel */}
      <div className="mt-1">
        <div className="text-[11px] text-muted mb-0.5 pl-1">RSI (14)</div>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={rows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} syncId="tech">
            <CartesianGrid stroke={GRID} vertical={false} />
            <ReferenceArea y1={70} y2={100} fill="#ea393912" />
            <ReferenceArea y1={0} y2={30} fill="#16c78412" />
            <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => d?.slice(5)} minTickGap={28} />
            <YAxis tick={AXIS} domain={[0, 100]} ticks={[30, 50, 70]} width={52} />
            <ReferenceLine y={70} stroke="#ea393955" strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke="#16c78455" strokeDasharray="3 3" />
            <Tooltip content={({ active, payload, label }) =>
              active && payload?.length && payload[0].value != null ? (
                <div className="bg-panel2 border border-line rounded-lg px-2.5 py-1.5 text-xs shadow-lg">
                  <div className="text-muted">{label}</div>
                  <div className="font-mono text-[#c77dff]">RSI {Number(payload[0].value).toFixed(1)}</div>
                </div>
              ) : null} />
            <Line dataKey="rsi" name="RSI" stroke="#c77dff" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Row({ k, v, c }) {
  return (
    <div className="flex justify-between gap-4">
      <span style={{ color: c }}>{k}</span>
      <span className="font-mono text-white">{v}</span>
    </div>
  );
}
