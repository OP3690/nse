"use client";

import { useState, useMemo, Fragment } from "react";
import StockTip from "./StockTip";
import InfoDot from "./InfoDot";

const pctClass = (v) => (v == null ? "text-muted" : v >= 0 ? "text-up" : "text-down");
const fmtPct = (v, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(d)}%`);
const fmtCr = (n) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: n >= 100 ? 0 : 1 })} Cr`;
const fmtNum = (n) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
const fmtVol = (n) => {
  if (n == null) return "—";
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return Number(n).toLocaleString("en-IN");
};
const Sym = ({ s, name }) => <StockTip symbol={s} name={name} />;

function Panel({ title, desc, count, children, action, info }) {
  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
            <span>{title}</span>
            {info && <InfoDot topic={info} />}
          </h2>
          {desc && <p className="text-xs text-muted mt-1 max-w-xl">{desc}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {count != null && <span className="chip chip-muted">{count}</span>}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

const Toggle = ({ opts, value, onChange }) => (
  <div className="flex items-center gap-1 rounded-lg bg-ink/60 p-0.5 border border-line">
    {opts.map(([k, label]) => (
      <button key={k} onClick={() => onChange(k)}
        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${value === k ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>
        {label}
      </button>
    ))}
  </div>
);

// ---- Breadth (Advances/Declines + Stocks Traded) ----
function Breadth({ b }) {
  const total = (b.advances + b.declines + b.unchanged) || 1;
  const advW = (b.advances / total) * 100;
  const uncW = (b.unchanged / total) * 100;
  return (
    <Panel title="Advances / Declines & Stocks Traded" info="pulse.breadth"
      desc="Market-wide breadth across every traded equity on the last session.">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="stat-tile"><div className="stat-label">Advances</div><div className="stat-value text-up">{fmtNum(b.advances)}</div></div>
        <div className="stat-tile"><div className="stat-label">Declines</div><div className="stat-value text-down">{fmtNum(b.declines)}</div></div>
        <div className="stat-tile"><div className="stat-label">Unchanged</div><div className="stat-value text-muted">{fmtNum(b.unchanged)}</div></div>
        <div className="stat-tile"><div className="stat-label">Stocks Traded</div><div className="stat-value text-white">{fmtNum(b.stocks)}</div></div>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-line mb-2">
        <div className="bg-up h-full" style={{ width: `${advW}%` }} />
        <div className="bg-muted/40 h-full" style={{ width: `${uncW}%` }} />
        <div className="bg-down h-full" style={{ width: `${100 - advW - uncW}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span><span className="text-up font-semibold">{Math.round(advW)}%</span> advancing</span>
        <span>Total turnover <span className="text-white font-semibold">{fmtCr(b.total_turnover_cr)}</span></span>
        <span><span className="text-down font-semibold">{Math.round(100 - advW - uncW)}%</span> declining</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 mt-4 pt-4 border-t border-line/60">
        <div>
          <div className="text-xs font-bold text-up mb-1.5">Leading Sectors · {b.sectors_up} up</div>
          {b.top_sectors.map((s) => (
            <div key={s.sector} className="flex justify-between text-sm py-0.5">
              <span className="truncate text-white/90">{s.sector}</span>
              <span className={`font-mono text-xs ${pctClass(s.avg_pct)}`}>{fmtPct(s.avg_pct)}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs font-bold text-down mb-1.5">Lagging Sectors · {b.sectors_down} down</div>
          {b.bottom_sectors.map((s) => (
            <div key={s.sector} className="flex justify-between text-sm py-0.5">
              <span className="truncate text-white/90">{s.sector}</span>
              <span className={`font-mono text-xs ${pctClass(s.avg_pct)}`}>{fmtPct(s.avg_pct)}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ---- Most Active ----
function MostActive({ value, volume }) {
  const [m, setM] = useState("value");
  const rows = m === "value" ? value : volume;
  return (
    <Panel title="Most Active Equities" info="pulse.active"
      desc="The session's heaviest names by traded value or share volume."
      action={<Toggle opts={[["value", "By Value"], ["volume", "By Volume"]]} value={m} onChange={setM} />}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="th">Symbol</th><th className="th text-right hidden sm:table-cell">Price</th><th className="th text-right">Chg</th>
            <th className="th text-right">Turnover</th><th className="th text-right hidden md:table-cell">Volume</th><th className="th text-right hidden sm:table-cell">Deliv %</th>
          </tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.symbol} className="hover:bg-panel2/50">
                <td className="td"><Sym s={e.symbol} name={e.company} /></td>
                <td className="td text-right font-mono hidden sm:table-cell">{fmtNum(e.close)}</td>
                <td className={`td text-right font-mono ${pctClass(e.pct_change)}`}>{fmtPct(e.pct_change)}</td>
                <td className="td text-right font-mono text-accent">{fmtCr(e.turnover_cr)}</td>
                <td className="td text-right font-mono text-muted hidden md:table-cell">{fmtVol(e.volume)}</td>
                <td className="td text-right font-mono text-muted hidden sm:table-cell">{e.deliv_pct != null ? `${e.deliv_pct.toFixed(0)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---- Indices (click a row to reveal its constituents) ----
function BreadthBar({ adv, dec }) {
  const tot = (adv || 0) + (dec || 0) || 1;
  return (
    <div className="flex h-1.5 w-28 rounded-full overflow-hidden bg-line">
      <div className="bg-up" style={{ width: `${(adv / tot) * 100}%` }} />
      <div className="bg-down" style={{ width: `${(dec / tot) * 100}%` }} />
    </div>
  );
}

function IndexConstituents({ m, name }) {
  const [sort, setSort] = useState("pct"); // pct | turnover | score
  const stocks = useMemo(() => {
    const s = [...(m.stocks || [])];
    if (sort === "pct") s.sort((a, b) => (b.pct_change ?? -1e9) - (a.pct_change ?? -1e9));
    else if (sort === "turnover") s.sort((a, b) => (b.turnover_cr ?? 0) - (a.turnover_cr ?? 0));
    else s.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return s;
  }, [m.stocks, sort]);

  const gainers = (m.stocks || []).filter((s) => (s.pct_change ?? 0) > 0)
    .sort((a, b) => b.pct_change - a.pct_change);
  const losers = (m.stocks || []).filter((s) => (s.pct_change ?? 0) < 0)
    .sort((a, b) => a.pct_change - b.pct_change);
  const lead = gainers[0], drag = losers[0];

  return (
    <div className="rounded-xl border border-line bg-ink/40 p-3.5 mt-1">
      {/* insight header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 text-xs">
          <BreadthBar adv={m.advances} dec={m.declines} />
          <span className="text-up font-mono">{m.advances}▲</span>
          <span className="text-down font-mono">{m.declines}▼</span>
          {m.avg_pct != null && (
            <span className={`font-mono ${pctClass(m.avg_pct)}`}>avg {fmtPct(m.avg_pct)}</span>
          )}
          <span className="text-muted">{m.traded}/{m.count} traded</span>
        </div>
        <div className="flex rounded-md border border-line overflow-hidden">
          {[["pct", "Move"], ["turnover", "Turnover"], ["score", "Score"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setSort(k)}
              className={`text-[11px] px-2 py-0.5 transition ${sort === k ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {(lead || drag) && (
        <div className="text-[11px] text-muted mb-3">
          {lead && <>Led by <span className="text-white font-semibold">{lead.symbol}</span> <span className="text-up">{fmtPct(lead.pct_change)}</span></>}
          {lead && drag && " · "}
          {drag && <>dragged by <span className="text-white font-semibold">{drag.symbol}</span> <span className="text-down">{fmtPct(drag.pct_change)}</span></>}
        </div>
      )}

      {/* constituent grid */}
      <div className="max-h-72 overflow-y-auto pr-1">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
          {stocks.map((s) => (
            <div key={s.symbol} className="flex items-center justify-between text-sm row-hover -mx-1.5 px-1.5 py-1 rounded-lg">
              <div className="min-w-0 flex items-center gap-1.5">
                <Sym s={s.symbol} name={s.company} />
                {s.score != null && s.score >= 70 && <span className="w-1.5 h-1.5 rounded-full bg-up" title="High smart-money score" />}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-[11px] text-muted">₹{s.close != null ? Number(s.close).toLocaleString("en-IN") : "—"}</span>
                <span className={`font-mono text-xs w-16 text-right ${pctClass(s.pct_change)}`}>{fmtPct(s.pct_change)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {m.count > (m.stocks || []).length && (
        <div className="text-[11px] text-muted/70 mt-2">Showing the {(m.stocks || []).length} most-traded of {m.count} constituents.</div>
      )}
    </div>
  );
}

function Indices({ idx }) {
  const [m, setM] = useState("broad");
  const [open, setOpen] = useState(null);
  const rows = m === "broad" ? idx.broad : idx.sector;
  return (
    <Panel title="Index Performances" info="pulse.indices"
      desc="Broad-market and sectoral NIFTY indices, with 30-day and 1-year context. Click an index to see the stocks behind the move."
      action={
        <div className="flex items-center gap-2">
          {idx.vix && (
            <span className="chip chip-amber text-[11px]">VIX {Number(idx.vix.last).toFixed(2)} <span className={pctClass(idx.vix.pct)}>{fmtPct(idx.vix.pct)}</span></span>
          )}
          <Toggle opts={[["broad", "Broad"], ["sector", "Sector"]]} value={m}
            onChange={(v) => { setM(v); setOpen(null); }} />
        </div>
      }>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="th w-6"></th>
            <th className="th">Index</th><th className="th text-right hidden sm:table-cell">Last</th><th className="th text-right">Day</th>
            <th className="th text-right hidden md:table-cell">30D</th><th className="th text-right">1Y</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const expandable = !!r.members;
              const isOpen = open === r.index;
              return (
                <Fragment key={r.index}>
                  <tr onClick={() => expandable && setOpen(isOpen ? null : r.index)}
                    className={`${expandable ? "cursor-pointer" : ""} hover:bg-panel2/50 ${isOpen ? "bg-panel2/60" : ""}`}>
                    <td className="td text-center text-muted">
                      {expandable && <span className={`inline-block transition-transform ${isOpen ? "rotate-90 text-accent" : ""}`}>›</span>}
                    </td>
                    <td className="td font-semibold text-white/90">{r.index}</td>
                    <td className="td text-right font-mono hidden sm:table-cell">{r.last != null ? Number(r.last).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}</td>
                    <td className={`td text-right font-mono font-semibold ${pctClass(r.pct)}`}>{fmtPct(r.pct)}</td>
                    <td className={`td text-right font-mono text-xs hidden md:table-cell ${pctClass(r.pchg30d)}`}>{fmtPct(r.pchg30d, 1)}</td>
                    <td className={`td text-right font-mono text-xs ${pctClass(r.pchg365d)}`}>{fmtPct(r.pchg365d, 1)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="px-3 pb-3 pt-0">
                        <IndexConstituents m={r.members} name={r.index} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---- Band Hitters ----
function BandList({ rows, up }) {
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.symbol} className="flex items-center justify-between text-sm row-hover -mx-1.5 px-1.5 py-1 rounded-lg">
          <div className="flex items-center gap-2">
            <Sym s={r.symbol} name={r.company} />
            {r.locked && <span className="chip chip-muted text-[9px] uppercase tracking-wide">locked</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted">{fmtCr(r.turnover_cr)}</span>
            <span className={`font-mono text-xs w-16 text-right ${up ? "text-up" : "text-down"}`}>{fmtPct(r.pct_change)}</span>
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="text-xs text-muted py-2">None.</div>}
    </div>
  );
}
function BandHitters({ b }) {
  return (
    <Panel title="Price Band Hitters" info="pulse.band"
      desc="Stocks locked at, or pinned within, their daily circuit limit — supply/demand at an extreme.">
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
        <div>
          <div className="text-sm font-bold text-up mb-2">Upper Circuit · {b.upper_count}</div>
          <BandList rows={b.upper} up />
        </div>
        <div>
          <div className="text-sm font-bold text-down mb-2">Lower Circuit · {b.lower_count}</div>
          <BandList rows={b.lower} up={false} />
        </div>
      </div>
    </Panel>
  );
}

// ---- Volume Gainers ----
function VolumeGainers({ rows }) {
  return (
    <Panel title="Volume Gainers" info="pulse.volume"
      desc="Biggest jumps in traded volume versus each stock's recent average — unusual activity."
      count={rows.length}>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1">
        {rows.map((e) => (
          <div key={e.symbol} className="flex items-center justify-between text-sm border-b border-line/40 py-1.5">
            <Sym s={e.symbol} name={e.company} />
            <div className="flex items-center gap-3">
              <span className={`font-mono text-xs ${pctClass(e.pct_change)}`}>{fmtPct(e.pct_change)}</span>
              <span className="chip chip-accent text-[11px]">{e.vol_surge ? `${e.vol_surge.toFixed(1)}×` : "—"}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---- 52-week High/Low ----
function Wk52List({ rows, high }) {
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.symbol} className="flex items-center justify-between text-sm row-hover -mx-1.5 px-1.5 py-1 rounded-lg">
          <div className="flex items-center gap-2">
            <Sym s={r.symbol} name={r.company} />
            {r.new && <span className={`chip text-[9px] uppercase ${high ? "chip-up" : "chip-down"}`}>new</span>}
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-muted">{high ? `52wH ${fmtNum(r.wk_high)}` : `52wL ${fmtNum(r.wk_low)}`}</span>
            <span className={`w-14 text-right ${high ? "text-up" : "text-down"}`}>
              {high ? fmtPct(r.from_high) : fmtPct(r.from_low)}
            </span>
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="text-xs text-muted py-2">None.</div>}
    </div>
  );
}
function Wk52({ w }) {
  return (
    <Panel title="New 52-Week Highs / Lows" info="pulse.wk52"
      desc="Stocks at or within ~1% of their one-year extreme. “new” = printed a fresh high/low.">
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
        <div>
          <div className="text-sm font-bold text-up mb-2">Near 52-Week High · {w.high_count}</div>
          <Wk52List rows={w.high} high />
        </div>
        <div>
          <div className="text-sm font-bold text-down mb-2">Near 52-Week Low · {w.low_count}</div>
          <Wk52List rows={w.low} high={false} />
        </div>
      </div>
    </Panel>
  );
}

// ---- Large-Deal Flow by Stock ----
// Roll the raw bulk/block rows up per symbol into a buy-vs-sell value split, so
// you can see at a glance which names saw large money *accumulating* (buy-heavy),
// *distributing* (sell-heavy), or just an ownership *crossing* (≈50/50 block).
function LargeDealFlow({ rows }) {
  const { stocks, tot } = useMemo(() => {
    const m = new Map();
    let buyAll = 0, sellAll = 0;
    for (const r of rows || []) {
      const v = Number(r.value_cr) || 0;
      const key = r.symbol;
      if (!m.has(key)) m.set(key, { symbol: r.symbol, company: r.company, buy: 0, sell: 0, deals: 0 });
      const s = m.get(key);
      s.deals += 1;
      if (r.side === "BUY") { s.buy += v; buyAll += v; }
      else { s.sell += v; sellAll += v; }
    }
    const stocks = [...m.values()]
      .map((s) => {
        const total = s.buy + s.sell;
        return { ...s, total, buyPct: total ? (s.buy / total) * 100 : 0, net: s.buy - s.sell };
      })
      .sort((a, b) => b.total - a.total);
    return { stocks, tot: { buy: buyAll, sell: sellAll, total: buyAll + sellAll } };
  }, [rows]);

  if (!stocks.length) return null;

  const overallBuyPct = tot.total ? (tot.buy / tot.total) * 100 : 0;
  const tilt = (p) => (p >= 60 ? { label: "Accumulated", cls: "chip-up" } : p <= 40 ? { label: "Distributed", cls: "chip-down" } : { label: "Crossed", cls: "chip-muted" });

  return (
    <Panel title="Large-Deal Flow by Stock" info="pulse.deals"
      desc="Disclosed bulk & block value per stock, split into buy vs sell — who was accumulating, distributing, or just crossing a block."
      count={stocks.length}>
      {/* session-wide buy/sell split */}
      <div className="mb-4 rounded-xl border border-line bg-panel2/40 p-3">
        <div className="flex items-center justify-between text-[11px] font-semibold mb-1.5">
          <span className="text-up">Buy {fmtCr(tot.buy)} · {overallBuyPct.toFixed(0)}%</span>
          <span className="text-muted">All large deals · {fmtCr(tot.total)}</span>
          <span className="text-down">{(100 - overallBuyPct).toFixed(0)}% · {fmtCr(tot.sell)} Sell</span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-down/25">
          <span className="bg-up/80" style={{ width: `${overallBuyPct}%` }} />
        </div>
      </div>

      <div className="space-y-2.5">
        {stocks.map((s) => {
          const t = tilt(s.buyPct);
          return (
            <div key={s.symbol} className="flex items-center gap-3">
              <div className="w-28 sm:w-36 shrink-0 min-w-0">
                <Sym s={s.symbol} name={s.company} />
                <div className="text-[10px] text-muted truncate">{s.deals} deal{s.deals > 1 ? "s" : ""} · {fmtCr(s.total)}</div>
              </div>
              {/* buy / sell split bar */}
              <div className="flex-1 min-w-0">
                <div className="flex h-3 overflow-hidden rounded bg-down/20"
                  title={`Buy ${fmtCr(s.buy)} (${s.buyPct.toFixed(0)}%) · Sell ${fmtCr(s.sell)} (${(100 - s.buyPct).toFixed(0)}%)`}>
                  {s.buy > 0 && <span className="bg-gradient-to-r from-up/70 to-up" style={{ width: `${s.buyPct}%` }} />}
                  {s.sell > 0 && <span className="bg-gradient-to-l from-down/70 to-down" style={{ width: `${100 - s.buyPct}%` }} />}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] font-semibold tabular-nums">
                  <span className="text-up">{s.buyPct.toFixed(0)}% buy</span>
                  <span className="text-down">{(100 - s.buyPct).toFixed(0)}% sell</span>
                </div>
              </div>
              <span className={`chip ${t.cls} shrink-0 hidden sm:inline-flex`}>{t.label}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-muted/80 leading-snug">
        Block deals are usually crossed (a matched buyer &amp; seller ≈ 50/50 — an ownership change, not directional demand).
        A lopsided split points to genuine one-sided bulk buying or selling.
      </p>
    </Panel>
  );
}

// ---- Large Deals ----
function LargeDeals({ rows }) {
  return (
    <Panel title="Large Deals" info="pulse.deals"
      desc="Largest disclosed bulk and block trades on the latest reported session."
      count={rows.length}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="th">Symbol</th><th className="th hidden lg:table-cell">Client</th><th className="th">Side</th>
            <th className="th text-right hidden md:table-cell">Qty</th><th className="th text-right hidden md:table-cell">Price</th><th className="th text-right">Value</th><th className="th hidden sm:table-cell">Type</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-panel2/50">
                <td className="td"><Sym s={r.symbol} name={r.company} /></td>
                <td className="td text-muted text-xs max-w-[220px] truncate hidden lg:table-cell" title={r.client}>{r.client}</td>
                <td className="td"><span className={`badge ${r.side === "BUY" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{r.side}</span></td>
                <td className="td text-right font-mono text-xs hidden md:table-cell">{fmtNum(r.qty)}</td>
                <td className="td text-right font-mono text-xs hidden md:table-cell">{fmtNum(r.price)}</td>
                <td className="td text-right font-mono font-semibold text-accent">{fmtCr(r.value_cr)}</td>
                <td className="td hidden sm:table-cell"><span className="chip chip-muted text-[10px]">{r.kind}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function PulseView({ pulse }) {
  const p = pulse;
  return (
    <div className="space-y-6">
      <Breadth b={p.breadth} />
      <MostActive value={p.most_active_value} volume={p.most_active_volume} />
      <Indices idx={p.indices} />
      <div className="grid lg:grid-cols-2 gap-6">
        <BandHitters b={p.band_hitters} />
        <Wk52 w={p.wk52} />
      </div>
      <VolumeGainers rows={p.volume_gainers} />
      <LargeDealFlow rows={p.large_deals} />
      <LargeDeals rows={p.large_deals} />
    </div>
  );
}
