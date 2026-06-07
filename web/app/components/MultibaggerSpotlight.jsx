"use client";

import StockTip from "./StockTip";
import InfoDot from "./InfoDot";

const fmtMove = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`);

// Circular probability gauge (SVG ring).
function ProbGauge({ value }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const r = 30, c = 2 * Math.PI * r;
  const off = c * (1 - v / 100);
  const hue = v >= 55 ? "#16c784" : v >= 40 ? "#c77dff" : "#5b8cff";
  return (
    <div className="relative w-[78px] h-[78px] shrink-0">
      <svg viewBox="0 0 78 78" className="w-full h-full -rotate-90">
        <circle cx="39" cy="39" r={r} fill="none" stroke="#243049" strokeWidth="7" />
        <circle cx="39" cy="39" r={r} fill="none" stroke={hue} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-bold text-lg leading-none tabular-nums" style={{ color: hue }}>
          {v.toFixed(0)}%
        </span>
        <span className="text-[9px] text-muted uppercase tracking-wide mt-0.5">prob</span>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "text-white" }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className={`font-mono text-sm font-semibold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

function PickCard({ pick, rank, baseRate }) {
  const lift = pick.lift;
  const liftTone = lift >= 1.5 ? "text-up" : lift >= 1 ? "text-accent" : "text-muted";
  const conf = pick.confidence;
  const confTone = conf >= 70 ? "text-up" : conf >= 50 ? "text-accent" : "text-muted";
  return (
    <div className="relative rounded-2xl border border-line bg-gradient-to-b from-panel2 to-panel p-4 flex flex-col gap-3 overflow-hidden">
      <div className="absolute -top-12 -right-8 w-32 h-32 rounded-full bg-[#c77dff]/10 blur-2xl pointer-events-none" />
      <div className="absolute top-3 right-3 w-6 h-6 rounded-lg bg-[#c77dff]/15 text-[#c77dff] text-xs font-bold flex items-center justify-center">
        {rank}
      </div>

      <div className="flex items-center gap-3 relative">
        <ProbGauge value={pick.prob} />
        <div className="min-w-0">
          <StockTip symbol={pick.symbol} name={pick.company}
            className="font-bold text-white text-base hover:text-accent cursor-pointer" />
          <div className="text-[11px] text-muted truncate max-w-[150px]" title={pick.company || undefined}>
            {pick.company || pick.symbol}
          </div>
          <div className="text-[11px] text-muted truncate">{pick.sector || "—"}</div>
          {pick.close != null && (
            <div className="font-mono text-sm text-white mt-0.5">₹{Number(pick.close).toLocaleString("en-IN")}</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl border border-line/70 bg-ink/40 p-2.5">
        <Metric label="Lift" value={lift != null ? `${lift.toFixed(2)}×` : "—"} tone={liftTone} />
        <Metric label="Confidence" value={`${conf}%`} tone={confTone} />
        <Metric label="Analogs" value={`${pick.neighbors_up}/${pick.neighbors_total}`} tone="text-accent" />
      </div>

      <div className="text-[11px] text-muted">
        Median analog went <span className="font-mono text-up font-semibold">{fmtMove(pick.median_analog_move)}</span> within a month
        {baseRate != null && <> · base rate <span className="font-mono text-muted">{baseRate}%</span></>}
      </div>

      {!!pick.reasons?.length && (
        <ul className="text-[12px] text-muted space-y-1">
          {pick.reasons.map((r, i) => (
            <li key={i} className="flex gap-1.5"><span className="text-[#c77dff]">·</span><span>{r}</span></li>
          ))}
        </ul>
      )}

      {!!pick.analogs?.length && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Historical analogs that popped</div>
          <div className="flex flex-wrap gap-1.5">
            {pick.analogs.map((a, i) => (
              <span key={i} className="chip chip-up text-[10px]" title={a.date}>
                {a.symbol} {fmtMove(a.move)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MultibaggerSpotlight({ multibaggers }) {
  const mb = multibaggers;
  if (!mb?.ok || !mb.picks?.length) return null;
  const v = mb.validation;

  return (
    <section className="card p-5 border border-[#c77dff]/25">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#c77dff] animate-pulse" />
              KNN Multibagger Radar
            </span>
            <span className="chip text-[10px] bg-[#c77dff]/15 text-[#c77dff]">Machine-learning analogs</span>
            <InfoDot topic="screener.multibaggers" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            The 3 stocks whose current setup most resembles past names that popped <span className="text-white">&gt;10% within ~1 month</span>,
            found by a k-nearest-neighbour search over the full price / delivery / open-interest history.
            Every pick is grounded in real historical analogs shown below.
          </p>
        </div>
        {v && (
          <div className="flex gap-4 text-right shrink-0">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted">Holdout lift</div>
              <div className={`font-mono font-bold tabular-nums ${v.lift >= 1.5 ? "text-up" : "text-accent"}`}>
                {v.lift != null ? `${v.lift}×` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted">Top-decile hit</div>
              <div className="font-mono font-bold tabular-nums text-white">{v.precision_top_decile}%</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted">Base rate</div>
              <div className="font-mono font-bold tabular-nums text-muted">{v.base_rate}%</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {mb.picks.map((p, i) => (
          <PickCard key={p.symbol} pick={p} rank={i + 1} baseRate={mb.base_rate} />
        ))}
      </div>

      <p className="text-[11px] text-muted mt-4 flex items-start gap-1.5">
        <span className="text-amber-400 shrink-0">⚠</span>
        <span>
          Educational analytics, <span className="text-white">not investment advice</span>. The model reports modelled
          probabilities and historical precedents over {mb.samples?.toLocaleString("en-IN")} labelled setups (K={mb.k},
          {" "}{mb.horizon_days}-session horizon) — it does not predict the future. Do your own research; markets carry risk.
        </span>
      </p>
    </section>
  );
}
