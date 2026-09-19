"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot,
} from "recharts";
import { useChartTheme } from "./charts";

// Time-to-target: for each cumulative goal (+2 / +5 / +10 / +15 / +20%), the share
// of mature picks (a full 30-trading-day window) that have reached the goal by day
// X — a monotonic hit-probability trendline from the daily price path. A single
// goal also shows *when* it lands (the first-passage distribution as bars) and its
// median time-to-hit; "All" overlays every goal's curve to compare.
const COLORS = { "2": "#16c784", "5": "#5b8cff", "10": "#a78bfa", "15": "#f0a020", "20": "#ec4899" };
const XTICKS = [1, 3, 5, 10, 15, 20, 25, 30];

export default function RadarTargetChart({ targets }) {
  const [sel, setSel] = useState("5");
  const t = useChartTheme();
  const levels = targets?.levels || {};
  const keys = Object.keys(levels);
  const N = targets?.N || 0;
  const single = sel !== "all";

  const data = useMemo(() => {
    const days = targets?.days || [];
    return days.map((day, idx) => {
      const row = { day };
      for (const k of keys) row[k] = levels[k].prob[idx];
      if (single) {
        const c = levels[sel].count;
        row.inc = c[idx] - (idx > 0 ? c[idx - 1] : 0); // picks first hitting on this day
      }
      return row;
    });
  }, [targets, keys, levels, sel, single]);

  if (!N) {
    return <div className="text-sm text-muted py-10 text-center">
      Time-to-target builds once picks have a full 30-trading-day window of forward prices.
    </div>;
  }

  const shown = single ? [sel] : keys;
  const maxInc = single ? Math.max(1, ...data.map((d) => d.inc || 0)) : 1;
  const lastDay = (targets?.days || []).slice(-1)[0] || 30;

  const TOOLTIP = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const idx = (targets.days || []).indexOf(label);
    return (
      <div className="rounded-lg border border-line bg-ink/95 px-3 py-2 text-xs shadow-lg">
        <div className="font-semibold text-white mb-1">Day {label}</div>
        {shown.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: COLORS[k] }} />
            <span className="text-muted">+{k}% reached</span>
            <span className="font-mono font-semibold" style={{ color: COLORS[k] }}>{levels[k].prob[idx]}%</span>
            <span className="text-muted/70">({levels[k].count[idx]}/{N})</span>
          </div>
        ))}
        {single && data[idx]?.inc > 0 && (
          <div className="text-[11px] text-muted mt-1 pt-1 border-t border-line/50">
            {data[idx].inc} pick{data[idx].inc > 1 ? "s" : ""} first crossed +{sel}% today
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line/70 bg-panel2/40 p-0.5 text-[11px] font-semibold">
          {[["all", "All"], ...keys.map((k) => [k, `+${k}%`])].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSel(k)} aria-pressed={sel === k}
              className={`px-3 py-1 rounded-md transition-colors ${sel === k ? "text-white" : "text-muted hover:text-white"}`}
              style={sel === k ? { background: (COLORS[k] || "#5b8cff") + "33", color: COLORS[k] || undefined } : undefined}>{l}</button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted">{N} matured picks · within 30 trading days</span>
      </div>

      {/* summary chips */}
      <div className="flex flex-wrap gap-2">
        {shown.map((k) => {
          const c = levels[k];
          return (
            <div key={k} className="flex items-center gap-2.5 rounded-xl border px-3 py-2"
              style={{ borderColor: COLORS[k] + "55", background: COLORS[k] + "12" }}>
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

      {/* chart */}
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 12, right: 44, left: -4, bottom: 6 }}>
          <defs>
            {single && (
              <linearGradient id="ttArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS[sel]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={COLORS[sel]} stopOpacity={0.02} />
              </linearGradient>
            )}
          </defs>
          <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" type="number" domain={[1, 30]} ticks={XTICKS} tick={{ fill: t.axis, fontSize: 11 }}
            tickLine={false} axisLine={{ stroke: t.grid }} allowDecimals={false}
            label={{ value: "Trading days held →", position: "insideBottomRight", offset: -4, fill: t.axis, fontSize: 10 }} />
          <YAxis yAxisId="p" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: t.axis, fontSize: 11 }}
            tickLine={false} axisLine={false} width={40} />
          <YAxis yAxisId="c" orientation="right" domain={[0, maxInc * 3.4]} hide />
          <Tooltip content={<TOOLTIP />} cursor={{ stroke: t.cursor, strokeDasharray: "4 4" }} />

          {single && (
            <>
              <Bar yAxisId="c" dataKey="inc" name="first hits" fill={COLORS[sel]} fillOpacity={0.22}
                radius={[2, 2, 0, 0]} isAnimationActive={false} barSize={7} />
              <Area yAxisId="p" type="monotone" dataKey={sel} stroke="none" fill="url(#ttArea)" isAnimationActive={false} />
              {levels[sel].median_days != null && (
                <ReferenceLine yAxisId="p" x={levels[sel].median_days} stroke={COLORS[sel]} strokeDasharray="4 4" strokeOpacity={0.7}
                  label={{ value: `median ${levels[sel].median_days}d`, position: "insideTopLeft", fill: COLORS[sel], fontSize: 10, fontWeight: 700 }} />
              )}
            </>
          )}
          {shown.map((k) => (
            <Line key={k} yAxisId="p" type="monotone" dataKey={k} name={`+${k}%`} stroke={COLORS[k]}
              strokeWidth={2.6} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          ))}
          {shown.map((k) => (
            <ReferenceDot key={`rd-${k}`} yAxisId="p" x={lastDay} y={levels[k].pct} r={4}
              fill={COLORS[k]} stroke={t.panel || "#0b0f17"} strokeWidth={1.5}
              label={{ value: `${levels[k].pct}%`, position: "right", fill: COLORS[k], fontSize: 12, fontWeight: 800 }} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-muted/80 leading-snug">
        Line = cumulative % of picks that had touched the goal by day X (first-passage on the daily close path).
        {single && <> Bars = how many first crossed +{sel}% on each day — the shape shows whether the goal lands early or drags out.</>}
        {" "}Among the {N} picks with a full 30-day window. An order-flow observation, not investment advice.
      </p>
    </div>
  );
}
