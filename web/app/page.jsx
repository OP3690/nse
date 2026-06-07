import { getLatest, fmtCr } from "./lib/data";
import { Pct, SignalBadge, OiBadge, Stat, BreadthStat, Section, Score, SymbolLink, PageHeader } from "./components/ui";
import { FiiDiiChart } from "./components/charts";
import MoneyFlow from "./components/MoneyFlow";
import MoversBoard from "./components/MoversBoard";

export const dynamic = "force-dynamic";

function NoData() {
  return (
    <div className="card text-center py-16">
      <h1 className="text-xl font-bold mb-2">No data yet</h1>
      <p className="text-muted text-sm">
        Run the pipeline first: <code className="text-accent">cd pipeline && python3 run_daily.py</code>
      </p>
    </div>
  );
}

// Headline index tiles (Nifty 50, Sensex, India VIX) — left-aligned, each a
// vertical stack of label / value / % change, shown under the dashboard title.
function IndexTicker({ items }) {
  if (!items?.length) return null;
  return (
    <div className="flex items-stretch divide-x divide-line rounded-xl border border-line bg-panel2/40 overflow-hidden">
      {items.map((ix) => {
        const up = (ix.pct ?? 0) >= 0;
        // VIX is inverted — a rising VIX is risk-off, so colour it red when up.
        const good = ix.invert ? !up : up;
        const tone = ix.pct == null ? "text-muted" : good ? "text-up" : "text-down";
        const dec = ix.decimals;
        const fmt = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
        return (
          <div key={ix.label} className="flex flex-col gap-0.5 px-4 py-2.5 transition hover:bg-panel2/70">
            <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">{ix.label}</span>
            <span className="font-mono text-base font-bold text-white tabular-nums leading-tight">{fmt(ix.last)}</span>
            <span className={`font-mono text-[11px] font-semibold tabular-nums ${tone}`}>
              {ix.pct == null ? "—" : (
                <>{up ? "▲ +" : "▼ "}{ix.change != null ? fmt(ix.change) : ""} ({up ? "+" : ""}{Number(ix.pct).toFixed(2)}%)</>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// % change vs the previous session, signed. Uses |prev| so the sign reflects
// whether the figure rose or fell even when the value itself is negative
// (e.g. FII net flipping from -2,000 to -8,000 is a deeper outflow → down).
function sessionDelta(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function DeltaChip({ pct }) {
  if (pct == null || !isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span className={`font-mono text-[11px] font-semibold tabular-nums ${up ? "text-up" : "text-down"}`}>
      {up ? "▲ +" : "▼ -"}{Math.abs(pct).toFixed(1)}% vs prev
    </span>
  );
}

const OI_GROUPS = [
  ["long_buildup", "Long Buildup", "Fresh longs — price ↑, OI ↑", "text-up", "bg-up"],
  ["short_covering", "Short Covering", "Price ↑, OI ↓ — shorts exiting", "text-accent", "bg-accent"],
  ["short_buildup", "Short Buildup", "Price ↓, OI ↑ — fresh shorts", "text-down", "bg-down"],
  ["long_unwinding", "Long Unwinding", "Price ↓, OI ↓ — longs exiting", "text-amber-400", "bg-amber-400"],
];

export default async function Dashboard() {
  const d = await getLatest();
  if (!d) return <NoData />;

  const { market: m, fiidii, sectors, top_accumulation, oi_buildup, notable_deals } = d;
  const fii = fiidii?.latest?.fii;
  const dii = fiidii?.latest?.dii;
  const breadth = m.advances + m.declines || 1;
  const advPct = Math.round((m.advances / breadth) * 100);

  // Previous-session figures for the +/- deltas on the headline stat tiles.
  const prevSession = fiidii?.history?.length > 1 ? fiidii.history[fiidii.history.length - 2] : null;
  const fiiDelta = sessionDelta(fii, prevSession?.fii);
  const diiDelta = sessionDelta(dii, prevSession?.dii);
  const turnoverDelta = sessionDelta(m.total_turnover_cr, m.total_turnover_cr_prev);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Money Flow Dashboard"
        chip="Latest session"
        titleAside={d.headline_indices?.length > 0 ? <IndexTicker items={d.headline_indices} /> : null}
        meta={
          <>
            <div className="text-xs font-semibold text-white">{d.date}</div>
            <div className="text-[11px] text-muted">{d.dates.length} sessions tracked</div>
          </>
        }
      >
        Where institutional money moved on the last NSE session.
      </PageHeader>

      {/* top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="FII Net" value={fmtCr(fii)} accent={fii >= 0 ? "text-up" : "text-down"}
          sub={fii >= 0 ? "Foreign buying" : "Foreign selling"} delta={<DeltaChip pct={fiiDelta} />} info="dash.fii" />
        <Stat label="DII Net" value={fmtCr(dii)} accent={dii >= 0 ? "text-up" : "text-down"}
          sub={dii >= 0 ? "Domestic buying" : "Domestic selling"} delta={<DeltaChip pct={diiDelta} />} info="dash.dii" />
        <BreadthStat advances={m.advances} declines={m.declines} unchanged={m.unchanged} info="dash.breadth" />
        <Stat label="Total Turnover" value={fmtCr(m.total_turnover_cr)} sub={`${m.stocks} stocks traded`}
          delta={<DeltaChip pct={turnoverDelta} />} info="dash.turnover" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* FII/DII chart */}
        <div className="lg:col-span-2">
          <Section title="FII / DII Activity (₹ Cr net)" info="dash.fiidii_chart">
            {fiidii.history?.length > 1
              ? <FiiDiiChart data={fiidii.history} />
              : <div className="text-sm text-muted py-10 text-center">
                  History builds as the pipeline runs daily. Today — FII{" "}
                  <span className={fii >= 0 ? "text-up" : "text-down"}>{fmtCr(fii)}</span>, DII{" "}
                  <span className={dii >= 0 ? "text-up" : "text-down"}>{fmtCr(dii)}</span>.
                </div>}
          </Section>
        </div>

        {/* sector rotation */}
        <Section title="Sector Rotation" href="/screener" info="dash.sector_rotation">
          <div className="space-y-2">
            {sectors.slice(0, 8).map((s) => (
              <div key={s.sector} className="flex items-center gap-2">
                <div className="w-28 truncate text-xs" title={s.sector}>{s.sector}</div>
                <div className="flex-1 h-2 rounded bg-line overflow-hidden">
                  <div className={s.avg_pct >= 0 ? "bg-up h-full" : "bg-down h-full"}
                    style={{ width: `${Math.min(100, Math.abs(s.avg_pct) * 12 + 4)}%` }} />
                </div>
                <div className="w-14 text-right text-xs"><Pct value={s.avg_pct} /></div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* top gainers & losers */}
      {d.movers && <MoversBoard movers={d.movers} />}

      {/* money in / money out */}
      {d.money_flow && <MoneyFlow data={d.money_flow} />}

      {/* top accumulation */}
      <Section title="Top Smart-Money Accumulation" href="/screener" action="Open screener →" info="accumulation">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Symbol</th><th className="th">Sector</th>
                <th className="th text-right">Price</th><th className="th text-right">Chg</th>
                <th className="th text-right">Deliv %</th><th className="th text-right">Vol Surge</th>
                <th className="th">OI</th><th className="th">Signal</th><th className="th">Score</th>
              </tr>
            </thead>
            <tbody>
              {top_accumulation.slice(0, 15).map((e) => (
                <tr key={e.symbol} className="hover:bg-panel2/50">
                  <td className="td"><SymbolLink symbol={e.symbol} name={e.company} /></td>
                  <td className="td text-muted text-xs max-w-[140px] truncate">{e.sector || "—"}</td>
                  <td className="td text-right font-mono">{e.close?.toLocaleString("en-IN")}</td>
                  <td className="td text-right"><Pct value={e.pct_change} /></td>
                  <td className="td text-right font-mono">{e.deliv_pct != null ? `${e.deliv_pct.toFixed(0)}%` : "—"}</td>
                  <td className="td text-right font-mono">{e.vol_surge ? `${e.vol_surge.toFixed(1)}×` : "—"}</td>
                  <td className="td"><OiBadge label={e.oi_label} /></td>
                  <td className="td"><SignalBadge signal={e.signal} /></td>
                  <td className="td"><Score value={e.score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* OI buildup */}
      <Section title="Derivatives — Open Interest Buildup" info="oi_buildup"
        desc="How futures positioning shifted on the last session, grouped by price-vs-OI direction.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {OI_GROUPS.map(([key, title, hint, color, dot]) => (
            <div key={key} className="mini-card">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                <span className={`text-sm font-bold ${color}`}>{title}</span>
              </div>
              <div className="text-[11px] text-muted mb-2 mt-0.5">{hint}</div>
              <div className="space-y-1">
                {(oi_buildup[key] || []).slice(0, 6).map((s) => (
                  <div key={s.symbol} className="flex justify-between text-sm">
                    <SymbolLink symbol={s.symbol} name={s.company} />
                    <Pct value={s.pct_change} className="font-mono text-xs" />
                  </div>
                ))}
                {(oi_buildup[key] || []).length === 0 && <div className="text-xs text-muted">—</div>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* notable deals */}
      <Section title="Notable Bulk & Block Deals (buys)" info="deals"
        desc="Largest disclosed institutional buy-side bulk and block trades on the last session.">
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-1">
          {notable_deals.slice(0, 12).map((n, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-sm border-b border-line/40 py-2 row-hover -mx-2 px-2 rounded-lg min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <SymbolLink symbol={n.symbol} name={n.company} />
                <span className="text-muted text-xs truncate">{n.client}</span>
                <span className="chip chip-muted text-[10px]">{n.kind}</span>
              </div>
              <span className="font-mono text-up font-semibold shrink-0">{fmtCr(n.value_cr)}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
