"use client";

import InfoDot from "../InfoDot";

const TONE_TEXT = {
  up: "text-up",
  down: "text-down",
  amber: "text-amber-400",
  accent: "text-accent",
  muted: "text-muted",
};
const TONE_RGB = {
  up: "22 199 132",
  down: "234 57 67",
  amber: "240 160 32",
  accent: "96 165 250",
  muted: "138 150 171",
};

// Semicircular gauge needle for the 0..100 composite regime score.
function Dial({ score, tone }) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  const R = 80, CX = 100, CY = 100, SW = 14;
  // angle: 180° (left, score 0) → 0° (right, score 100)
  const ang = Math.PI * (1 - s / 100);
  const nx = CX + R * Math.cos(ang);
  const ny = CY - R * Math.sin(ang);
  const arc = (a0, a1) => {
    const x0 = CX + R * Math.cos(a0), y0 = CY - R * Math.sin(a0);
    const x1 = CX + R * Math.cos(a1), y1 = CY - R * Math.sin(a1);
    const large = a0 - a1 > Math.PI ? 1 : 0;
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const seg = (lo, hi) => arc(Math.PI * (1 - lo / 100), Math.PI * (1 - hi / 100));
  const rgb = TONE_RGB[tone] || TONE_RGB.muted;
  return (
    <svg viewBox="0 0 200 116" className="w-full max-w-[260px]">
      {/* coloured zones */}
      <path d={seg(0, 35)} fill="none" stroke="rgb(234 57 67)" strokeOpacity="0.55" strokeWidth={SW} strokeLinecap="round" />
      <path d={seg(35, 50)} fill="none" stroke="rgb(240 160 32)" strokeOpacity="0.5" strokeWidth={SW} />
      <path d={seg(50, 65)} fill="none" stroke="rgb(96 165 250)" strokeOpacity="0.5" strokeWidth={SW} />
      <path d={seg(65, 100)} fill="none" stroke="rgb(22 199 132)" strokeOpacity="0.55" strokeWidth={SW} strokeLinecap="round" />
      {/* needle */}
      <line x1={CX} y1={CY} x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke={`rgb(${rgb})`} strokeWidth="3" strokeLinecap="round" />
      <circle cx={CX} cy={CY} r="5" fill={`rgb(${rgb})`} />
      <text x={CX} y={CY - 26} textAnchor="middle" className="fill-current font-mono font-bold"
        style={{ fontSize: 26, color: `rgb(${rgb})` }}>{Math.round(s)}</text>
    </svg>
  );
}

function CompBar({ c }) {
  const tone = TONE_TEXT[c.tone] || "text-muted";
  const rgb = TONE_RGB[c.tone] || TONE_RGB.muted;
  const w = Math.max(0, Math.min(100, c.score ?? 0));
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 text-xs text-muted truncate" title={c.label}>{c.label}</div>
      <div className="flex-1 h-2 rounded-full bg-line overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: `rgb(${rgb})` }} />
      </div>
      <div className={`w-28 shrink-0 text-right font-mono text-xs ${tone}`}>{c.fmt}</div>
    </div>
  );
}

export default function RegimeGauge({ regime }) {
  if (!regime) return null;
  const tone = TONE_TEXT[regime.tone] || "text-muted";
  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2">
            <span>Market Regime</span>
            <InfoDot topic="strategy.regime" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            A 0–100 composite read of the whole liquid universe — breadth, participation above key
            moving averages, volatility, institutional flow and drawdown — distilled into one risk dial.
          </p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6 items-center">
        <div className="flex flex-col items-center">
          <Dial score={regime.score} tone={regime.tone} />
          <div className={`mt-1 text-lg font-bold ${tone}`}>{regime.label}</div>
          <div className="flex items-center justify-between w-full max-w-[260px] mt-1 text-[10px] text-muted px-1">
            <span>Risk-Off</span><span>Neutral</span><span>Risk-On</span>
          </div>
        </div>
        <div className="space-y-2.5">
          {(regime.components || []).map((c) => <CompBar key={c.key} c={c} />)}
        </div>
      </div>
    </section>
  );
}
