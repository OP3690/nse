"use client";

import StockTip from "./StockTip";
import { RRGChart, IpiChart, QuadrantDonut } from "./charts";
import InfoDot from "./InfoDot";

const cr = (v) =>
  v == null ? "—" : `${v >= 0 ? "+" : "−"}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v}%`);
const ud = (v) => (v >= 0 ? "text-up" : "text-down");

// Tiny dependency-free sparkline for a monthly metric path.
function Spark({ points, color = "#5b8cff", w = 92, h = 26 }) {
  const vals = (points || []).map((p) => p);
  if (vals.length < 2) return <span className="text-muted text-xs">—</span>;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const step = w / (vals.length - 1);
  const pts = vals.map((v, i) => [i * step, h - ((v - lo) / span) * h]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${w},${h} L0,${h} Z`;
  const gid = `sg-${color.replace("#", "")}`;
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color} />
    </svg>
  );
}

function Sym({ s, sector, name }) {
  return (
    <div>
      <StockTip symbol={s} name={name} />
      {sector && <div className="text-[10px] text-muted">{sector}</div>}
    </div>
  );
}

function ScoreBar({ v }) {
  const grad = v >= 80 ? "from-up to-[#0fa968]" : v >= 60 ? "from-accent to-[#3f6fe0]" : "from-muted to-muted";
  const txt = v >= 80 ? "text-up" : v >= 60 ? "text-accent" : "text-muted";
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-2 rounded-full bg-line overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${grad}`} style={{ width: `${v}%` }} />
      </div>
      <span className={`font-mono text-xs font-bold tabular-nums ${txt}`}>{Math.round(v)}</span>
    </div>
  );
}

// Significance chip for a Mann-Kendall p-value.
function Sig({ p }) {
  if (p == null) return null;
  const lvl = p < 0.001 ? "p<.001" : p < 0.01 ? "p<.01" : p < 0.05 ? "p<.05" : "ns";
  const cls = p < 0.05 ? "chip-up" : "chip-muted";
  return <span className={`chip ${cls}`}>{lvl}</span>;
}

function SectionHead({ n, title, children, info }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span className="sec-num">{n}</span>
      <div>
        <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
          <span>{title}</span>
          {info && <InfoDot topic={info} />}
        </h2>
        <p className="text-xs text-muted mt-1 max-w-3xl">{children}</p>
      </div>
    </div>
  );
}

function Kpi({ label, value, valueClass = "text-white", sub, accent }) {
  return (
    <div className="stat-tile animate-rise">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: accent }} />
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-muted truncate">{sub}</div>}
    </div>
  );
}

function Regime({ r }) {
  const sm = r.summary;
  return (
    <section className="panel-elev p-5">
      <SectionHead n="1" title="Institutional Regime — Pressure Index" info="intel.regime">
        An Institutional Pressure Index (−100…+100): reconciled FII cash, DII, and FII index-futures
        nets, each z-scored against their own history and blended. As of {r.as_of}.
      </SectionHead>

      <div className="rounded-xl border border-line bg-gradient-to-r from-panel2 to-panel p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="chip chip-accent text-sm px-3 py-1">{sm.label}</span>
          <span className={`font-mono text-2xl font-bold tabular-nums ${ud(r.ipi_now)}`}>
            IPI {r.ipi_now >= 0 ? "+" : ""}{r.ipi_now}
          </span>
          <div className="flex items-center gap-2 flex-wrap text-xs ml-auto">
            <span className="chip chip-muted">FII cash {cr(sm.fii_cash_3mo)}</span>
            <span className="chip chip-muted">DII {cr(sm.dii_3mo)}</span>
            <span className="chip chip-muted">FII idx-fut {cr(sm.idx_fut_3mo)}</span>
            {sm.fii_dii_corr != null && <span className="chip chip-muted">FII·DII ρ {sm.fii_dii_corr}</span>}
          </div>
        </div>
        <p className="text-sm mt-3 text-white/90">{sm.note}</p>
        {sm.deriv_note && <p className="text-sm text-amber-400 mt-1">{sm.deriv_note}</p>}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <IpiChart data={r.series} />
          <p className="text-xs text-muted mt-1">
            Monthly Institutional Pressure Index. Green = net institutional demand, red = de-risking.
          </p>
        </div>
        <div>
          <div className="card-title mb-2 text-xs">FII F&amp;O positioning ({r.as_of})</div>
          <table className="w-full text-sm">
            <thead>
              <tr><th className="th">Category</th><th className="th text-right">Net</th><th className="th text-right">OI ₹Cr</th></tr>
            </thead>
            <tbody>
              {r.positioning.map((p) => (
                <tr key={p.instrument} className="row-hover">
                  <td className="td">{p.instrument}</td>
                  <td className={`td text-right font-mono ${ud(p.net)}`}>{cr(p.net)}</td>
                  <td className="td text-right font-mono text-muted">{p.oi_amt?.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const QUADS = [
  { key: "Leading", cls: "q-leading", dot: "bg-up", txt: "text-up", note: "strong & strengthening" },
  { key: "Improving", cls: "q-improving", dot: "bg-accent", txt: "text-accent", note: "weak but turning up" },
  { key: "Weakening", cls: "q-weakening", dot: "bg-amber-400", txt: "text-amber-400", note: "strong but fading" },
  { key: "Lagging", cls: "q-lagging", dot: "bg-down", txt: "text-down", note: "weak & weakening" },
];

function Rotation({ rot }) {
  const q = rot.quadrants || {};
  const total = QUADS.reduce((s, { key }) => s + (q[key] || []).length, 0);
  return (
    <section className="panel-elev p-5">
      <SectionHead n="2" title="Sector Rotation — Relative Rotation Graph" info="intel.rotation">
        Each sector by relative strength (RS-Ratio, x) vs its momentum (RS-Momentum, y), from its
        share of delivered value. The 100/100 crossover splits four quadrants; the tail traces ~6
        weeks of travel. Sectors rotate clockwise: Improving → Leading → Weakening → Lagging.
      </SectionHead>
      <div className="grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-line bg-gradient-to-br from-panel2/40 to-ink/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-1 px-1 flex-wrap">
              <span className="text-[11px] text-muted">
                <span className="text-white/70 font-semibold">{total}</span> sectors · ~6-week trails
              </span>
              <span className="flex items-center gap-2.5 text-[10px] font-mono">
                {QUADS.map(({ key, dot }) => (
                  <span key={key} className="flex items-center gap-1 text-muted">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{key}
                  </span>
                ))}
              </span>
            </div>
            <RRGChart points={rot.points} tails={rot.tails} />
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted mt-1">
              <span className="rrg-spin">↻</span> sectors rotate clockwise through the quadrants
            </div>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-3 content-start">
            {QUADS.map(({ key, cls, dot, txt, note }) => {
              const list = q[key] || [];
              return (
                <div key={key} className={`q-card ${cls} transition hover:brightness-110`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className={`text-xs font-bold ${txt}`}>{key}</span>
                    <span className={`text-[10px] font-mono ml-auto px-1.5 py-0.5 rounded-full bg-ink/50 ${txt}`}>{list.length}</span>
                  </div>
                  <div className="text-[10px] text-muted mb-1.5">{note}</div>
                  <div className="text-xs space-y-0.5">
                    {list.length
                      ? list.map((s) => <div key={s} className="truncate text-white/85">{s}</div>)
                      : <span className="text-muted">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl border border-line bg-panel2/30 p-3">
            <div className="text-xs font-bold text-white mb-1 flex items-center gap-2">
              <span>Quadrant Mix</span>
              <span className="text-[10px] text-muted font-normal">sectors per quadrant</span>
            </div>
            <QuadrantDonut quadrants={q} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Accumulation({ rows }) {
  return (
    <section className="panel-elev p-5">
      <SectionHead n="3" title="Sustained Accumulation — model conviction" info="intel.accumulation">
        A cross-sectional multi-factor model. Per stock: OLS + Theil-Sen + Mann-Kendall delivery-trend
        tests, a robust (MAD) level z-score, a delivered-value surge and accumulation/distribution flow —
        winsorized, z-scored across the universe, volatility-penalized, ranked to a 0-100 conviction percentile.
      </SectionHead>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="bg-panel2/40">
              <th className="th rounded-l-lg">#</th>
              <th className="th">Stock</th>
              <th className="th text-right">Conviction</th>
              <th className="th text-right">Up-prob</th>
              <th className="th text-right hidden lg:table-cell">Slope/mo</th>
              <th className="th text-right hidden xl:table-cell">MK z</th>
              <th className="th text-right hidden xl:table-cell">R²</th>
              <th className="th text-right hidden md:table-cell">Delivery %</th>
              <th className="th text-right hidden lg:table-cell">Deliv ₹×</th>
              <th className="th text-right hidden sm:table-cell">Price 6m</th>
              <th className="th text-center rounded-r-lg hidden sm:table-cell">Delivery trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.symbol} className={`row-hover ${i < 3 ? "bg-up/[0.03]" : ""}`}>
                <td className="td text-muted font-mono text-xs">{i + 1}</td>
                <td className="td"><Sym s={s.symbol} sector={s.sector} name={s.company} /></td>
                <td className="td"><ScoreBar v={s.conviction} /></td>
                <td className="td text-right font-mono text-accent">{s.up_prob}%</td>
                <td className="td text-right font-mono text-up hidden lg:table-cell">
                  +{s.slope_pm}<span className="text-muted text-[10px]">pp</span>
                </td>
                <td className="td text-right hidden xl:table-cell">
                  <span className="font-mono text-up mr-1">{s.mk_z >= 0 ? "+" : ""}{s.mk_z}</span><Sig p={s.mk_p} />
                </td>
                <td className="td text-right font-mono text-muted hidden xl:table-cell">{s.r2}</td>
                <td className="td text-right font-mono hidden md:table-cell">
                  <span className="text-muted">{s.base_dlv}→</span>
                  <span className="text-up font-semibold">{s.rec_dlv}</span>
                  <span className="text-up text-xs"> (+{s.dlv_delta})</span>
                </td>
                <td className="td text-right font-mono text-up hidden lg:table-cell">{s.dv_ratio != null ? `${s.dv_ratio}×` : "—"}</td>
                <td className={`td text-right font-mono hidden sm:table-cell ${ud(s.price_chg)}`}>{pct(s.price_chg)}</td>
                <td className="td hidden sm:table-cell">
                  <div className="flex justify-center">
                    <Spark points={(s.series || []).map((p) => p.deliv)} color="#16c784" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// One compact, scroll-free divergence row — no <table>, so it can never force
// horizontal overflow. Symbol + meta on the left, spark + figures on the right.
function DivRow({ s, bull }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-line/30 last:border-0 min-w-0">
      <div className="min-w-0 flex-1">
        <StockTip symbol={s.symbol} name={s.company} />
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {s.sector && <span className="text-[10px] text-muted truncate max-w-[110px]">{s.sector}</span>}
          <span className={`text-[10px] font-mono ${s.px_dlv_corr < 0 ? "text-up" : "text-muted"}`}>
            ρ {s.px_dlv_corr ?? "—"}
          </span>
          <Sig p={s.mk_p} />
        </div>
      </div>
      <div className="hidden sm:flex shrink-0 items-center">
        <Spark points={(s.series || []).map((p) => p.deliv)} color={bull ? "#16c784" : "#ea3943"} />
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className={`font-mono text-sm font-semibold ${ud(s.price_chg)}`}>{pct(s.price_chg)}</div>
        <div className="font-mono text-[11px]">
          <span className="text-muted">{s.base_dlv}→</span>
          <span className={ud(s.dlv_delta)}>{s.rec_dlv}</span>
          <span className={ud(s.dlv_delta)}> ({s.dlv_delta >= 0 ? "+" : ""}{s.dlv_delta})</span>
        </div>
      </div>
    </div>
  );
}

function Divergence({ div }) {
  const List = ({ rows, bull }) => (
    <div className="min-w-0">
      {rows.length
        ? rows.map((s) => <DivRow key={s.symbol} s={s} bull={bull} />)
        : <p className="text-sm text-muted py-6 text-center">None right now.</p>}
    </div>
  );
  return (
    <section className="panel-elev p-5">
      <SectionHead n="4" title="Delivery–Price Divergence" info="intel.divergence">
        Spearman price·delivery correlation plus significance-gated Mann-Kendall trend tests. Quiet
        accumulation = price flat/down while delivery significantly rises (demand soaking up supply
        unnoticed; negative ρ). Weak rally = price ran up but delivery is significantly thinning.
      </SectionHead>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="rounded-xl border border-up/20 bg-up/[0.03] p-4 min-w-0">
          <div className="text-xs text-up font-bold mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-up" /> Quiet accumulation — price soft, delivery rising
          </div>
          <div className="text-[10px] text-muted mb-2">ρ &lt; 0 with a significant up-trend in delivery (demand soaking supply).</div>
          <List rows={div.quiet} bull />
        </div>
        <div className="rounded-xl border border-down/20 bg-down/[0.03] p-4 min-w-0">
          <div className="text-xs text-down font-bold mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-down" /> Weak rally — price up, delivery thinning
          </div>
          <div className="text-[10px] text-muted mb-2">Price advanced while delivery significantly faded — thin conviction.</div>
          <List rows={div.weak} bull={false} />
        </div>
      </div>
    </section>
  );
}

function Overview({ intel }) {
  const r = intel.institutional_regime;
  const top = intel.sustained_accumulation[0];
  const leaders = intel.sector_rotation.quadrants?.Leading || [];
  const lead = intel.sector_rotation.points?.[0];
  const div = intel.divergence;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi
        label="Institutional regime"
        value={`${r.ipi_now >= 0 ? "+" : ""}${r.ipi_now}`}
        valueClass={ud(r.ipi_now)}
        sub={r.summary.label}
        accent="linear-gradient(90deg,#5b8cff,#16c784)"
      />
      <Kpi
        label="Leading sectors"
        value={leaders.length}
        valueClass="text-up"
        sub={lead ? `Top: ${lead.sector}` : "—"}
        accent="linear-gradient(90deg,#16c784,#0fa968)"
      />
      <Kpi
        label="Top conviction pick"
        value={top ? top.symbol : "—"}
        valueClass="text-white"
        sub={top ? `Conviction ${Math.round(top.conviction)} · ${pct(top.price_chg)}` : "—"}
        accent="linear-gradient(90deg,#7aa2ff,#5b8cff)"
      />
      <Kpi
        label="Divergence signals"
        value={`${div.quiet.length} / ${div.weak.length}`}
        valueClass="text-white"
        sub="quiet accum · weak rally"
        accent="linear-gradient(90deg,#16c784,#ea3943)"
      />
    </div>
  );
}

export default function IntelligenceView({ intel }) {
  const w = intel.window;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted">
        <span>
          Window: <span className="text-white/80 font-medium">{w.sessions} sessions</span> ({w.start} → {w.end}),
          recent ~{w.recent_sessions}-session month vs prior baseline
        </span>
        <span className="chip chip-muted">{intel.universe} liquid stocks analyzed</span>
      </div>
      <Overview intel={intel} />
      <Regime r={intel.institutional_regime} />
      <Rotation rot={intel.sector_rotation} />
      <Accumulation rows={intel.sustained_accumulation} />
      <Divergence div={intel.divergence} />
      {intel.method && (
        <div className="rounded-xl border border-line bg-panel2/30 p-4 text-xs text-muted">
          <span className="chip chip-accent mr-2">Method</span> {intel.method}
        </div>
      )}
    </div>
  );
}
