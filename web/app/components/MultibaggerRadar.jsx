import { SymbolLink } from "./ui";

// KNN Multibagger Radar — the pipeline finds each stock's k nearest historical
// analogs (same delivery/volume/OI/momentum fingerprint) and reports how often
// those analogs went on to gain `target_pct` within `horizon_days`. We surface
// the top picks with the modeled probability, the lift over the base rate, and
// the analog agreement, plus the model's out-of-sample validation so the number
// is honest rather than a black box.
export default function MultibaggerRadar({ mb }) {
  if (!mb?.ok || !mb.picks?.length) return null;
  const horizon = mb.horizon_days ?? 21;
  const target = mb.target_pct ?? 10;
  const v = mb.validation || {};
  const picks = mb.picks.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* model card: what the probability means + how well it has held up */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-panel2/40 p-3 text-xs">
        <span className="text-muted">
          Modeled chance a name gains <b className="text-white/90">≥{target}%</b> within{" "}
          <b className="text-white/90">{horizon} trading days</b>, from its {mb.k} nearest historical analogs.
        </span>
        <div className="flex items-center gap-4 ml-auto">
          {mb.base_rate != null && <span className="text-muted">Base rate <b className="text-white/90 tabular-nums">{mb.base_rate.toFixed(0)}%</b></span>}
          {v.precision_top_decile != null && (
            <span className="text-muted">Top-decile precision <b className="text-up tabular-nums">{v.precision_top_decile.toFixed(0)}%</b></span>
          )}
          {v.lift != null && <span className="text-muted">Lift <b className="text-accent tabular-nums">{v.lift.toFixed(1)}×</b></span>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {picks.map((p) => {
          const prob = p.prob ?? 0;
          const agree = p.neighbors_total ? Math.round((p.neighbors_up / p.neighbors_total) * 100) : null;
          const reasons = Array.isArray(p.reasons) ? p.reasons : [];
          const analogs = Array.isArray(p.analogs) ? p.analogs.slice(0, 3) : [];
          return (
            <div key={p.symbol} className="rounded-xl border border-line bg-gradient-to-b from-panel2/60 to-panel/40 p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <SymbolLink symbol={p.symbol} name={p.company} />
                  <div className="text-[11px] text-muted truncate mt-0.5">{p.sector || "—"} · ₹{p.close?.toLocaleString("en-IN")}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-bold tabular-nums text-up leading-none">{prob.toFixed(0)}%</div>
                  <div className="text-[9px] uppercase tracking-wider text-muted mt-0.5">prob</div>
                </div>
              </div>

              {/* probability bar vs base rate marker */}
              <div className="relative h-2 rounded-full bg-line overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-up/60 to-up" style={{ width: `${Math.min(100, prob)}%` }} />
                {mb.base_rate != null && (
                  <span className="absolute top-[-2px] bottom-[-2px] w-px bg-white/60" style={{ left: `${Math.min(100, mb.base_rate)}%` }} title={`Base rate ${mb.base_rate.toFixed(0)}%`} />
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold tabular-nums text-accent">{p.lift != null ? `${p.lift.toFixed(1)}×` : "—"}</div>
                  <div className="text-[9px] uppercase tracking-wider text-muted">lift</div>
                </div>
                <div>
                  <div className="text-sm font-bold tabular-nums text-white/90">{agree != null ? `${agree}%` : "—"}</div>
                  <div className="text-[9px] uppercase tracking-wider text-muted">analogs up</div>
                </div>
                <div>
                  <div className="text-sm font-bold tabular-nums text-up">{p.median_analog_move != null ? `+${p.median_analog_move.toFixed(0)}%` : "—"}</div>
                  <div className="text-[9px] uppercase tracking-wider text-muted">median move</div>
                </div>
              </div>

              {reasons.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {reasons.map((r, i) => (
                    <span key={i} className="chip chip-accent text-[10px]">{r}</span>
                  ))}
                </div>
              )}

              {analogs.length > 0 && (
                <div className="text-[10px] text-muted leading-snug border-t border-line/50 pt-2">
                  Similar past setups:{" "}
                  {analogs.map((a, i) => (
                    <span key={i}>
                      {i > 0 && " · "}
                      <span className="text-white/70">{a.symbol}</span>{" "}
                      <span className={a.move >= 0 ? "text-up" : "text-down"}>{a.move >= 0 ? "+" : ""}{Math.round(a.move)}%</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted/80 leading-snug">
        Analog-based probabilities from {mb.samples?.toLocaleString("en-IN")} historical setups over {mb.universe_scored?.toLocaleString("en-IN")} scored names.
        A statistical pattern read of order flow — not a price target, and not investment advice.
      </p>
    </div>
  );
}
