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

// Synthesize a single interpretive "bottom line" from the latest session's
// FII/DII split. Covers every sign combination so it stays meaningful no matter
// who is buying or selling on a given day.
function netReadFrom(fii, dii) {
  const f = fii || 0, d = dii || 0;
  const combined = f + d;
  const fAbs = Math.abs(f), dAbs = Math.abs(d);
  const absC = Math.abs(combined);
  const fSell = f < 0, dSell = d < 0;
  let head, body, badge;

  if (fSell && !dSell) {
    const ratio = fAbs ? Math.round((dAbs / fAbs) * 100) : 100;
    if (combined >= 0) {
      head = "Domestic buyers more than absorbed the foreign exit";
      body = `DII buying offset the entire ${fmtCrShort(fAbs)} FII outflow and tipped the day ${fmtCrShort(combined)} net positive.`;
      badge = { label: "Absorbed", value: `${ratio}%`, tone: "up" };
    } else {
      head = "Domestic buyers cushioned the foreign exit";
      body = `DII soaked up ${ratio}% of the ${fmtCrShort(fAbs)} FII outflow — only ${fmtCrShort(absC)} leaked out net, not a rout.`;
      badge = { label: "Absorbed", value: `${ratio}%`, tone: "amber" };
    }
  } else if (!fSell && dSell) {
    const ratio = fAbs ? Math.round((dAbs / fAbs) * 100) : 100;
    if (combined >= 0) {
      head = "Foreign buying outweighed domestic selling";
      body = `DII booked profits into a ${fmtCrShort(fAbs)} FII inflow, trimming ${ratio}% of it — the day still closed ${fmtCrShort(combined)} net positive.`;
      badge = { label: "Trimmed", value: `${ratio}%`, tone: "up" };
    } else {
      head = "Domestic selling overwhelmed foreign buying";
      body = `DII distribution outweighed the ${fmtCrShort(fAbs)} FII inflow, dragging the day ${fmtCrShort(absC)} net negative.`;
      badge = { label: "Net", value: fmtCrShort(combined), tone: "down" };
    }
  } else if (!fSell && !dSell) {
    head = "Both engines are buying";
    body = `Foreign and domestic desks bought together — ${fmtCrShort(combined)} of aligned inflow points to broad conviction.`;
    badge = { label: "Combined", value: fmtCrShort(combined), tone: "up" };
  } else {
    head = "Both engines are selling";
    body = `Foreign and domestic desks sold in tandem — ${fmtCrShort(absC)} of combined outflow signals broad risk-off.`;
    badge = { label: "Combined", value: fmtCrShort(combined), tone: "down" };
  }
  return { combined, head, body, badge };
}

// The interpretive read: a verdict line, a tone-keyed badge, a force-balance bar
// (FII vs DII magnitude, colored by direction), and a 20-session backdrop clause.
function NetRead({ fii, dii, net20 }) {
  const r = netReadFrom(fii, dii);
  const fAbs = Math.abs(fii || 0), dAbs = Math.abs(dii || 0);
  const total = fAbs + dAbs || 1;
  const fW = (fAbs / total) * 100, dW = (dAbs / total) * 100;
  const fBuy = (fii || 0) >= 0, dBuy = (dii || 0) >= 0;
  return (
    <div className="rounded-xl border border-line bg-gradient-to-br from-panel2/60 to-panel2/15 p-3.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted font-semibold">The bottom line</span>
        <span className="h-px flex-1 bg-line/60" />
        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${TONE_CHIP[r.badge.tone]}`}>
          {r.badge.label} {r.badge.value}
        </span>
      </div>
      <div>
        <div className="text-[13px] leading-snug text-white font-semibold">{r.head}</div>
        <div className="text-[12px] leading-snug text-muted mt-0.5">{r.body}</div>
      </div>
      <div className="flex h-6 rounded-lg overflow-hidden text-[10px] font-bold tabular-nums ring-1 ring-inset ring-line/50">
        <div className="flex items-center justify-start px-2 text-white whitespace-nowrap min-w-0"
          style={{ width: `${fW}%`, background: fBuy ? "#16c784" : "#ea3943" }}
          title={`FII ${fBuy ? "buy" : "sell"} · ${fmtCrShort(Math.abs(fii || 0))}`}>
          <span className="truncate">FII {fmtCrShort(fii)}</span>
        </div>
        <div className="flex items-center justify-end px-2 text-white whitespace-nowrap min-w-0"
          style={{ width: `${dW}%`, background: dBuy ? "#5b8cff" : "#f0a020" }}
          title={`DII ${dBuy ? "buy" : "sell"} · ${fmtCrShort(Math.abs(dii || 0))}`}>
          <span className="truncate">DII {fmtCrShort(dii)}</span>
        </div>
      </div>
      {net20 != null && (
        <div className="text-[11px] text-muted/80">
          20-session backdrop: institutions are net {net20 >= 0 ? "buyers" : "sellers"} at{" "}
          <span className={`font-semibold tabular-nums ${net20 >= 0 ? "text-up" : "text-down"}`}>{net20 >= 0 ? "+" : ""}{fmtCrShort(net20)}</span>.
        </div>
      )}
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

  const latest = history[history.length - 1] || {};
  const fiiAnim = useCountUp(fiiNet);
  const diiAnim = useCountUp(diiNet);
  const sessions = series.length;

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
          <NetRead fii={latest.fii} dii={latest.dii} net20={net20} />
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
        </div>
      </div>
    </section>
  );
}
