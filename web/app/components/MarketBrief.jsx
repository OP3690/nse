"use client";

import { useMemo, useState } from "react";
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

const WINDOWS = [
  ["1M", 22],
  ["3M", 66],
  ["All", Infinity],
];

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
      </div>
    </div>
  );
}

export default function MarketBrief({ history, brief, asOf }) {
  const [win, setWin] = useState(66); // default 3M

  const { series, fiiNet, diiNet, dominant } = useMemo(() => {
    const sliced = win === Infinity ? history : history.slice(-win);
    let fc = 0, dc = 0;
    const series = sliced.map((r) => {
      fc += r.fii || 0;
      dc += r.dii || 0;
      return { date: r.date, fii_cum: Math.round(fc), dii_cum: Math.round(dc) };
    });
    const fiiNet = fc, diiNet = dc;
    const dominant =
      Math.abs(fiiNet) >= Math.abs(diiNet)
        ? { who: "FII", val: fiiNet, tone: fiiNet >= 0 ? "up" : "down" }
        : { who: "DII", val: diiNet, tone: diiNet >= 0 ? "accent" : "amber" };
    return { series, fiiNet, diiNet, dominant };
  }, [history, win]);

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
            The slow-moving tug-of-war between foreign and domestic institutions — cumulative net cash flow,
            with an auto-generated read of the latest session.
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
        </div>

        {/* cumulative flow chart + readouts */}
        <div className="lg:col-span-3 rounded-xl border border-line bg-panel2/30 p-4">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="text-sm font-semibold text-white">Cumulative net flow</div>
            <div className="text-[11px] text-muted">{sessions} sessions · to {asOf}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Readout label="FII net" value={fmtCrShort(fiiNet)} tone={fiiNet >= 0 ? "up" : "down"} />
            <Readout label="DII net" value={fmtCrShort(diiNet)} tone={diiNet >= 0 ? "accent" : "amber"} />
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

function Readout({ label, value, tone }) {
  return (
    <div className="rounded-lg bg-panel/60 px-2.5 py-2">
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className={`font-mono text-sm font-bold tabular-nums leading-tight mt-0.5 ${TONE_TEXT[tone] || "text-white"}`}>{value}</div>
    </div>
  );
}
