"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { useChartTheme } from "./charts";

const CAT_COLOR = {
  promoter: "#f5a524",
  fii: "#5b8cff",
  dii: "#16c784",
  public: "#a78bfa",
};

export default function OwnershipDonut({ categories }) {
  const t = useChartTheme();
  const data = (categories || [])
    .filter((c) => c.pct != null && c.pct > 0)
    .map((c) => ({ name: c.label, key: c.key, value: +c.pct, delta: c.delta_pp }));
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return null;
  // Largest holder gets the centre callout.
  const top = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={210}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
            innerRadius={56} outerRadius={88} paddingAngle={2} stroke={t.ink} strokeWidth={2}
            isAnimationActive animationDuration={750}>
            {data.map((d, i) => <Cell key={i} fill={CAT_COLOR[d.key] || t.axis} />)}
          </Pie>
          <Tooltip content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="bg-panel2 border border-line rounded-lg px-3 py-2 text-xs shadow-lg">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-2 h-2 rounded-sm" style={{ background: CAT_COLOR[payload[0].payload.key] }} />
                  <span className="text-white font-medium">{payload[0].name}</span>
                </div>
                <div className="font-mono text-white">{payload[0].value.toFixed(2)}%</div>
                {payload[0].payload.delta != null && (
                  <div className={`font-mono ${payload[0].payload.delta > 0 ? "text-up" : payload[0].payload.delta < 0 ? "text-down" : "text-muted"}`}>
                    {payload[0].payload.delta > 0 ? "+" : ""}{payload[0].payload.delta.toFixed(2)} pp QoQ
                  </div>
                )}
              </div>
            ) : null} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-[10px] text-muted uppercase tracking-wide">Largest</div>
        <div className="text-lg font-bold tabular-nums leading-none" style={{ color: CAT_COLOR[top.key] }}>
          {top.value.toFixed(1)}%
        </div>
        <div className="text-[10px] text-muted">{top.name}</div>
      </div>
    </div>
  );
}
