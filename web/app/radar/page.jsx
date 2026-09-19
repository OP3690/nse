import Link from "next/link";
import { getRadarBacktest } from "../lib/data";
import { PageHeader } from "../components/ui";
import RadarTable from "../components/RadarTable";
import RadarTargetChart from "../components/RadarTargetChart";
import RadarSimulator from "../components/RadarSimulator";
import RadarBatchSimulator from "../components/RadarBatchSimulator";

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

      {/* time-to-target: probability of reaching a cumulative goal by day X */}
      {bt.targets?.N > 0 && (
        <div className="card p-5">
          <h2 className="card-title mb-1">Time to target</h2>
          <p className="text-xs text-muted mb-4 max-w-2xl">
            Of the picks with a full 30-day window, the share that reached a cumulative goal by each day —
            e.g. “if my goal is +5%, how often and how fast is it hit?”. Pick a goal, or “All” to compare.
          </p>
          <RadarTargetChart targets={bt.targets} />
        </div>
      )}

      {/* basket simulator: split N ways, hold a fixed horizon, reinvest */}
      {bt.rows?.some((r) => r.xd5 != null) && (
        <div className="card p-5">
          <h2 className="card-title mb-1">Basket simulator · fixed hold</h2>
          <p className="text-xs text-muted mb-4 max-w-2xl">
            Split your capital equally across the day’s top picks, hold every leg for a fixed number of days, then
            exit the whole basket and reinvest in the next day’s picks. Set the capital, split, holding period and a
            probability filter.
          </p>
          <RadarBatchSimulator rows={bt.rows} />
        </div>
      )}

      {/* target-exit simulator: one position, sell at target %, roll forward */}
      {bt.rows?.some((r) => r.sx5 != null) && (
        <div className="card p-5">
          <h2 className="card-title mb-1">Target-exit simulator · sell on gain</h2>
          <p className="text-xs text-muted mb-4 max-w-2xl">
            Put money on the highest-probability pick, sell the instant it hits your target, roll the proceeds into
            the next pick, and repeat — a mechanical “what if I’d kept recycling this capital on a fixed take-profit?”.
          </p>
          <RadarSimulator rows={bt.rows} />
        </div>
      )}

      {/* reactive accuracy cards + prediction table (recompute on filter) */}
      <RadarTable rows={bt.rows} horizons={hz} total={meta.total_predictions} />

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
