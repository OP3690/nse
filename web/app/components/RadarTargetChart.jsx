"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { useChartTheme } from "./charts";

// Time-to-target: for each cumulative goal (+2 / +5 / +10%), the share of mature
// picks (a full 30-trading-day window) that have reached the goal by day X —
// a monotonic hit-probability trendline computed from the daily price path, so a
// target touched on any day (not just a horizon mark) counts. "All" overlays the
// three goals; a single goal zooms to that one with its median time-to-hit.
const COLORS = { "2": "#16c784", "5": "#5b8cff", "10": "#a78bfa", "15": "#f0a020", "20": "#ec4899" };
const XTICKS = [1, 3, 5, 10, 15, 20, 25, 30];

export default function RadarTargetChart({ targets }) {
  const [sel, setSel] = useState("5");
  const t = useChartTheme();
  const levels = targets?.levels || {};
  const keys = Object.keys(levels); // ["2","5","10"]
  const N = targets?.N || 0;

  const data = useMemo(() => {
    const days = targets?.days || [];
    return days.map((day, idx) => {
      const row = { day };
      for (const k of keys) row[k] = levels[k].prob[idx];
      return row;
    });
  }, [targets, keys, levels]);

  if (!N) {
    return <div className="text-sm text-muted py-10 text-center">
      Time-to-target builds once picks have a full 30-trading-day window of forward prices.
    </div>;
  }

  const shown = sel === "all" ? keys : [sel];

  const TOOLTIP = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-line bg-ink/95 px-3 py-2 text-xs shadow-lg">
        <div className="font-semibold text-white mb-1">By day {label}</div>
        {shown.map((k) => {
          const idx = (targets.days || []).indexOf(label);
          const cnt = idx >= 0 ? levels[k].count[idx] : null;
          return (
            <div key={k} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: COLORS[k] }} />
              <span className="text-muted">+{k}% reached</span>
              <span className="font-mono font-semibold" style={{ color: COLORS[k] }}>
                {levels[k].prob[idx]}%
              </span>
              {cnt != null && <span className="text-muted/70">({cnt}/{N})</span>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line/70 bg-panel2/40 p-0.5 text-[11px] font-semibold">
          {[["all", "All"], ["2", "+2%"], ["5", "+5%"], ["10", "+10%"], ["15", "+15%"], ["20", "+20%"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSel(k)} aria-pressed={sel === k}
              className={`px-3 py-1 rounded-md transition-colors ${sel === k ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>{l}</button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted">{N} matured picks · goal reached within 30 trading days</span>
      </div>

      {/* summary chips (number + probability + speed) */}
      <div className="flex flex-wrap gap-2">
        {shown.map((k) => {
          const c = levels[k];
          return (
            <div key={k} className="flex items-center gap-2.5 rounded-xl border border-line bg-panel2/40 px-3 py-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[k] }} />
              <span className="font-bold text-sm" style={{ color: COLORS[k] }}>+{k}%</span>
              <span className="text-xs text-muted">
                <b className="text-white/90 tabular-nums">{c.hit}</b>/{N} hit
                (<b className="tabular-nums" style={{ color: COLORS[k] }}>{c.pct}%</b>)
                {c.median_days != null && <> · median <b className="text-white/90">{c.median_days}d</b></>}
              </span>
            </div>
          );
        })}
      </div>

      {/* trendline chart */}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -6, bottom: 4 }}>
          <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" ticks={XTICKS} tick={{ fill: t.axis, fontSize: 11 }}
            tickLine={false} axisLine={{ stroke: t.grid }}
            label={{ value: "Trading days held", position: "insideBottom", offset: -2, fill: t.axis, fontSize: 11 }} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: t.axis, fontSize: 11 }}
            tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<TOOLTIP />} cursor={{ stroke: t.cursor, strokeDasharray: "4 4" }} />
          {sel !== "all" && levels[sel].median_days != null && (
            <ReferenceLine x={levels[sel].median_days} stroke={COLORS[sel]} strokeDasharray="4 4" strokeOpacity={0.6}
              label={{ value: `median ${levels[sel].median_days}d`, position: "top", fill: COLORS[sel], fontSize: 10 }} />
          )}
          {shown.map((k) => (
            <Line key={k} type="monotone" dataKey={k} name={`+${k}%`} stroke={COLORS[k]}
              strokeWidth={2.6} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-muted/80 leading-snug">
        Read: the line at day X = the % of picks whose cumulative return had touched the goal at some point by day X
        (first-passage on the daily close path). Rising fast + high = the goal is hit often and early. Among the
        {" "}{N} picks with a full 30-day window. An order-flow observation, not investment advice.
      </p>
    </div>
  );
}
