import { getLatest } from "../lib/data";
import { PageHeader } from "../components/ui";
import InsightStrip from "../components/strategy/InsightStrip";
import RegimeGauge from "../components/strategy/RegimeGauge";
import StrategyBacktests from "../components/strategy/StrategyBacktests";
import FactorLeaders from "../components/strategy/FactorLeaders";
import RiskReturnScatter from "../components/strategy/RiskReturnScatter";
import SignalScreens from "../components/strategy/SignalScreens";
import RiskLeaders from "../components/strategy/RiskLeaders";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const d = await getLatest();
  if (!d) return <div className="card text-center py-16 text-muted">No data. Run the pipeline first.</div>;

  const s = d.strategy;
  if (!s || !s.ok) {
    return (
      <div className="space-y-5">
        <PageHeader title="Strategy Lab" info="strategy.overview" chip="Quant backtests · Factors · Risk">
          Rules-based backtests, factor scores, technical screens and portfolio risk metrics over the liquid universe.
        </PageHeader>
        <div className="card text-center py-16 text-muted">
          Not enough price history yet to build the strategy analytics{s?.reason ? ` (${s.reason})` : ""}.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Strategy Lab"
        info="strategy.overview"
        chip="Quant backtests · Factors · Risk"
        meta={
          <>
            <div className="text-sm font-semibold text-white">{s.as_of || d.date}</div>
            <div className="text-xs text-muted">{s.universe} names · {s.history_days}d history</div>
          </>
        }
      >
        Rules-based strategy backtests, classic equity-factor scores, technical signal screens and
        portfolio risk metrics — built with real maths over the liquid universe. Descriptive analytics,
        explicitly not investment advice.
      </PageHeader>

      <InsightStrip strategy={s} />
      <RegimeGauge regime={s.regime} />
      <StrategyBacktests backtests={s.backtests} />
      <FactorLeaders factors={s.factors} />
      <RiskReturnScatter scatter={s.risk?.scatter} />
      <SignalScreens signals={s.signals} />
      <RiskLeaders risk={s.risk} />
    </div>
  );
}
