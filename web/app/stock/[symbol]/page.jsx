import Link from "next/link";
import { getStock, fmtCr } from "../../lib/data";
import { Pct, SignalBadge, OiBadge, Score, Stat, TrendBadge, TrendScore, Confidence } from "../../components/ui";
import { PriceDeliveryChart, OiChart } from "../../components/charts";
import StockTechnicals from "../../components/StockTechnicals";
import ShareholdingFlow from "../../components/ShareholdingFlow";
import InfoDot from "../../components/InfoDot";

export const dynamic = "force-dynamic";

// 52-week range bar: low → high with a marker at the current price.
function Wk52Range({ high, low, close, pos }) {
  if (high == null || low == null || close == null || high <= low) return null;
  const p = pos != null ? pos : ((close - low) / (high - low)) * 100;
  const clamped = Math.max(0, Math.min(100, p));
  const fromHigh = ((close - high) / high) * 100;
  const fromLow = ((close - low) / low) * 100;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-muted inline-flex items-center gap-1.5">52W Low <span className="font-mono text-down">₹{low.toLocaleString("en-IN")}</span><InfoDot topic="stock.wk52" /></span>
        <span className="text-muted"><span className="font-mono text-up">₹{high.toLocaleString("en-IN")}</span> 52W High</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-down/50 via-line to-up/50">
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-accent shadow-md"
          style={{ left: `${clamped}%` }} title={`₹${close.toLocaleString("en-IN")}`} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted mt-1.5">
        <span className="text-up">+{fromLow.toFixed(1)}% from low</span>
        <span>{clamped.toFixed(0)}% of range</span>
        <span className="text-down">{fromHigh.toFixed(1)}% from high</span>
      </div>
    </div>
  );
}

export default async function StockPage({ params }) {
  const symbol = decodeURIComponent(params.symbol);
  const d = await getStock(symbol);
  if (!d) {
    return (
      <div className="card text-center py-16">
        <h1 className="text-xl font-bold mb-2">{symbol}</h1>
        <p className="text-muted text-sm">No history for this symbol (illiquid or outside the tracked set).</p>
        <Link href="/screener" className="text-accent text-sm">← Back to screener</Link>
      </div>
    );
  }

  const m = d.meta || {};
  const f = d.forecast;
  const hist = d.history.map((h) => ({ ...h, deliv: h.deliv }));
  const last = hist[hist.length - 1] || {};
  const avgDeliv = (() => {
    const xs = hist.map((h) => h.deliv).filter((x) => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  })();

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-panel2 via-panel to-ink p-6">
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight text-white">{d.symbol}</h1>
              {m.signal && <SignalBadge signal={m.signal} />}
              {m.oi_label && <OiBadge label={m.oi_label} />}
            </div>
            {m.company && <p className="text-white/90 text-base font-medium mt-1">{m.company}</p>}
            <p className="text-muted text-sm mt-0.5">{m.sector || "Sector: n/a"}</p>
          </div>
          <div className="text-right min-w-[240px]">
            <div className="text-xs text-muted uppercase tracking-wide">Current Price</div>
            <div className="text-3xl font-bold font-mono tabular-nums text-white">₹{m.close?.toLocaleString("en-IN")}</div>
            <div className="text-sm"><Pct value={m.pct_change} /></div>
            <Wk52Range high={m.wk_high} low={m.wk_low} close={m.close} pos={m.wk52_pos} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Smart-Money Score" value={<Score value={m.score} />} />
        <Stat label="Delivery %" value={m.deliv_pct != null ? `${m.deliv_pct.toFixed(1)}%` : "—"}
          sub={avgDeliv ? `20d avg ${avgDeliv.toFixed(1)}%` : null} />
        <Stat label="Volume Surge" value={m.vol_surge ? `${m.vol_surge.toFixed(2)}×` : "—"}
          sub="vs 20-day average" />
        <Stat label="Turnover" value={fmtCr(m.turnover_cr)}
          sub={m.inst_net_cr != null ? `Inst net ${m.inst_net_cr > 0 ? "+" : ""}${m.inst_net_cr} Cr` : null} />
      </div>

      {m.composite != null && (
        <section className="card border border-line bg-panel2">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <h2 className="card-title mb-0 flex items-center gap-2"><span>Quant Model</span><InfoDot topic="stock.quant_model" /></h2>
            <div className="flex gap-6 text-sm font-mono flex-wrap">
              <div title="Cross-sectional composite z-score vs the whole universe.">
                <span className="text-muted block text-xs">Composite</span>
                <span className={m.composite >= 0 ? "text-up" : "text-down"}>{m.composite.toFixed(2)}</span>
              </div>
              <div><span className="text-muted block text-xs">Up prob 5d</span>
                <span className={m.up_prob_5d >= 50 ? "text-up" : "text-down"}>{m.up_prob_5d}%</span></div>
              <div><span className="text-muted block text-xs">Up prob 20d</span>
                <span className={m.up_prob_20d >= 50 ? "text-up" : "text-down"}>{m.up_prob_20d}%</span></div>
              <div><span className="text-muted block text-xs">Momentum</span>{m.factor_momentum}</div>
              <div><span className="text-muted block text-xs">Trend</span>{m.factor_trend}</div>
              <div><span className="text-muted block text-xs">Flow</span>{m.factor_flow}</div>
              {m.vol_20 != null && <div><span className="text-muted block text-xs">Daily vol</span>{m.vol_20}%</div>}
              {m.mdd_60 != null && <div><span className="text-muted block text-xs">Max DD 60d</span><span className="text-down">{m.mdd_60}%</span></div>}
            </div>
          </div>
          <p className="text-xs text-muted mt-2">
            Probabilities are calibrated to a cross-sectional logistic — relative ranking, not certainty.
          </p>
        </section>
      )}

      {f && (
        <section className="card border border-line">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-3">
            <div className="flex items-center gap-3">
              <h2 className="card-title mb-0 flex items-center gap-2"><span>Trend Forecast</span><InfoDot topic="stock.trend_forecast" /></h2>
              <TrendBadge label={f.trend_label} />
            </div>
            <div className="flex items-center gap-2"><span className="text-xs text-muted">Score</span><TrendScore value={f.trend_score} /></div>
            <div className="flex items-center gap-2"><span className="text-xs text-muted">Confidence</span><Confidence value={f.confidence} /></div>
            {f.rsi != null && <div className="text-sm font-mono"><span className="text-muted">RSI </span>{f.rsi}</div>}
            {f.wk52_pos != null && <div className="text-sm font-mono"><span className="text-muted">52w pos </span>{f.wk52_pos}%</div>}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="card-title text-up">Bullish factors</div>
              <ul className="text-sm text-muted space-y-1 mt-1">
                {(f.reasons_bull || []).map((r, i) => <li key={i}>· {r}</li>)}
                {!(f.reasons_bull || []).length && <li className="text-muted/60">None</li>}
              </ul>
            </div>
            <div>
              <div className="card-title text-down">Bearish factors</div>
              <ul className="text-sm text-muted space-y-1 mt-1">
                {(f.reasons_bear || []).map((r, i) => <li key={i}>· {r}</li>)}
                {!(f.reasons_bear || []).length && <li className="text-muted/60">None</li>}
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted mt-3">
            Continuation probability from price/delivery/OI trends — not a price target.
          </p>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card">
          <h2 className="card-title flex items-center gap-2"><span>Price vs Delivery %</span><InfoDot topic="stock.price_delivery" /></h2>
          <PriceDeliveryChart data={hist} trendline={d.trendline} />
          <p className="text-xs text-muted mt-2">
            Rising price on rising delivery % = real accumulation. The dashed line is the 60-day regression trend.
          </p>
        </section>
        <section className="card">
          <h2 className="card-title flex items-center gap-2"><span>Futures Open Interest</span><InfoDot topic="stock.oi" /></h2>
          <OiChart data={hist} />
          <p className="text-xs text-muted mt-2">
            OI rising with price = fresh longs. OI falling with price rising = short covering.
          </p>
        </section>
      </div>

      {d.shareholding && d.shareholding.categories && (
        <ShareholdingFlow data={d.shareholding} />
      )}

      <section className="card">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="card-title mb-0 flex items-center gap-2"><span>Technical Analysis</span><InfoDot topic="stock.technical" /></h2>
          <span className="text-xs text-muted">{hist.length} sessions</span>
        </div>
        <StockTechnicals data={hist} />
        <p className="text-xs text-muted mt-3">
          Close with 20/50-day moving averages and Bollinger Bands (20, 2σ); volume shaded by day
          direction; RSI(14) below — above 70 overbought, below 30 oversold. Indicators are
          computed from end-of-day prices, not investment advice.
        </p>
      </section>

      <Link href="/screener" className="link-back">← Back to screener</Link>
    </div>
  );
}
