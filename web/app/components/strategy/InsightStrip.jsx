"use client";

import { useCountUp, TONE_TEXT, TONE_RGB } from "./_util";

function InsightCard({ label, value, decimals = 0, prefix = "", suffix = "", sub, tone = "accent", spark }) {
  const [ref, shown] = useCountUp(value, { decimals });
  const rgb = TONE_RGB[tone] || TONE_RGB.accent;
  return (
    <div ref={ref} className="relative overflow-hidden rounded-xl border border-line bg-panel2/40 p-3.5 animate-rise">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, rgb(${rgb}), transparent)` }} />
      <div className="text-[11px] text-muted uppercase tracking-wide truncate">{label}</div>
      <div className={`mt-1 font-mono font-bold text-2xl tabular-nums ${TONE_TEXT[tone] || "text-white"}`}>
        {prefix}{shown}{suffix}
      </div>
      {sub && <div className="text-[11px] text-muted mt-0.5 leading-snug">{sub}</div>}
      {spark}
    </div>
  );
}

const strongestFactor = (r) => {
  const f = [["Momentum", r.momentum], ["Low-Vol", r.lowvol], ["Quality", r.quality], ["Trend", r.trend]]
    .filter(([, v]) => v != null);
  if (!f.length) return null;
  return f.sort((a, b) => b[1] - a[1])[0];
};

export default function InsightStrip({ strategy }) {
  const s = strategy;
  if (!s || !s.ok) return null;
  const bts = s.backtests || [];
  const bestBt = bts.length ? [...bts].sort((a, b) => (b.cagr ?? -1e9) - (a.cagr ?? -1e9))[0] : null;
  const sig = Object.fromEntries((s.signals || []).map((g) => [g.key, g]));
  const golden = sig.golden_cross?.count || 0;
  const death = sig.death_cross?.count || 0;
  const trendHealth = golden + death ? Math.round((golden / (golden + death)) * 100) : null;
  const top = (s.factors?.composite || [])[0];
  const sf = top ? strongestFactor(top) : null;
  const regime = s.regime || {};

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <InsightCard
        label="Market Regime"
        value={regime.score}
        suffix=" / 100"
        tone={regime.tone}
        sub={regime.label + " — " + (regime.components?.find((c) => c.tone === "down")?.label || "balanced") + " is the drag"}
      />
      {bestBt && (
        <InsightCard
          label={`Leading Strategy · ${bestBt.label.replace("Cross-Sectional ", "")}`}
          value={bestBt.cagr}
          decimals={1}
          prefix={bestBt.cagr >= 0 ? "+" : ""}
          suffix="%"
          tone={bestBt.cagr >= 0 ? "up" : "down"}
          sub={`CAGR · ${(bestBt.cagr - bestBt.bench_cagr >= 0 ? "+" : "")}${(bestBt.cagr - bestBt.bench_cagr).toFixed(1)}pp vs equal-weight · Sharpe ${bestBt.sharpe?.toFixed(2)}`}
        />
      )}
      <InsightCard
        label="Trend Health"
        value={trendHealth ?? 0}
        suffix="%"
        tone={trendHealth >= 60 ? "up" : trendHealth >= 40 ? "amber" : "down"}
        sub={`${golden} golden crosses vs ${death} death crosses live`}
      />
      {top && (
        <InsightCard
          label={`Top Quant Pick · ${top.symbol}`}
          value={top.quant}
          decimals={2}
          prefix={top.quant >= 0 ? "+" : ""}
          suffix="σ"
          tone="accent"
          sub={`Composite factor score${sf ? ` · led by ${sf[0]} (${sf[1] >= 0 ? "+" : ""}${sf[1].toFixed(1)}σ)` : ""}`}
        />
      )}
    </section>
  );
}
