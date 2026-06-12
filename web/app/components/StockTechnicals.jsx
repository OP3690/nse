"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Area, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, ReferenceArea, ReferenceDot, Cell,
} from "recharts";
import { useChartTheme } from "./charts";

// Indicator identity colors (semantic, read on both themes)
const C = {
  sma20: "#f0a020", sma50: "#5b8cff", sma200: "#ff6b9d",
  vwap: "#22d3ee", boll: "#5b8cff", donch: "#94a3b8",
  up: "#16c784", down: "#ea3943", rsi: "#c77dff",
  macd: "#5b8cff", signal: "#f0a020",
};

const fmtN = (n) => (n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const fmtVol = (n) => {
  if (n == null) return "—";
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return Number(n).toLocaleString("en-IN");
};

// ── indicator math (computed client-side over the close series) ──────────────
function sma(xs, n) {
  const out = new Array(xs.length).fill(null);
  let sum = 0, cnt = 0;
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i];
    if (v == null) { out[i] = null; continue; }
    sum += v; cnt++;
    if (i >= n) { const old = xs[i - n]; if (old != null) { sum -= old; cnt--; } }
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function emaArr(xs, n) {
  const out = new Array(xs.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null, count = 0;
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i];
    if (v == null) { out[i] = null; continue; }
    prev = prev == null ? v : v * k + prev * (1 - k);
    count++;
    out[i] = count >= n ? prev : null;
  }
  return out;
}

function bollinger(closes, n = 20, k = 2) {
  const mid = sma(closes, n);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = n - 1; i < closes.length; i++) {
    if (mid[i] == null) continue;
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
      if (i === period) { avgG /= period; avgL /= period; out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL); }
    } else {
      avgG = (avgG * (period - 1) + g) / period;
      avgL = (avgL * (period - 1) + l) / period;
      out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
  }
  return out;
}

function macd(closes, fast = 12, slow = 26, sig = 9) {
  const ef = emaArr(closes, fast), es = emaArr(closes, slow);
  const line = closes.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const signal = emaArr(line, sig);
  const hist = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null));
  return { line, signal, hist };
}

// rolling volume-weighted average price from actual traded value (turnover in ₹cr)
function rollingVWAP(turnCr, vol, n = 20) {
  const out = new Array(vol.length).fill(null);
  const tq = [], vq = [];
  let st = 0, sv = 0;
  for (let i = 0; i < vol.length; i++) {
    const t = (turnCr[i] ?? 0) * 1e7, v = vol[i] ?? 0;
    st += t; sv += v; tq.push(t); vq.push(v);
    if (i >= n) { st -= tq[i - n]; sv -= vq[i - n]; }
    if (i >= n - 1 && sv > 0) out[i] = st / sv;
  }
  return out;
}

function donchian(closes, n = 20) {
  const up = new Array(closes.length).fill(null), lo = new Array(closes.length).fill(null);
  for (let i = n - 1; i < closes.length; i++) {
    let mx = -Infinity, mn = Infinity;
    for (let j = i - n + 1; j <= i; j++) { if (closes[j] > mx) mx = closes[j]; if (closes[j] < mn) mn = closes[j]; }
    up[i] = mx; lo[i] = mn;
  }
  return { up, lo };
}

const RANGES = [["1M", 22], ["3M", 66], ["6M", 132], ["1Y", 252], ["ALL", Infinity]];

export default function StockTechnicals({ data }) {
  const t = useChartTheme();
  const [range, setRange] = useState("6M");
  const [maType, setMaType] = useState("SMA"); // SMA | EMA
  const [ov, setOv] = useState({ ma: true, boll: true, vwap: false, donch: false });
  const toggle = (k) => setOv((o) => ({ ...o, [k]: !o[k] }));

  const enriched = useMemo(() => {
    const closes = data.map((d) => d.close);
    const vols = data.map((d) => d.volume);
    const turns = data.map((d) => d.turnover_cr);
    const m20 = maType === "EMA" ? emaArr(closes, 20) : sma(closes, 20);
    const m50 = maType === "EMA" ? emaArr(closes, 50) : sma(closes, 50);
    const m200 = maType === "EMA" ? emaArr(closes, 200) : sma(closes, 200);
    const bb = bollinger(closes, 20, 2);
    const r = rsi(closes, 14);
    const mac = macd(closes);
    const vw = rollingVWAP(turns, vols, 20);
    const don = donchian(closes, 20);
    const vMA = sma(vols, 20);
    const round = (x) => (x == null ? null : +x.toFixed(2));
    return data.map((d, i) => ({
      ...d,
      ma20: round(m20[i]), ma50: round(m50[i]), ma200: round(m200[i]),
      bbU: round(bb.upper[i]), bbL: round(bb.lower[i]), bbMid: round(bb.mid[i]),
      bb: bb.upper[i] != null ? [round(bb.lower[i]), round(bb.upper[i])] : null,
      vwap: round(vw[i]),
      donU: round(don.up[i]), donL: round(don.lo[i]),
      don: don.up[i] != null ? [round(don.lo[i]), round(don.up[i])] : null,
      rsi: r[i] != null ? +r[i].toFixed(1) : null,
      macd: round(mac.line[i]), signal: round(mac.signal[i]), hist: round(mac.hist[i]),
      volMA: round(vMA[i]),
      up: (d.pct ?? 0) >= 0,
    }));
  }, [data, maType]);

  const sliceN = RANGES.find(([k]) => k === range)?.[1] ?? Infinity;
  const rows = useMemo(
    () => (sliceN === Infinity ? enriched : enriched.slice(Math.max(0, enriched.length - sliceN))),
    [enriched, sliceN]
  );

  // moving-average crossover events (golden / death cross) within the window
  const crosses = useMemo(() => {
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (a.ma50 == null || a.ma200 == null || b.ma50 == null || b.ma200 == null) continue;
      const prev = a.ma50 - a.ma200, cur = b.ma50 - b.ma200;
      if (prev <= 0 && cur > 0) out.push({ date: b.date, y: b.close, type: "golden" });
      else if (prev >= 0 && cur < 0) out.push({ date: b.date, y: b.close, type: "death" });
    }
    return out.slice(-4);
  }, [rows]);

  // ── technical posture (from the full series' latest values) ────────────────
  const last = enriched[enriched.length - 1] || {};
  const rsiVal = last.rsi;
  const posture = useMemo(() => {
    const c = last.close;
    const tags = [];
    const ref = last.ma200 ?? last.ma50;
    if (c != null && ref != null)
      tags.push({ label: c >= ref ? `Above ${last.ma200 != null ? "200" : "50"}-DMA` : `Below ${last.ma200 != null ? "200" : "50"}-DMA`, tone: c >= ref ? "up" : "down" });
    if (last.ma20 != null && last.ma50 != null && last.ma200 != null) {
      const stk = last.ma20 > last.ma50 && last.ma50 > last.ma200 ? "up"
        : last.ma20 < last.ma50 && last.ma50 < last.ma200 ? "down" : "mut";
      tags.push({ label: stk === "up" ? "MAs stacked bullish" : stk === "down" ? "MAs stacked bearish" : "MAs mixed", tone: stk === "mut" ? "mut" : stk });
    }
    if (last.macd != null && last.signal != null) {
      const bull = last.macd > last.signal;
      tags.push({ label: bull ? "MACD bullish" : "MACD bearish", tone: bull ? "up" : "down" });
    }
    if (rsiVal != null)
      tags.push({ label: rsiVal >= 70 ? `RSI overbought ${rsiVal.toFixed(0)}` : rsiVal <= 30 ? `RSI oversold ${rsiVal.toFixed(0)}` : `RSI neutral ${rsiVal.toFixed(0)}`, tone: rsiVal >= 70 ? "down" : rsiVal <= 30 ? "up" : "mut" });
    // Bollinger squeeze: bandwidth percentile over the last 100 sessions
    const bw = enriched.map((d) => (d.bbU != null && d.bbL != null && d.bbMid ? (d.bbU - d.bbL) / d.bbMid : null)).filter((x) => x != null);
    if (bw.length) {
      const cur = bw[bw.length - 1];
      const recent = bw.slice(-100);
      const pct = recent.filter((x) => x <= cur).length / recent.length;
      tags.push({ label: pct <= 0.2 ? "Bollinger squeeze" : pct >= 0.8 ? "High volatility" : "Normal volatility", tone: pct <= 0.2 ? "accent" : "mut" });
    }
    // 52-week position
    const win = enriched.map((d) => d.close).slice(-252);
    const hi = Math.max(...win), lo = Math.min(...win);
    if (hi > lo && last.close != null) {
      const p = ((last.close - lo) / (hi - lo)) * 100;
      tags.push({ label: `${p.toFixed(0)}% of 52w range`, tone: p >= 80 ? "up" : p <= 20 ? "down" : "mut" });
    }
    return tags;
  }, [enriched, last, rsiVal]);

  const toneCls = (tn) =>
    tn === "up" ? "text-up border-up/30 bg-up/10"
      : tn === "down" ? "text-down border-down/30 bg-down/10"
        : tn === "accent" ? "text-accent border-accent/30 bg-accent/10"
          : "text-muted border-line bg-ink/40";

  const AX = { stroke: t.axis, fontSize: 11 };

  const tip = (active, payload, label) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload || {};
    return (
      <div className="bg-panel2 border border-line rounded-lg px-3 py-2 text-xs shadow-lg min-w-[180px]">
        <div className="text-muted mb-1">{label}</div>
        <Row k="Close" v={`₹${fmtN(p.close)}`} c={p.up ? C.up : C.down} />
        {ov.ma && p.ma20 != null && <Row k={`${maType} 20`} v={`₹${fmtN(p.ma20)}`} c={C.sma20} />}
        {ov.ma && p.ma50 != null && <Row k={`${maType} 50`} v={`₹${fmtN(p.ma50)}`} c={C.sma50} />}
        {ov.ma && p.ma200 != null && <Row k={`${maType} 200`} v={`₹${fmtN(p.ma200)}`} c={C.sma200} />}
        {ov.vwap && p.vwap != null && <Row k="VWAP 20" v={`₹${fmtN(p.vwap)}`} c={C.vwap} />}
        {ov.boll && p.bbU != null && <Row k="Boll U/L" v={`${fmtN(p.bbU)} / ${fmtN(p.bbL)}`} c={C.boll} />}
        {ov.donch && p.donU != null && <Row k="Donchian H/L" v={`${fmtN(p.donU)} / ${fmtN(p.donL)}`} c={C.donch} />}
        <Row k="Volume" v={fmtVol(p.volume)} c={t.axis} />
        {p.deliv != null && <Row k="Delivery" v={`${p.deliv.toFixed(1)}%`} c={t.axis} />}
        {p.rsi != null && <Row k="RSI 14" v={p.rsi.toFixed(1)} c={C.rsi} />}
        {p.macd != null && <Row k="MACD" v={p.macd.toFixed(2)} c={C.macd} />}
      </div>
    );
  };

  return (
    <div>
      {/* posture badges */}
      {posture.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {posture.map((tag, i) => (
            <span key={i} className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${toneCls(tag.tone)}`}>
              {tag.label}
            </span>
          ))}
        </div>
      )}

      {/* readout + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
          <span><span className="text-muted">{maType}20 </span><span style={{ color: C.sma20 }}>{last.ma20 != null ? `₹${fmtN(last.ma20)}` : "—"}</span></span>
          <span><span className="text-muted">{maType}50 </span><span style={{ color: C.sma50 }}>{last.ma50 != null ? `₹${fmtN(last.ma50)}` : "—"}</span></span>
          <span><span className="text-muted">{maType}200 </span><span style={{ color: C.sma200 }}>{last.ma200 != null ? `₹${fmtN(last.ma200)}` : "—"}</span></span>
          <span><span className="text-muted">VWAP </span><span style={{ color: C.vwap }}>{last.vwap != null ? `₹${fmtN(last.vwap)}` : "—"}</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-line overflow-hidden">
            {["SMA", "EMA"].map((k) => (
              <button key={k} onClick={() => setMaType(k)}
                className={`text-[11px] px-2 py-1 transition ${maType === k ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>
                {k}
              </button>
            ))}
          </div>
          {[["ma", "MA"], ["boll", "Bollinger"], ["vwap", "VWAP"], ["donch", "Donchian"]].map(([k, lbl]) => (
            <button key={k} onClick={() => toggle(k)}
              className={`text-[11px] px-2 py-1 rounded-md border transition ${ov[k] ? "border-accent/40 text-accent bg-accent/10" : "border-line text-muted hover:text-white"}`}>
              {lbl}
            </button>
          ))}
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

      {/* PRICE pane */}
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={rows} margin={{ top: 6, right: 8, left: -8, bottom: 0 }} syncId="tech">
          <defs>
            <linearGradient id="techClose" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.axis} stopOpacity={0.18} />
              <stop offset="100%" stopColor={t.axis} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="bbFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.boll} stopOpacity={0.1} />
              <stop offset="100%" stopColor={C.boll} stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="donFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.donch} stopOpacity={0.08} />
              <stop offset="100%" stopColor={C.donch} stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey="date" tick={AX} tickFormatter={(d) => d?.slice(5)} minTickGap={28} />
          <YAxis tick={AX} width={54}
            domain={[(min) => Math.floor(min * 0.985), (max) => Math.ceil(max * 1.015)]}
            tickFormatter={(v) => `₹${Math.round(v)}`} />
          <Tooltip content={({ active, payload, label }) => tip(active, payload, label)} />
          {ov.donch && <Area dataKey="don" name="Donchian" stroke="none" fill="url(#donFill)" isAnimationActive={false} connectNulls />}
          {ov.boll && <Area dataKey="bb" name="Bollinger" stroke="none" fill="url(#bbFill)" isAnimationActive={false} connectNulls />}
          <Area dataKey="close" name="closeArea" stroke="none" fill="url(#techClose)" isAnimationActive={false} />
          {ov.boll && <Line dataKey="bbU" stroke={`${C.boll}66`} dot={false} strokeWidth={1} strokeDasharray="3 3" connectNulls isAnimationActive={false} />}
          {ov.boll && <Line dataKey="bbL" stroke={`${C.boll}66`} dot={false} strokeWidth={1} strokeDasharray="3 3" connectNulls isAnimationActive={false} />}
          {ov.donch && <Line dataKey="donU" stroke={`${C.donch}88`} dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />}
          {ov.donch && <Line dataKey="donL" stroke={`${C.donch}88`} dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />}
          <Line dataKey="close" name="Close" stroke={t.fg} dot={false} strokeWidth={2} isAnimationActive={false} />
          {ov.ma && <Line dataKey="ma20" stroke={C.sma20} dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />}
          {ov.ma && <Line dataKey="ma50" stroke={C.sma50} dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />}
          {ov.ma && <Line dataKey="ma200" stroke={C.sma200} dot={false} strokeWidth={1.75} connectNulls isAnimationActive={false} />}
          {ov.vwap && <Line dataKey="vwap" stroke={C.vwap} dot={false} strokeWidth={1.5} strokeDasharray="5 3" connectNulls isAnimationActive={false} />}
          {crosses.map((x, i) => (
            <ReferenceDot key={i} x={x.date} y={x.y} r={5}
              fill={x.type === "golden" ? C.up : C.down} stroke={t.ink} strokeWidth={1.5} isFront />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* VOLUME pane */}
      <div className="mt-1">
        <div className="text-[11px] text-muted mb-0.5 pl-1">Volume · 20-day avg</div>
        <ResponsiveContainer width="100%" height={88}>
          <ComposedChart data={rows} margin={{ top: 2, right: 8, left: -8, bottom: 0 }} syncId="tech">
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="date" tick={AX} tickFormatter={(d) => d?.slice(5)} minTickGap={28} hide />
            <YAxis tick={AX} width={54} tickFormatter={(v) => fmtVol(v)} />
            <Tooltip content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="bg-panel2 border border-line rounded-lg px-2.5 py-1.5 text-xs shadow-lg">
                  <div className="text-muted">{label}</div>
                  <div className="font-mono text-white">Vol {fmtVol(payload[0]?.payload?.volume)}</div>
                  <div className="font-mono" style={{ color: t.axis }}>Avg {fmtVol(payload[0]?.payload?.volMA)}</div>
                </div>
              ) : null} />
            <Bar dataKey="volume" isAnimationActive={false}>
              {rows.map((d, i) => <Cell key={i} fill={d.up ? `${C.up}66` : `${C.down}66`} />)}
            </Bar>
            <Line dataKey="volMA" stroke={t.axis} dot={false} strokeWidth={1.25} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* MACD pane */}
      <div className="mt-1">
        <div className="text-[11px] text-muted mb-0.5 pl-1">MACD (12, 26, 9)</div>
        <ResponsiveContainer width="100%" height={110}>
          <ComposedChart data={rows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} syncId="tech">
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="date" tick={AX} tickFormatter={(d) => d?.slice(5)} minTickGap={28} hide />
            <YAxis tick={AX} width={54} />
            <ReferenceLine y={0} stroke={t.zero} />
            <Tooltip content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="bg-panel2 border border-line rounded-lg px-2.5 py-1.5 text-xs shadow-lg">
                  <div className="text-muted">{label}</div>
                  <div className="font-mono" style={{ color: C.macd }}>MACD {payload[0]?.payload?.macd?.toFixed(2) ?? "—"}</div>
                  <div className="font-mono" style={{ color: C.signal }}>Signal {payload[0]?.payload?.signal?.toFixed(2) ?? "—"}</div>
                  <div className="font-mono text-white">Hist {payload[0]?.payload?.hist?.toFixed(2) ?? "—"}</div>
                </div>
              ) : null} />
            <Bar dataKey="hist" isAnimationActive={false}>
              {rows.map((d, i) => <Cell key={i} fill={(d.hist ?? 0) >= 0 ? `${C.up}88` : `${C.down}88`} />)}
            </Bar>
            <Line dataKey="macd" stroke={C.macd} dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
            <Line dataKey="signal" stroke={C.signal} dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* RSI pane */}
      <div className="mt-1">
        <div className="text-[11px] text-muted mb-0.5 pl-1">RSI (14)</div>
        <ResponsiveContainer width="100%" height={104}>
          <LineChart data={rows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} syncId="tech">
            <CartesianGrid stroke={t.grid} vertical={false} />
            <ReferenceArea y1={70} y2={100} fill={`${C.down}12`} />
            <ReferenceArea y1={0} y2={30} fill={`${C.up}12`} />
            <XAxis dataKey="date" tick={AX} tickFormatter={(d) => d?.slice(5)} minTickGap={28} />
            <YAxis tick={AX} domain={[0, 100]} ticks={[30, 50, 70]} width={54} />
            <ReferenceLine y={70} stroke={`${C.down}55`} strokeDasharray="3 3" />
            <ReferenceLine y={50} stroke={t.zero} strokeDasharray="2 4" />
            <ReferenceLine y={30} stroke={`${C.up}55`} strokeDasharray="3 3" />
            <Tooltip content={({ active, payload, label }) =>
              active && payload?.length && payload[0].value != null ? (
                <div className="bg-panel2 border border-line rounded-lg px-2.5 py-1.5 text-xs shadow-lg">
                  <div className="text-muted">{label}</div>
                  <div className="font-mono" style={{ color: C.rsi }}>RSI {Number(payload[0].value).toFixed(1)}</div>
                </div>
              ) : null} />
            <Line dataKey="rsi" stroke={C.rsi} dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
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
