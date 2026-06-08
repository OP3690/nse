"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import InfoDot from "./InfoDot";
import { CumulativeFlowChart } from "./charts";

const fmtCrShort = (v) => {
  if (v == null) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 100000) return `${s}₹${(a / 100000).toFixed(2)}L Cr`; // lakh-crore
  if (a >= 1000) return `${s}₹${(a / 1000).toFixed(1)}k Cr`;      // thousand-crore
  return `${s}₹${Math.round(a).toLocaleString("en-IN")} Cr`;
};

// Small tone-keyed glyphs for the brief rows (stroke icons, inherit currentColor).
const ICONS = {
  flow: "M4 7h11m0 0-3-3m3 3-3 3M20 17H9m0 0 3-3m-3 3 3 3",
  breadth: "M4 19V9m5 10V5m5 14v-9m5 9V8",
  sector: "M3 17l5-5 4 3 7-8M21 7h-4m4 0v4",
  star: "M12 4l2.2 4.8L19 9.6l-3.6 3.3.9 4.9L12 15.6 7.7 17.8l.9-4.9L5 9.6l4.8-.8L12 4Z",
};

const TONE_TEXT = {
  up: "text-up", down: "text-down", accent: "text-accent", amber: "text-amber-400", muted: "text-muted",
};
const TONE_BAR = {
  up: "bg-up", down: "bg-down", accent: "bg-accent", amber: "bg-amber-400", muted: "bg-muted",
};
const TONE_CHIP = {
  up: "bg-up/15 text-up", down: "bg-down/15 text-down",
  accent: "bg-accent/15 text-accent", amber: "bg-amber-400/15 text-amber-400", muted: "bg-muted/15 text-muted",
};

const WINDOWS = [["1M", 22], ["3M", 66], ["All", Infinity]];

// eased count-up that re-runs whenever the target changes (e.g. window switch)
function useCountUp(target, dur = 800) {
  const [val, setVal] = useState(target || 0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = from + (target - from) * e;
      setVal(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return val;
}

function BriefRow({ item }) {
  return (
    <div className="relative flex gap-3 rounded-xl border border-line bg-panel2/40 p-3 transition-colors hover:border-accent/40">
      <span className={`absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full ${TONE_BAR[item.tone] || "bg-muted"}`} />
      <span className={`mt-0.5 shrink-0 ${TONE_TEXT[item.tone] || "text-muted"}`}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[item.icon] || ICONS.flow} />
        </svg>
      </span>
      <div className="min-w-0">
        <div className="text-[13px] leading-snug text-white font-semibold">{item.head}</div>
        <div className="text-[12px] leading-snug text-muted mt-0.5">{item.body}</div>
        {item.chips && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {item.chips.map((c, i) => (
              <span key={i} className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums ${TONE_CHIP[c.tone] || TONE_CHIP.muted}`}>
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Horizontal accumulation/distribution gauge with an animated marker.
function PressureMeter({ value }) {
  const v = Math.max(-100, Math.min(100, value || 0));
  const pos = (v + 100) / 2; // 0..100
  const tone = v >= 25 ? "up" : v <= -25 ? "down" : "amber";
  const label = v >= 25 ? "Accumulation" : v <= -25 ? "Distribution" : "Neutral";
  return (
    <div className="rounded-xl border border-line bg-panel/50 px-3 py-2.5 mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted font-semibold">Institutional Pressure</span>
        <span className={`text-[11px] font-bold tabular-nums ${TONE_TEXT[tone]}`}>{label} · {v >= 0 ? "+" : ""}{v}</span>
      </div>
      <div className="relative h-2 rounded-full bg-gradient-to-r from-down via-amber-400 to-up">
        <span
          className="absolute top-1/2 h-3.5 w-3.5 rounded-full bg-white ring-2 ring-ink shadow-md transition-[left] duration-700 ease-out"
          style={{ left: `calc(${pos}% - 7px)`, transform: "translateY(-50%)" }}
        />
        <span className="absolute top-1/2 left-1/2 h-3 w-px bg-ink/40 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className="flex justify-between text-[9px] text-muted/70 mt-1">
        <span>Distribution</span><span>Neutral</span><span>Accumulation</span>
      </div>
    </div>
  );
}

// Per-session buy/sell heatmap of the last ~22 sessions (two rows: FII, DII).
function FlowTape({ rows }) {
  const maxAbs = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.fii || 0), Math.abs(r.dii || 0)]));
  const cell = (v, buy, sell) => {
    const op = 0.2 + 0.8 * Math.min(1, Math.abs(v || 0) / maxAbs);
    return { background: `${v >= 0 ? buy : sell}`, opacity: op };
  };
  const Row = ({ label, pick, buy, sell }) => (
    <div className="flex items-center gap-2">
      <span className="w-7 text-[10px] font-semibold text-muted shrink-0">{label}</span>
      <div className="flex-1 flex gap-0.5">
        {rows.map((r, i) => {
          const v = pick(r);
          return (
            <div key={i} className="flex-1 h-3.5 rounded-[2px]" style={cell(v, buy, sell)}
              title={`${r.date} · ${label} ${v >= 0 ? "+" : ""}₹${Number(Math.round(v)).toLocaleString("en-IN")} Cr`} />
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="mt-3 rounded-xl border border-line bg-panel/40 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted font-semibold">Flow tape · last {rows.length} sessions</span>
        <span className="text-[9px] text-muted/70">deeper = bigger flow</span>
      </div>
      <Row label="FII" pick={(r) => r.fii || 0} buy="#16c784" sell="#ea3943" />
      <Row label="DII" pick={(r) => r.dii || 0} buy="#5b8cff" sell="#f0a020" />
    </div>
  );
}

function Readout({ label, value, tone }) {
  return (
    <div className="rounded-lg bg-panel/60 px-2.5 py-2">
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className={`font-mono text-sm font-bold tabular-nums leading-tight mt-0.5 ${TONE_TEXT[tone] || "text-white"}`}>{value}</div>
    </div>
  );
}

export default function MarketBrief({ history, brief, asOf, pressure = 0, net5, net20 }) {
  const [win, setWin] = useState(66); // default 3M

  const { series, fiiNet, diiNet, dominant } = useMemo(() => {
    const sliced = win === Infinity ? history : history.slice(-win);
    let fc = 0, dc = 0;
    const series = sliced.map((r) => {
      fc += r.fii || 0; dc += r.dii || 0;
      return { date: r.date, fii_cum: Math.round(fc), dii_cum: Math.round(dc) };
    });
    const dominant = Math.abs(fc) >= Math.abs(dc)
      ? { who: "FII", val: fc, tone: fc >= 0 ? "up" : "down" }
      : { who: "DII", val: dc, tone: dc >= 0 ? "accent" : "amber" };
    return { series, fiiNet: fc, diiNet: dc, dominant };
  }, [history, win]);

  const tape = useMemo(() => history.slice(-22), [history]);
  const fiiAnim = useCountUp(fiiNet);
  const diiAnim = useCountUp(diiNet);
  const sessions = series.length;
  const momentumTone = net5 == null ? "muted" : net5 >= 0 ? "up" : "down";

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2">
            <span>Institutional Flow Brief</span>
            <InfoDot topic="dash.flow_brief" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            The slow-moving tug-of-war between foreign and domestic institutions — cumulative net flow,
            a pressure gauge, a per-session heatmap, and an auto-generated read of the session.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-line overflow-hidden text-xs shrink-0">
          {WINDOWS.map(([label, n]) => (
            <button key={label} onClick={() => setWin(n)}
              className={`px-3 py-1.5 transition ${
                win === n ? "bg-accent/15 text-white font-medium" : "text-muted hover:text-white hover:bg-panel2"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4 items-stretch">
        {/* narrative brief */}
        <div className="lg:col-span-2 space-y-2.5">
          {brief.map((item, i) => <BriefRow key={i} item={item} />)}
          {net5 != null && net20 != null && (
            <div className="rounded-xl border border-line bg-panel2/40 p-3 flex items-center justify-between gap-2">
              <div className="text-[12px] text-muted">Combined net momentum</div>
              <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
                <span className={`px-1.5 py-0.5 rounded-md font-semibold ${TONE_CHIP[net5 >= 0 ? "up" : "down"]}`}>5d {fmtCrShort(net5)}</span>
                <span className={`px-1.5 py-0.5 rounded-md font-semibold ${TONE_CHIP[net20 >= 0 ? "up" : "down"]}`}>20d {fmtCrShort(net20)}</span>
              </div>
            </div>
          )}
        </div>

        {/* pressure + cumulative flow chart + readouts + tape */}
        <div className="lg:col-span-3 rounded-xl border border-line bg-panel2/30 p-4">
          <PressureMeter value={pressure} />

          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="text-sm font-semibold text-white">Cumulative net flow</div>
            <div className="text-[11px] text-muted">{sessions} sessions · to {asOf}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Readout label="FII net" value={fmtCrShort(fiiAnim)} tone={fiiNet >= 0 ? "up" : "down"} />
            <Readout label="DII net" value={fmtCrShort(diiAnim)} tone={diiNet >= 0 ? "accent" : "amber"} />
            <Readout label="Dominant force" value={`${dominant.who} ${dominant.val >= 0 ? "buying" : "selling"}`} tone={dominant.tone} />
          </div>
          <CumulativeFlowChart data={series} />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#16c784]" /><span className="text-muted">FII cumulative</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#5b8cff]" /><span className="text-muted">DII cumulative</span>
            </span>
          </div>

          <FlowTape rows={tape} />
        </div>
      </div>
    </section>
  );
}
