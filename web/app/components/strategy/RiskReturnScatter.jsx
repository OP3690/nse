"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Cell,
  Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import InfoDot from "../InfoDot";
import { useChrome } from "./_util";

const RF = 7; // annual risk-free %, matches the pipeline

// Sharpe → colour: deep green (excellent) ↔ red (poor risk-adjusted return).
function colorFor(sharpe) {
  if (sharpe == null) return "#8a96ab";
  if (sharpe >= 1.5) return "#16c784";
  if (sharpe >= 0.5) return "#4ade80";
  if (sharpe >= 0) return "#a3e635";
  if (sharpe >= -1) return "#f59e0b";
  return "#ea3943";
}

function quantile(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.max(0, Math.min(s.length - 1, Math.round(q * (s.length - 1))));
  return s[i];
}

function TipBox({ active, payload, chrome }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: chrome.ink, border: `1px solid ${chrome.grid}` }}
      className="rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-bold text-white mb-1">{d.symbol}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
        <span className="text-muted">Return</span><span className={d.ann_ret >= 0 ? "text-up text-right" : "text-down text-right"}>{d.ann_ret >= 0 ? "+" : ""}{d.ann_ret}%</span>
        <span className="text-muted">Volatility</span><span className="text-right text-white">{d.ann_vol}%</span>
        <span className="text-muted">Sharpe</span><span className="text-right" style={{ color: colorFor(d.sharpe) }}>{d.sharpe ?? "—"}</span>
        <span className="text-muted">Beta</span><span className="text-right text-white">{d.beta ?? "—"}</span>
      </div>
    </div>
  );
}

export default function RiskReturnScatter({ scatter }) {
  const chrome = useChrome();
  const [hideOutliers, setHideOutliers] = useState(true);

  const { pts, dom, counts } = useMemo(() => {
    const all = (scatter || []).filter((d) => d.ann_vol != null && d.ann_ret != null);
    const vols = all.map((d) => d.ann_vol);
    const rets = all.map((d) => d.ann_ret);
    // clamp the view to the 2–98th pct so a few blow-ups don't squash the cloud
    const dom = {
      vx: [0, Math.ceil(quantile(vols, 0.98) / 5) * 5 || 60],
      ry: [Math.floor(quantile(rets, 0.02) / 10) * 10, Math.ceil(quantile(rets, 0.98) / 10) * 10],
    };
    const pts = hideOutliers
      ? all.filter((d) => d.ann_vol <= dom.vx[1] && d.ann_ret >= dom.ry[0] && d.ann_ret <= dom.ry[1])
      : all;
    const counts = {
      winners: all.filter((d) => d.ann_ret > RF && (d.sharpe ?? 0) >= 0.5).length,
      losers: all.filter((d) => d.ann_ret < 0).length,
      total: all.length,
    };
    return { pts, dom, counts };
  }, [scatter, hideOutliers]);

  if (!pts.length) return null;

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2">
            <span>Risk / Return Map</span>
            <InfoDot topic="strategy.risk_map" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            Every liquid name plotted by annualized volatility (risk, x) against annualized return (reward, y),
            coloured by Sharpe ratio and sized by smart-money score. The sweet spot is up-and-left:
            high return for low risk.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none shrink-0">
          <input type="checkbox" checked={hideOutliers} onChange={(e) => setHideOutliers(e.target.checked)}
            className="accent-accent" />
          Trim outliers
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
        {[["≥1.5", "#16c784"], ["0.5–1.5", "#4ade80"], ["0–0.5", "#a3e635"], ["−1–0", "#f59e0b"], ["<−1", "#ea3943"]].map(([l, c]) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: c }} />
            <span className="text-muted">Sharpe {l}</span>
          </span>
        ))}
        <span className="text-muted ml-auto">{counts.winners} efficient · {counts.losers} underwater · {counts.total} names</span>
      </div>

      <div className="h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 16, bottom: 18, left: 4 }}>
            {/* quadrant tints: up-left favourable (green), down-right unfavourable (red) */}
            <ReferenceArea x1={dom.vx[0]} x2={dom.vx[1]} y1={RF} y2={dom.ry[1]} fill="#16c784" fillOpacity={0.04} />
            <ReferenceArea x1={dom.vx[0]} x2={dom.vx[1]} y1={dom.ry[0]} y2={0} fill="#ea3943" fillOpacity={0.04} />
            <CartesianGrid stroke={chrome.grid} strokeDasharray="3 3" />
            <XAxis type="number" dataKey="ann_vol" name="Volatility" unit="%" domain={dom.vx}
              tick={{ fill: chrome.axis, fontSize: 11 }} stroke={chrome.grid}
              label={{ value: "Annualized volatility →", position: "insideBottom", offset: -10, fill: chrome.axis, fontSize: 11 }} />
            <YAxis type="number" dataKey="ann_ret" name="Return" unit="%" domain={dom.ry}
              tick={{ fill: chrome.axis, fontSize: 11 }} stroke={chrome.grid} width={44}
              label={{ value: "Annualized return", angle: -90, position: "insideLeft", fill: chrome.axis, fontSize: 11, dy: 40 }} />
            <ZAxis type="number" dataKey="score" range={[20, 220]} domain={[0, 100]} />
            <ReferenceLine y={0} stroke={chrome.axis} strokeOpacity={0.55} />
            <ReferenceLine y={RF} stroke="#60a5fa" strokeDasharray="5 4" strokeOpacity={0.7}
              label={{ value: `risk-free ${RF}%`, position: "right", fill: "#60a5fa", fontSize: 10 }} />
            <Tooltip content={<TipBox chrome={chrome} />} cursor={{ stroke: chrome.axis, strokeOpacity: 0.3 }} />
            <Scatter data={pts} isAnimationActive animationDuration={700} fillOpacity={0.78}>
              {pts.map((d) => (
                <Cell key={d.symbol} fill={colorFor(d.sharpe)} stroke={colorFor(d.sharpe)} strokeOpacity={0.5} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-muted flex items-start gap-1.5">
        <span className="text-amber-400 shrink-0">⚠</span>
        <span>Positions are backward-looking statistics over one ~1-year window, <span className="text-white">not investment advice</span>.
          A name in the favourable quadrant can still de-rate; risk and reward both shift over time.</span>
      </p>
    </section>
  );
}
