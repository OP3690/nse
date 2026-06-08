"use client";

import { useState } from "react";
import InfoDot from "../InfoDot";
import { SymbolLink } from "../ui";

const TONE = {
  up: { text: "text-up", dot: "bg-up", ring: "ring-up/30" },
  down: { text: "text-down", dot: "bg-down", ring: "ring-down/30" },
  amber: { text: "text-amber-400", dot: "bg-amber-400", ring: "ring-amber-400/30" },
  accent: { text: "text-accent", dot: "bg-accent", ring: "ring-accent/30" },
  muted: { text: "text-muted", dot: "bg-muted", ring: "ring-line" },
};

const fmtINR = (n) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));

export default function SignalScreens({ signals }) {
  const populated = (signals || []).filter((g) => g.count > 0);
  const [active, setActive] = useState(populated[0]?.key || null);
  if (!populated.length) return null;
  const group = populated.find((g) => g.key === active) || populated[0];
  const t = TONE[group.tone] || TONE.muted;

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2">
            <span>Technical Signal Screens</span>
            <InfoDot topic="strategy.signals" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            Classic chart setups computed across the universe — moving-average crossovers, MACD, RSI extremes,
            Bollinger and 52-week breakouts, and volume dry-ups. Pick a screen to see today's matches.
          </p>
        </div>
      </div>

      {/* screen selector chips */}
      <div className="flex flex-wrap gap-2">
        {populated.map((g) => {
          const gt = TONE[g.tone] || TONE.muted;
          const on = g.key === active;
          return (
            <button key={g.key} onClick={() => setActive(g.key)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition ${
                on ? `bg-panel2 border-line text-white ring-1 ${gt.ring}` : "border-line/60 text-muted hover:text-white hover:bg-panel2/50"
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${gt.dot}`} />
              <span>{g.label}</span>
              <span className="font-mono tabular-nums text-muted">{g.count}</span>
            </button>
          );
        })}
      </div>

      {/* active screen */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full ${t.dot}`} />
          <span className={`font-semibold ${t.text}`}>{group.label}</span>
          <span className="text-xs text-muted">— {group.desc}</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-1.5">
          {group.items.slice(0, 30).map((it) => (
            <div key={it.symbol} className="flex items-center justify-between gap-2 text-xs border-b border-line/30 py-1">
              <span className="min-w-0"><SymbolLink symbol={it.symbol} name={it.company} /></span>
              <span className="flex items-center gap-2.5 shrink-0">
                <span className="font-mono text-white tabular-nums">₹{fmtINR(it.close)}</span>
                <span className={`font-mono tabular-nums ${t.text}`}>{it.detail}</span>
              </span>
            </div>
          ))}
        </div>
        {group.count > group.items.length && (
          <div className="text-[11px] text-muted mt-2">Showing {Math.min(30, group.items.length)} of {group.count} matches.</div>
        )}
      </div>

      <p className="text-[11px] text-muted flex items-start gap-1.5">
        <span className="text-amber-400 shrink-0">⚠</span>
        <span>Signal screens are descriptive pattern scans, <span className="text-white">not buy/sell calls</span>.
          Crossovers and breakouts fail often; always confirm with your own research.</span>
      </p>
    </section>
  );
}
