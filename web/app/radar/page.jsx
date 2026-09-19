import Link from "next/link";
import { getRadarBacktest } from "../lib/data";
import { PageHeader } from "../components/ui";
import RadarTable from "../components/RadarTable";

export const dynamic = "force-dynamic";

const fmt = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);

export default async function RadarBacktestPage() {
  const bt = await getRadarBacktest();
  if (!bt?.meta?.ok) {
    return (
      <div className="card text-center py-16 text-muted">
        No backtest yet — it builds once the pipeline has archived a few sessions of Radar picks.
      </div>
    );
  }
  const { meta, summary } = bt;
  const hz = meta.horizons;
  const last = summary[`d${hz[hz.length - 1]}`];
  const first = summary.d1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Radar Backtest"
        chip="KNN Multibagger · realized"
        meta={
          <>
            <div className="text-sm font-semibold text-white">{meta.date_from} → {meta.date_to}</div>
            <div className="text-xs text-muted">
              {meta.total_predictions} predictions · {meta.unique_stocks} stocks · {meta.sessions} sessions
            </div>
          </>
        }
      >
        Every top-3 pick the Multibagger Radar has published, scored against real forward prices and
        benchmarked to the NIFTY 50 over the same holding window. No cherry-picking — winners and losers alike.
      </PageHeader>

      {/* honest verdict from the live numbers */}
      {last && first && (
        <div className="card p-5">
          <p className="text-lg font-semibold leading-relaxed">
            Over {hz[hz.length - 1]} trading days the picks hit{" "}
            <span className={last.hit >= 50 ? "text-up" : "text-down"}>{last.hit}%</span> positive,
            averaging <span className={last.avg >= 0 ? "text-up" : "text-down"}>{fmt(last.avg)}</span>
            {last.avg_excess != null && <> and <span className={last.avg_excess >= 0 ? "text-up" : "text-down"}>{fmt(last.avg_excess)}</span> vs NIFTY</>} —
            while at 1 day it's near a coin-flip (<span className="text-white/80">{first.hit}%</span>, {fmt(first.avg)}).
          </p>
          <p className="text-sm text-muted mt-2 max-w-3xl">
            The edge builds with holding time, not immediacy — consistent with a model tuned for a ~21-day, +10% move
            rather than next-day pops. The <b className="text-white/80">vs NIFTY</b> view below is the real test: whether
            a pick beat simply holding the index.
          </p>
        </div>
      )}

      {/* per-horizon accuracy cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {hz.map((k) => {
          const s = summary[`d${k}`];
          if (!s) return null;
          return (
            <div key={k} className="stat-tile">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-muted">{k}D</span>
                <span className="text-[10px] font-mono text-muted/70">n={s.n}</span>
              </div>
              <div className="text-2xl font-bold tabular-nums leading-none mt-1">
                {s.hit}<span className="text-sm text-muted font-semibold">% hit</span>
              </div>
              <div className="h-1.5 rounded-full bg-down/30 overflow-hidden flex mt-1">
                <span className="bg-up/80 h-full" style={{ width: `${s.hit}%` }} />
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] font-mono">
                <div className="flex justify-between"><span className="text-muted font-sans">Avg</span><span className={s.avg >= 0 ? "text-up" : "text-down"}>{fmt(s.avg)}</span></div>
                <div className="flex justify-between"><span className="text-muted font-sans">Median</span><span className={s.median >= 0 ? "text-up" : "text-down"}>{fmt(s.median)}</span></div>
                <div className="flex justify-between border-t border-line/50 pt-0.5 mt-0.5"><span className="text-muted font-sans">vs NIFTY</span><span className={(s.avg_excess ?? 0) >= 0 ? "text-up" : "text-down"}>{fmt(s.avg_excess)}</span></div>
                <div className="flex justify-between"><span className="text-muted font-sans">Beat idx</span><span className="text-white/80">{s.beat == null ? "—" : `${s.beat}%`}</span></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-5">
        <h2 className="card-title mb-3">Every prediction</h2>
        <RadarTable rows={bt.rows} horizons={hz} />
      </div>

      <div className="card border border-line bg-panel2/50">
        <div className="text-xs text-muted leading-relaxed">
          <span className="font-semibold text-white">Method. </span>
          Forward return = each stock's prediction-day close → its close N real trading days later, from that symbol's
          own continuous price history. Excess = that minus the NIFTY 50 over the identical window. Rank-IC
          {meta.ic_prob_vs_15d != null && <> (prob vs 15D <span className="font-mono">{meta.ic_prob_vs_15d}</span>{meta.ic_prob_vs_30d != null && <>, vs 30D <span className="font-mono">{meta.ic_prob_vs_30d}</span></>})</>}{" "}
          measures whether a higher model probability lined up with a higher realized return. End-of-day closes only —
          no slippage, costs or dividends. Recent picks without full forward data are pending.
          <span className="text-white"> Not investment advice.</span>
        </div>
      </div>

      <Link href="/" className="link-back">← Back to dashboard</Link>
    </div>
  );
}
