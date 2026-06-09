"use client";

import { useMemo, useState } from "react";
import InfoDot from "./InfoDot";
import { SymbolLink } from "./ui";
import { SectorScatter } from "./charts";

const UP = "22 199 132"; // #16c784
const DOWN = "234 57 67"; // #ea3943

// timeframe → [sector aggregate key, per-stock return key, label]
const TIMEFRAMES = [
  ["1m", "r1m", "ret_1m", "1M"],
  ["3m", "r3m", "ret_3m", "3M"],
  ["6m", "r6m", "ret_6m", "6M"],
  ["1y", "r1y", "ret_1y", "1Y"],
];

const PHASES = {
  Leading: { tone: "text-up", dot: UP, note: "Strong on both 1M & 3M vs market" },
  Improving: { tone: "text-accent", dot: "91 140 255", note: "1M turning up, 3M still soft" },
  Weakening: { tone: "text-amber-500", dot: "240 160 32", note: "3M strong but 1M fading" },
  Lagging: { tone: "text-down", dot: DOWN, note: "Behind market on both horizons" },
};

const fmtPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`);
const fmtCr = (v) =>
  v == null ? "—" : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)}L Cr` : `₹${Math.round(v).toLocaleString("en-IN")} Cr`;
const fmtFlow = (v) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}₹${Math.abs(v).toFixed(0)} Cr`);

// Diverging green↔red wash scaled to the strongest absolute move on screen.
function heat(v, scale, floor = 0.06, ceil = 0.46) {
  if (v == null) return "transparent";
  const a = Math.min(1, Math.abs(v) / (scale || 1)) * (ceil - floor) + floor;
  return `rgb(${v >= 0 ? UP : DOWN} / ${a.toFixed(3)})`;
}

function toneCls(v) {
  if (v == null) return "text-muted";
  return v >= 0 ? "text-up" : "text-down";
}

function Segmented({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel2/40 p-0.5">
      {TIMEFRAMES.map(([key, , , label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
            value === key ? "bg-accent/20 text-white ring-1 ring-inset ring-accent/40" : "text-muted hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MiniStat({ label, value, sub, tone }) {
  return (
    <div className="rounded-lg border border-line bg-panel2/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted font-semibold">{label}</div>
      <div className={`text-lg font-bold font-mono tabular-nums leading-tight ${tone || "text-white"}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export default function SectorsView({ analytics, stocks }) {
  const [tf, setTf] = useState("1m");
  const sectors = analytics?.sectors || [];
  const market = analytics?.market || {};

  const [secKey, retKey, , tfLabel] = TIMEFRAMES.find(([k]) => k === tf) || TIMEFRAMES[0];
  const mktRet = market[tf];

  // default-select the largest sector by market cap (falls back to turnover)
  const defaultSel = useMemo(() => {
    if (!sectors.length) return null;
    const sized = [...sectors].sort(
      (a, b) => (b.mktcap_cr || b.turnover_cr || 0) - (a.mktcap_cr || a.turnover_cr || 0)
    );
    return sized[0].sector;
  }, [sectors]);
  const [selected, setSelected] = useState(defaultSel);
  const sel = selected || defaultSel;

  // heatmap: order by size, give bigger sectors a larger tile (treemap-ish)
  const heatTiles = useMemo(() => {
    const sized = [...sectors].sort(
      (a, b) => (b.mktcap_cr || b.turnover_cr || 0) - (a.mktcap_cr || a.turnover_cr || 0)
    );
    return sized.map((s, i) => ({
      ...s,
      span: i < 2 ? "col-span-2 row-span-2" : i < 6 ? "col-span-2 row-span-1" : "col-span-1 row-span-1",
    }));
  }, [sectors]);

  const heatScale = useMemo(
    () => Math.max(1, ...sectors.map((s) => Math.abs(s[secKey] ?? 0))),
    [sectors, secKey]
  );

  // ranking (by selected timeframe return, desc)
  const ranked = useMemo(
    () => [...sectors].filter((s) => s[secKey] != null).sort((a, b) => b[secKey] - a[secKey]),
    [sectors, secKey]
  );
  const rankScale = Math.max(1, ...ranked.map((s) => Math.abs(s[secKey])));

  const scatterPoints = useMemo(
    () =>
      sectors
        .filter((s) => s.rel_1m != null && s.rel_3m != null)
        .map((s) => ({
          x: s.rel_3m,
          y: s.rel_1m,
          sector: s.sector,
          phase: s.phase,
          r: Math.min(7, Math.log10((s.mktcap_cr || 1000) / 1000 + 1) * 4),
        })),
    [sectors]
  );

  const selData = sectors.find((s) => s.sector === sel) || null;

  // constituents of the selected sector, sorted by the selected timeframe return
  const constituents = useMemo(() => {
    if (!sel) return [];
    return (stocks || [])
      .filter((e) => e.sector === sel)
      .sort((a, b) => (b[retKey] ?? -1e9) - (a[retKey] ?? -1e9));
  }, [stocks, sel, retKey]);

  const greens = ranked.filter((s) => s[secKey] >= 0).length;
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  if (!sectors.length)
    return <div className="card p-8 text-center text-muted">Sector analytics build as the pipeline runs.</div>;

  return (
    <div className="space-y-5">
      {/* controls + KPI strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted font-semibold">Performance window</span>
          <Segmented value={tf} onChange={setTf} />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="font-semibold">Jump to sector</span>
          <select
            value={sel || ""}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-lg border border-line bg-panel2/50 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-accent/50"
          >
            {[...sectors]
              .map((s) => s.sector)
              .sort((a, b) => a.localeCompare(b))
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat label="Sectors tracked" value={sectors.length} sub={`${(stocks || []).length} liquid stocks`} />
        <MiniStat
          label={`Market median · ${tfLabel}`}
          value={fmtPct(mktRet)}
          tone={toneCls(mktRet)}
          sub={`${greens}/${ranked.length} sectors positive`}
        />
        <MiniStat
          label={`Strongest · ${tfLabel}`}
          value={best ? fmtPct(best[secKey]) : "—"}
          tone={best ? toneCls(best[secKey]) : ""}
          sub={best?.sector}
        />
        <MiniStat
          label={`Weakest · ${tfLabel}`}
          value={worst ? fmtPct(worst[secKey]) : "—"}
          tone={worst ? toneCls(worst[secKey]) : ""}
          sub={worst?.sector}
        />
      </div>

      {/* heatmap */}
      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Sector Heatmap
              <InfoDot topic="sectors.heatmap" />
            </h2>
            <p className="text-xs text-muted mt-1 max-w-2xl">
              Every sector coloured by its median {tfLabel} return; tile size scales with the sector's market cap.
              Click a tile to drill in.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: `rgb(${DOWN} / 0.42)` }} /> weaker
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: `rgb(${UP} / 0.42)` }} /> stronger
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 auto-rows-[78px] gap-2 grid-flow-dense">
          {heatTiles.map((s) => {
            const v = s[secKey];
            const on = s.sector === sel;
            const p = PHASES[s.phase];
            return (
              <button
                key={s.sector}
                onClick={() => setSelected(s.sector)}
                title={`${s.sector} · ${s.phase} · ${s.count} stocks`}
                className={`${s.span} relative rounded-lg border p-2.5 text-left transition hover:brightness-110 ${
                  on ? "border-accent ring-1 ring-accent/50" : "border-line/60"
                }`}
                style={{ backgroundColor: heat(v, heatScale) }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-semibold text-white truncate leading-tight">{s.sector}</span>
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: `rgb(${p.dot})` }}
                  />
                </div>
                <div className={`mt-1 font-mono font-bold tabular-nums ${v >= 0 ? "text-up" : "text-down"} text-sm`}>
                  {fmtPct(v)}
                </div>
                <div className="text-[10px] text-muted mt-auto absolute bottom-2 left-2.5 right-2.5 flex justify-between">
                  <span>{s.count}n</span>
                  <span className={toneCls(s.today)}>{fmtPct(s.today)} today</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ranking + rotation */}
      <div className="grid lg:grid-cols-2 gap-5">
        <section className="card p-5 space-y-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            {tfLabel} Performance Ranking
            <InfoDot topic="sectors.performance" />
          </h2>
          <div className="space-y-1.5">
            {ranked.map((s) => {
              const v = s[secKey];
              const w = (Math.abs(v) / rankScale) * 50;
              const on = s.sector === sel;
              return (
                <button
                  key={s.sector}
                  onClick={() => setSelected(s.sector)}
                  className={`w-full flex items-center gap-2 group ${on ? "" : "opacity-90 hover:opacity-100"}`}
                >
                  <span
                    className={`w-28 shrink-0 truncate text-left text-xs ${on ? "text-white font-semibold" : "text-muted group-hover:text-white"}`}
                  >
                    {s.sector}
                  </span>
                  <div className="flex-1 flex items-center" style={{ height: 16 }}>
                    {/* center axis */}
                    <div className="w-1/2 flex justify-end">
                      {v < 0 && (
                        <div className="h-2.5 rounded-l bg-down" style={{ width: `${w * 2}%` }} />
                      )}
                    </div>
                    <div className="w-px h-4 bg-line" />
                    <div className="w-1/2 flex justify-start">
                      {v >= 0 && (
                        <div className="h-2.5 rounded-r bg-up" style={{ width: `${w * 2}%` }} />
                      )}
                    </div>
                  </div>
                  <span className={`w-16 text-right text-xs font-mono tabular-nums font-semibold ${toneCls(v)}`}>
                    {fmtPct(v)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Rotation Map
              <InfoDot topic="sectors.rotation" />
            </h2>
            <span className="text-[11px] text-muted">1M vs 3M relative strength</span>
          </div>
          <SectorScatter points={scatterPoints} selected={sel} onSelect={(s) => setSelected(s || defaultSel)} />
        </section>
      </div>

      {/* sector detail */}
      {selData && (
        <section className="card p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-white">{selData.sector}</h2>
              <span
                className={`badge ${PHASES[selData.phase]?.tone || "text-muted"}`}
                style={{ backgroundColor: `rgb(${PHASES[selData.phase]?.dot} / 0.14)` }}
                title={PHASES[selData.phase]?.note}
              >
                {selData.phase}
              </span>
              <span className="text-xs text-muted">{selData.count} stocks</span>
              {selData.index && (
                <span className="text-xs text-muted">
                  · {selData.index}{" "}
                  {selData.idx_pct != null && <span className={toneCls(selData.idx_pct)}>{fmtPct(selData.idx_pct)}</span>}
                </span>
              )}
            </div>
            <InfoDot topic="sectors.detail" />
          </div>

          {/* multi-timeframe performance vs market */}
          <div>
            <div className="text-xs text-muted font-semibold mb-2">Median return vs market</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TIMEFRAMES.map(([k, sk, , label]) => {
                const v = selData[sk];
                const rel = v == null || market[k] == null ? null : v - market[k];
                return (
                  <div
                    key={k}
                    className={`rounded-lg border p-3 ${k === tf ? "border-accent/60 bg-accent/5" : "border-line bg-panel2/30"}`}
                  >
                    <div className="text-[10px] uppercase tracking-wide text-muted font-semibold">{label}</div>
                    <div className={`text-xl font-bold font-mono tabular-nums ${toneCls(v)}`}>{fmtPct(v)}</div>
                    <div className="text-[11px] mt-0.5">
                      {rel == null ? (
                        <span className="text-muted">vs mkt —</span>
                      ) : (
                        <span className={toneCls(rel)}>
                          {rel >= 0 ? "▲" : "▼"} {fmtPct(rel)} vs mkt
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* secondary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniStat
              label="Breadth"
              value={`${selData.adv}/${selData.dec}`}
              sub={`${selData.unch} flat`}
              tone={selData.adv >= selData.dec ? "text-up" : "text-down"}
            />
            <MiniStat label="Median score" value={selData.score == null ? "—" : selData.score.toFixed(0)} sub="smart-money" />
            <MiniStat label="From high" value={fmtPct(selData.from_high)} tone={toneCls(selData.from_high)} sub="median" />
            <MiniStat label="Turnover" value={fmtCr(selData.turnover_cr)} sub="today" />
            <MiniStat label="Market cap" value={fmtCr(selData.mktcap_cr)} sub="aggregate" />
            <MiniStat
              label="Inst flow"
              value={fmtFlow(selData.inst_net_cr)}
              tone={selData.inst_net_cr == null ? "" : selData.inst_net_cr >= 0 ? "text-up" : "text-down"}
              sub="net"
            />
          </div>

          {/* leaders / laggards */}
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              ["Leaders", selData.leaders, "text-up"],
              ["Laggards", selData.laggards, "text-down"],
            ].map(([title, list, tone]) => (
              <div key={title} className="rounded-lg border border-line bg-panel2/20 p-3">
                <div className={`text-xs font-semibold mb-2 ${tone}`}>{title} · 1Y</div>
                <div className="space-y-1.5">
                  {(list || []).map((e) => (
                    <div key={e.symbol} className="flex items-center justify-between gap-2 text-xs">
                      <SymbolLink symbol={e.symbol} name={e.company} />
                      <span className={`font-mono tabular-nums ${toneCls(e.ret_1y)}`}>{fmtPct(e.ret_1y)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* constituents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-muted font-semibold">
                Constituents · sorted by {tfLabel} return
              </div>
              <span className="text-[11px] text-muted">{constituents.length} stocks</span>
            </div>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="py-2 px-2 text-left font-semibold">Symbol</th>
                    <th className="py-2 px-2 text-right font-semibold">Price</th>
                    <th className="py-2 px-2 text-right font-semibold">Today</th>
                    {TIMEFRAMES.map(([k, , , label]) => (
                      <th
                        key={k}
                        className={`py-2 px-2 text-right font-semibold whitespace-nowrap ${k === tf ? "text-white" : ""}`}
                      >
                        {label}
                      </th>
                    ))}
                    <th className="py-2 px-2 text-right font-semibold">From High</th>
                    <th className="py-2 px-2 text-right font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {constituents.map((e, i) => (
                    <tr key={e.symbol} className={`border-b border-line/40 hover:bg-panel2/40 ${i % 2 ? "bg-panel2/15" : ""}`}>
                      <td className="py-1.5 px-2">
                        <SymbolLink symbol={e.symbol} name={e.company} />
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-muted">
                        {e.close == null ? "—" : Number(e.close).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-mono tabular-nums ${toneCls(e.pct_change)}`}>
                        {fmtPct(e.pct_change)}
                      </td>
                      {TIMEFRAMES.map(([k, , rk]) => (
                        <td
                          key={k}
                          className={`py-1.5 px-2 text-right font-mono tabular-nums ${toneCls(e[rk])} ${k === tf ? "font-semibold" : "opacity-80"}`}
                        >
                          {fmtPct(e[rk])}
                        </td>
                      ))}
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-muted">{fmtPct(e.from_high)}</td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                        <span className={e.score >= 60 ? "text-up" : e.score >= 45 ? "text-amber-500" : "text-muted"}>
                          {e.score == null ? "—" : Number(e.score).toFixed(0)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-muted flex items-start gap-1.5">
            <span className="text-amber-400 shrink-0">⚠</span>
            <span>
              Sector aggregates use the <span className="text-white">median</span> of each sector's liquid constituents,
              so one outlier can't distort the read. Descriptive analytics — <span className="text-white">not investment advice</span>.
            </span>
          </p>
        </section>
      )}
    </div>
  );
}
