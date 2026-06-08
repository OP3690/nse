"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip,
} from "recharts";
import { useChrome } from "./_util";
import { SymbolLink } from "../ui";

const AXES = [
  ["momentum", "Momentum"],
  ["lowvol", "Low-Vol"],
  ["quality", "Quality"],
  ["trend", "Trend"],
];
// map a z-score into a 0..100 radius (−3σ → 0, +6σ → 100, 0σ → ~33)
const toR = (z) => Math.max(0, Math.min(100, ((Number(z) || 0) + 3) / 9 * 100));

function TipBox({ active, payload, chrome }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: chrome.ink, border: `1px solid ${chrome.grid}` }} className="rounded-lg px-2.5 py-1.5 text-xs shadow-xl">
      <span className="text-muted">{p.factor}: </span>
      <span className={p.z >= 0 ? "text-up" : "text-down"}>{p.z >= 0 ? "+" : ""}{p.z?.toFixed(2)}σ</span>
    </div>
  );
}

export default function FactorRadar({ composite }) {
  const chrome = useChrome();
  const list = (composite || []).slice(0, 12);
  const [idx, setIdx] = useState(0);
  const row = list[idx];

  const data = useMemo(() => {
    if (!row) return [];
    return AXES.map(([k, label]) => ({ factor: label, val: toR(row[k]), z: row[k] }));
  }, [row]);

  if (!row) return null;

  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-sm font-semibold text-white">Factor fingerprint</div>
        <div className="text-xs text-muted">composite {row.quant >= 0 ? "+" : ""}{row.quant?.toFixed(2)}σ</div>
      </div>
      <div className="text-[11px] text-muted mb-2">
        The four-factor shape of <SymbolLink symbol={row.symbol} name={row.company} /> — further out is stronger; the
        dashed ring marks the market average.
      </div>

      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="74%">
            <PolarGrid stroke={chrome.grid} />
            <PolarAngleAxis dataKey="factor" tick={{ fill: chrome.axis, fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            {/* market-average reference ring at z = 0 */}
            <Radar dataKey={() => toR(0)} stroke={chrome.axis} strokeDasharray="4 3" strokeOpacity={0.5} fill="none" isAnimationActive={false} />
            <Radar dataKey="val" stroke="#60a5fa" strokeWidth={2} fill="#60a5fa" fillOpacity={0.28} isAnimationActive animationDuration={700} />
            <Tooltip content={<TipBox chrome={chrome} />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {list.map((r, i) => (
          <button key={r.symbol} onClick={() => setIdx(i)}
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition ${
              i === idx ? "bg-accent/15 text-white border border-accent/30" : "text-muted border border-line/60 hover:text-white hover:bg-panel2/50"}`}>
            {r.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}
