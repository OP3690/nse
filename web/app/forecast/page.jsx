import Link from "next/link";
import { getLatest } from "../lib/data";
import { Pct, TrendBadge, TrendScore, Confidence, SymbolLink, Section, PageHeader } from "../components/ui";
import InfoDot from "../components/InfoDot";

export const dynamic = "force-dynamic";

function RegimeBanner({ regime }) {
  if (!regime) return null;
  const tone =
    regime.label === "Risk-On" ? "border-up/40 bg-up/5"
    : regime.label === "Risk-Off" ? "border-down/40 bg-down/5"
    : "border-line bg-panel2";
  const dot =
    regime.label === "Risk-On" ? "bg-up" : regime.label === "Risk-Off" ? "bg-down" : "bg-muted";
  return (
    <div className={`card border ${tone}`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
          <span className="font-bold text-lg">{regime.label}</span>
          <InfoDot topic="forecast.regime" hidePeriod />
        </div>
        <p className="text-sm text-muted flex-1 min-w-[14rem]">{regime.note}</p>
        <div className="flex gap-6 text-sm font-mono">
          <div><span className="text-muted">NIFTY </span>{regime.nifty_last?.toLocaleString("en-IN")}</div>
          <div><span className="text-muted">30d </span><Pct value={regime.nifty_pchg30d} /></div>
          <div><span className="text-muted">52w pos </span>{regime.nifty_52w_pos}%</div>
          <div><span className="text-muted">VIX </span>{regime.vix}</div>
        </div>
      </div>
    </div>
  );
}

function SectorRotation({ sectors }) {
  if (!sectors?.length) return null;
  return (
    <Section title="Sector Rotation (30-day)" info="forecast.sector_rotation">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {sectors.map((s) => (
          <div key={s.index} className="bg-panel2 border border-line rounded-lg px-3 py-2">
            <div className="text-sm font-semibold truncate">{s.sector}</div>
            <div className="flex justify-between text-xs mt-0.5">
              <span className="text-muted">30d</span><Pct value={s.pchg30d} />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">1y</span><Pct value={s.pchg365d} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Prob({ value }) {
  if (value == null) return <span className="text-muted">—</span>;
  const v = Number(value);
  const hue = v >= 60 ? "text-up" : v <= 40 ? "text-down" : "text-muted";
  return <span className={`font-mono text-sm ${hue}`}>{v.toFixed(0)}%</span>;
}

function ModelBanner({ model }) {
  if (!model) return null;
  const bt = model.backtest || {};
  const w = model.weights || {};
  return (
    <div className="card border border-line bg-panel2">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <div className="card-title mb-0 flex items-center gap-2"><span>Quant Model</span><InfoDot topic="forecast.model" /></div>
          <div className="text-xs text-muted">
            Cross-sectional rank of {model.universe} stocks · weights {Math.round(w.momentum * 100)}/{Math.round(w.trend * 100)}/{Math.round(w.flow * 100)} mom/trend/flow
          </div>
        </div>
        <div className="flex gap-6 text-sm font-mono ml-auto">
          <div title="Spearman rank correlation of model score vs forward 20d return. ~0 means weak predictive edge — shown honestly.">
            <span className="text-muted block text-xs">Mean IC</span>{bt.mean_ic ?? "—"}
          </div>
          <div title="% of top-decile names that beat the universe median over 20 days.">
            <span className="text-muted block text-xs">Top-decile hit</span>{bt.top_decile_hit_rate != null ? `${bt.top_decile_hit_rate}%` : "—"}
          </div>
          <div>
            <span className="text-muted block text-xs">Backtest</span>{bt.sessions_sampled || 0} sessions
          </div>
        </div>
      </div>
      {bt.calibration && (
        <div className="mt-3 pt-3 border-t border-line">
          <div className="text-xs text-muted mb-1">Calibration — realized up-rate by predicted 20d probability bucket:</div>
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            {Object.entries(bt.calibration).map(([bucket, rate]) => (
              <span key={bucket} className="bg-ink border border-line rounded px-2 py-1">
                <span className="text-muted">{bucket}</span> → {rate == null ? "—" : `${rate}%`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelTable({ rows }) {
  if (!rows?.length) return <p className="text-sm text-muted py-6 text-center">No model output.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">Symbol</th>
            <th className="th text-right">Composite</th>
            <th className="th text-right">Up 5d</th>
            <th className="th text-right">Up 20d</th>
            <th className="th text-right hidden md:table-cell">Mom</th>
            <th className="th text-right hidden md:table-cell">Trend</th>
            <th className="th text-right hidden md:table-cell">Flow</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.symbol} className="hover:bg-panel2/50">
              <td className="td"><SymbolLink symbol={e.symbol} name={e.company} /><div className="text-xs text-muted">{e.sector || "—"}</div></td>
              <td className={`td text-right font-mono font-semibold ${e.composite >= 0 ? "text-up" : "text-down"}`}>{e.composite?.toFixed(2)}</td>
              <td className="td text-right"><Prob value={e.up_prob_5d} /></td>
              <td className="td text-right"><Prob value={e.up_prob_20d} /></td>
              <td className="td text-right font-mono text-muted hidden md:table-cell">{e.factor_momentum?.toFixed(1)}</td>
              <td className="td text-right font-mono text-muted hidden md:table-cell">{e.factor_trend?.toFixed(1)}</td>
              <td className="td text-right font-mono text-muted hidden md:table-cell">{e.factor_flow?.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ForecastTable({ rows, kind }) {
  if (!rows?.length) {
    return <p className="text-sm text-muted py-6 text-center">No qualifying {kind} setups today.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">Symbol</th>
            <th className="th text-right">Close</th>
            <th className="th text-right">Chg</th>
            <th className="th">Trend</th>
            <th className="th">Score</th>
            <th className="th">Confidence</th>
            <th className="th hidden lg:table-cell">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const reasons = (kind === "uptrend" ? e.reasons_bull : e.reasons_bear) || [];
            return (
              <tr key={e.symbol} className="hover:bg-panel2/50 align-top">
                <td className="td">
                  <SymbolLink symbol={e.symbol} name={e.company} />
                  <div className="text-xs text-muted">{e.sector || "—"}</div>
                </td>
                <td className="td text-right font-mono">{e.close?.toLocaleString("en-IN")}</td>
                <td className="td text-right"><Pct value={e.pct_change} /></td>
                <td className="td"><TrendBadge label={e.trend_label} /></td>
                <td className="td"><TrendScore value={e.trend_score} /></td>
                <td className="td"><Confidence value={e.confidence} /></td>
                <td className="td hidden lg:table-cell">
                  <ul className="text-xs text-muted space-y-0.5">
                    {reasons.slice(0, 2).map((r, i) => <li key={i}>· {r}</li>)}
                  </ul>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ForecastPage() {
  const d = await getLatest();
  if (!d) {
    return <div className="card text-center py-16 text-muted">No data yet. Run the pipeline first.</div>;
  }
  const fc = d.forecast || {};
  return (
    <div className="space-y-6">
      <PageHeader
        title="Trend Forecast"
        chip="Continuation read"
        meta={
          <>
            <div className="text-sm font-semibold text-white">{d.date}</div>
            <div className="text-xs text-muted">{fc.rated} stocks rated</div>
          </>
        }
      >
        Directional-bias from ~3 months of price, delivery &amp; OI trends — a
        continuation read, not a price target.
      </PageHeader>

      <RegimeBanner regime={d.regime} />
      <SectorRotation sectors={d.index_sectors} />

      {d.model && (
        <>
          <ModelBanner model={d.model} />
          <div className="grid xl:grid-cols-2 gap-6">
            <section className="card min-w-0">
              <h2 className="card-title text-up flex items-center gap-2"><span>Model Top Picks</span><InfoDot topic="forecast.model_picks" /></h2>
              <p className="text-xs text-muted mb-3">Highest composite score across the universe — momentum + trend + flow, vol-adjusted.</p>
              <ModelTable rows={d.model.top_picks} />
            </section>
            <section className="card min-w-0">
              <h2 className="card-title text-down flex items-center gap-2"><span>Model Bottom Ranks</span><InfoDot topic="forecast.model_pans" /></h2>
              <p className="text-xs text-muted mb-3">Lowest composite — weakest relative setups.</p>
              <ModelTable rows={d.model.top_pans} />
            </section>
          </div>
        </>
      )}

      <div className="grid xl:grid-cols-2 gap-6">
        <section className="card min-w-0">
          <h2 className="card-title text-up flex items-center gap-2"><span>Emerging Uptrends</span><InfoDot topic="forecast.uptrends" /></h2>
          <p className="text-xs text-muted mb-3">Strongest upward momentum with clean trends.</p>
          <ForecastTable rows={fc.uptrends} kind="uptrend" />
        </section>
        <section className="card min-w-0">
          <h2 className="card-title text-down flex items-center gap-2"><span>Emerging Downtrends</span><InfoDot topic="forecast.downtrends" /></h2>
          <p className="text-xs text-muted mb-3">Weakest names — falling trend, distribution or short buildup.</p>
          <ForecastTable rows={fc.downtrends} kind="downtrend" />
        </section>
      </div>

      <p className="text-xs text-muted">
        Quantitative observation of order flow and technicals. Not investment advice.
        Confidence reflects trend cleanliness (R²) and signal agreement, not certainty.
      </p>
      <Link href="/" className="link-back">← Back to dashboard</Link>
    </div>
  );
}
