import { SymbolLink } from "./ui";

// Quiet Accumulation — the delivery/price divergence screen. These are names
// where the *price* drifted sideways-to-down while the *delivery %* trended
// firmly up (strong Mann-Kendall), i.e. real buyers taking delivery into
// weakness rather than chasing strength. The dual sparkline makes the divergence
// visible: delivery (green) rising as price (grey) falls.
function Spark({ series }) {
  if (!series || series.length < 2) return null;
  const W = 118, H = 34, P = 3;
  const xs = series.map((_, i) => P + (i * (W - 2 * P)) / (series.length - 1));
  const norm = (vals) => {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = hi - lo || 1;
    return vals.map((v) => H - P - ((v - lo) / span) * (H - 2 * P));
  };
  const dy = norm(series.map((s) => s.deliv));
  const py = norm(series.map((s) => s.close));
  const path = (ys) => ys.map((y, i) => `${i ? "L" : "M"}${xs[i].toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0" aria-hidden>
      {/* price: falling, muted */}
      <path d={path(py)} fill="none" stroke="rgb(var(--muted))" strokeWidth="1.4" strokeOpacity="0.7" />
      {/* delivery: rising, green */}
      <path d={path(dy)} fill="none" stroke="rgb(var(--up))" strokeWidth="1.8" />
      <circle cx={xs[xs.length - 1]} cy={dy[dy.length - 1]} r="2" fill="rgb(var(--up))" />
    </svg>
  );
}

export default function QuietAccumulation({ quiet }) {
  const rows = (quiet || []).slice(0, 6);
  if (!rows.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_118px_84px_84px_70px] gap-3 px-1 text-[10px] uppercase tracking-wider text-muted font-semibold">
        <span>Stock</span><span className="text-center">Deliv ▲ vs Price</span>
        <span className="text-right">Price 6m</span><span className="text-right">Deliv Δ</span><span className="text-right">Conviction</span>
      </div>
      {rows.map((s) => (
        <div key={s.symbol}
          className="grid grid-cols-[minmax(0,1fr)_118px_84px_84px_70px] items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-panel2/50"
          title={`${s.company} · up-move probability ${s.up_prob?.toFixed?.(0) ?? "—"}% · delivery ${s.base_dlv?.toFixed?.(0)}%→${s.rec_dlv?.toFixed?.(0)}%`}>
          <div className="min-w-0">
            <SymbolLink symbol={s.symbol} name={s.company} />
            <div className="text-[10px] text-muted truncate">{s.sector || "—"}</div>
          </div>
          <div className="flex justify-center"><Spark series={s.series} /></div>
          <div className={`text-right font-mono text-xs font-semibold ${s.price_chg >= 0 ? "text-up" : "text-down"}`}>
            {s.price_chg >= 0 ? "+" : ""}{s.price_chg?.toFixed?.(0)}%
          </div>
          <div className="text-right font-mono text-xs font-semibold text-up">
            +{s.dlv_delta?.toFixed?.(1)}pp
          </div>
          <div className="text-right">
            <span className={`text-sm font-bold tabular-nums ${s.conviction >= 80 ? "text-up" : s.conviction >= 50 ? "text-accent" : "text-muted"}`}>
              {s.conviction?.toFixed?.(0)}
            </span>
          </div>
        </div>
      ))}
      <p className="text-[10px] text-muted/80 leading-snug pt-1">
        Price flat-to-down while delivery-based buying trends up — accumulation into weakness. Conviction blends trend
        strength, statistical significance &amp; volume. An order-flow observation, not investment advice.
      </p>
    </div>
  );
}
