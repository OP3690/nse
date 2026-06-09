import { getLatest, fmtCr } from "./lib/data";
import { Pct, SignalBadge, OiBadge, Stat, BreadthStat, Section, Score, SymbolLink, PageHeader } from "./components/ui";
import { FiiDiiChart } from "./components/charts";
import MoneyFlow from "./components/MoneyFlow";
import MoversBoard from "./components/MoversBoard";
import MarketBrief from "./components/MarketBrief";
import EarningsRadar from "./components/EarningsRadar";
import IndexTicker from "./components/IndexTicker";

export const dynamic = "force-dynamic";

// When the pipeline last ran (the data's true freshness vs the EOD session date).
// generated_at is a local-time ISO string like "2026-06-09T07:51:39".
function fmtSynced(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

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

// Quantitative flow analytics over the daily FII/DII history: streaks, 10-session
// hit-rates, 5/20-day net momentum, and a normalised institutional-pressure score
// (z-score of the latest 5-day rolling combined net vs its own history, ±100).
function flowAnalytics(history) {
  if (!history?.length) return {};
  const fii = history.map((h) => h.fii || 0);
  const dii = history.map((h) => h.dii || 0);
  const combined = history.map((h, i) => fii[i] + dii[i]);
  const n = history.length;
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const streak = (arr, sign) => {
    let c = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] !== 0 && Math.sign(arr[i]) === sign) c++; else break;
    }
    return c;
  };
  const lastFiiSign = Math.sign(fii[n - 1]);
  const lastDiiSign = Math.sign(dii[n - 1]);
  const last10 = (a) => a.slice(-10);
  const fiiBuy10 = last10(fii).filter((v) => v > 0).length;
  const diiBuy10 = last10(dii).filter((v) => v > 0).length;
  const net5 = sum(combined.slice(-5));
  const net20 = sum(combined.slice(-20));

  // 5-day rolling-mean z-score → institutional pressure (−100 distribution … +100 accumulation)
  const roll = [];
  for (let i = 4; i < combined.length; i++) {
    roll.push(sum(combined.slice(i - 4, i + 1)) / 5);
  }
  let pressure = 0;
  if (roll.length > 1) {
    const mu = sum(roll) / roll.length;
    const sd = Math.sqrt(sum(roll.map((x) => (x - mu) ** 2)) / roll.length) || 1;
    pressure = Math.max(-100, Math.min(100, Math.round(((roll[roll.length - 1] - mu) / sd) * 50)));
  }
  return {
    fiiStreak: streak(fii, lastFiiSign), diiStreak: streak(dii, lastDiiSign),
    lastFiiSign, lastDiiSign, fiiBuy10, diiBuy10, net5, net20, pressure,
    sessions: Math.min(10, n),
  };
}

// Auto-generate a plain-English read of the session from the live numbers, for
// the Institutional Flow Brief. Each item drives one row {tone, icon, head, body}.
function buildBrief({ fii, dii, m, advPct, sectors, top_accumulation, analytics }) {
  const items = [];
  const cr = (v) => (v == null ? "—" : `₹${Math.abs(Math.round(v)).toLocaleString("en-IN")} Cr`);
  const a = analytics || {};

  // 1) Institutional stance — the FII vs DII tug-of-war + recent persistence.
  if (fii != null && dii != null) {
    const fW = fii >= 0 ? "bought" : "sold";
    const dW = dii >= 0 ? "bought" : "sold";
    let tone = "muted", body = "";
    if (fii < 0 && dii > 0) {
      tone = "amber";
      body = "Domestic institutions are cushioning the foreign outflow — a classic FII-out / DII-in standoff.";
    } else if (fii > 0 && dii < 0) {
      tone = "accent";
      body = "Foreign money is leading while domestics book profits into the strength.";
    } else if (fii >= 0 && dii >= 0) {
      tone = "up";
      body = "Both camps are net buyers — broad institutional demand on the session.";
    } else {
      tone = "down";
      body = "Both foreign and domestic desks were net sellers — institutions de-risking together.";
    }
    if (a.fiiStreak >= 2) {
      body += ` FII on a ${a.fiiStreak}-session ${a.lastFiiSign < 0 ? "selling" : "buying"} streak`;
      body += a.diiStreak >= 2 ? `, DII ${a.diiStreak}-session ${a.lastDiiSign < 0 ? "selling" : "buying"} run.` : ".";
    }
    items.push({
      tone, icon: "flow", head: `FII ${fW} ${cr(fii)}, DII ${dW} ${cr(dii)}`, body,
      chips: a.sessions
        ? [
            { label: `FII buys ${a.fiiBuy10}/${a.sessions}`, tone: a.fiiBuy10 >= a.sessions / 2 ? "up" : "down" },
            { label: `DII buys ${a.diiBuy10}/${a.sessions}`, tone: a.diiBuy10 >= a.sessions / 2 ? "accent" : "amber" },
          ]
        : null,
    });
  }

  // 2) Market breadth.
  if (advPct != null) {
    const tone = advPct >= 55 ? "up" : advPct >= 45 ? "amber" : "down";
    const read = advPct >= 55 ? "healthy participation" : advPct >= 45 ? "a mixed tape" : "weak, narrow breadth";
    items.push({
      tone, icon: "breadth", head: `${advPct}% of stocks advanced`,
      body: `${m.advances?.toLocaleString("en-IN")} up vs ${m.declines?.toLocaleString("en-IN")} down — ${read}.`,
    });
  }

  // 3) Sector leadership.
  if (sectors?.length) {
    const sorted = [...sectors].sort((a, b) => (b.avg_pct ?? 0) - (a.avg_pct ?? 0));
    const top = sorted[0], bot = sorted[sorted.length - 1];
    if (top && bot && top.sector !== bot.sector) {
      items.push({
        tone: "accent", icon: "sector", head: `${top.sector} led, ${bot.sector} lagged`,
        body: `${top.sector} ${top.avg_pct >= 0 ? "+" : ""}${top.avg_pct?.toFixed(2)}% vs ${bot.sector} ${bot.avg_pct?.toFixed(2)}% — where money rotated today.`,
      });
    }
  }

  // 4) Smart-money accumulation screen.
  if (top_accumulation?.length) {
    const t = top_accumulation[0];
    items.push({
      tone: "up", icon: "star", head: `${t.symbol} tops the accumulation screen`,
      body: `Score ${t.score} · ${top_accumulation.length} names flag smart-money accumulation on delivery & volume today.`,
    });
  }

  return items;
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

  const analytics = flowAnalytics(fiidii?.history || []);
  const brief = buildBrief({ fii, dii, m, advPct, sectors, top_accumulation, analytics });

  return (
    <div className="space-y-6">
      <PageHeader
        title="NSE Money Flow"
        chip="Latest session"
        titleAside={d.headline_indices?.length > 0 ? <IndexTicker initial={d.headline_indices} /> : null}
        meta={
          <>
            <div className="text-xs font-semibold text-white flex items-center gap-2 flex-wrap">
              <span>{d.date}</span>
              {fmtSynced(d.generated_at) && (
                <span className="inline-flex items-center gap-1 rounded-md bg-up/15 text-up px-1.5 py-0.5 font-medium ring-1 ring-up/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-up animate-pulse" />
                  Synced {fmtSynced(d.generated_at)}
                </span>
              )}
            </div>
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

      {/* auto-generated session brief + cumulative institutional flow trend */}
      {fiidii?.history?.length > 1 && brief.length > 0 && (
        <MarketBrief history={fiidii.history} brief={brief} asOf={d.date}
          pressure={analytics.pressure} net5={analytics.net5} net20={analytics.net20} />
      )}

      {/* corporate-events radar (upcoming + recent verdicts) */}
      {d.corp && <EarningsRadar corp={d.corp} />}

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
        <Section title="Sector Rotation" href="/sectors" info="dash.sector_rotation">
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
