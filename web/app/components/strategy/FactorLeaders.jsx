"use client";

import { useState } from "react";
import InfoDot from "../InfoDot";
import { SymbolLink } from "../ui";
import FactorRadar from "./FactorRadar";

const fmt = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));
const zTone = (z) => (z == null ? "text-muted" : z >= 1.5 ? "text-up" : z >= 0.5 ? "text-accent" : z <= -0.5 ? "text-down" : "text-muted");

function LeaderCol({ def, rows }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-3.5">
      <div className="font-semibold text-white text-sm">{def.label}</div>
      <div className="text-[11px] text-muted mt-0.5 mb-2.5 leading-snug min-h-[48px]">{def.desc}</div>
      <ol className="space-y-1.5">
        {(rows || []).slice(0, 6).map((r, i) => (
          <li key={r.symbol} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-muted/60 font-mono w-3 text-right">{i + 1}</span>
              <SymbolLink symbol={r.symbol} name={r.company} />
            </span>
            <span className={`font-mono tabular-nums shrink-0 ${zTone(r.z)}`}
              title={`z-score vs universe${r.pctile != null ? ` · ${r.pctile.toFixed(1)} percentile` : ""}`}>
              {r.z >= 0 ? "+" : ""}{fmt(r.z, 1)}σ
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function FactorLeaders({ factors }) {
  const [showAll, setShowAll] = useState(false);
  if (!factors || !factors.definitions) return null;
  const defs = factors.definitions;
  const composite = factors.composite || [];
  const shown = showAll ? composite : composite.slice(0, 12);

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2">
            <span>Factor Scores</span>
            <InfoDot topic="strategy.factors" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            Four classic equity factors, each cross-sectionally z-scored across the liquid universe so a score
            reads as standard deviations above or below the market. The composite averages all four.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {defs.map((d) => <LeaderCol key={d.key} def={d} rows={factors.leaders?.[d.key]} />)}
      </div>

      {composite.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2">
          <div className="text-sm font-semibold text-white mb-2 mt-1">Composite leaders — balanced across all four factors</div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2 px-2 text-left font-semibold">#</th>
                  <th className="py-2 px-2 text-left font-semibold">Symbol</th>
                  <th className="py-2 px-2 text-right font-semibold">Composite</th>
                  <th className="py-2 px-2 text-right font-semibold">Mom</th>
                  <th className="py-2 px-2 text-right font-semibold">LowVol</th>
                  <th className="py-2 px-2 text-right font-semibold">Quality</th>
                  <th className="py-2 px-2 text-right font-semibold">Trend</th>
                  <th className="py-2 px-2 text-right font-semibold">Sharpe</th>
                  <th className="py-2 px-2 text-right font-semibold">Vol</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.symbol} className={`border-b border-line/40 hover:bg-panel2/40 transition ${i % 2 ? "bg-panel2/15" : ""}`}>
                    <td className="py-2 px-2 text-muted/60 font-mono">{i + 1}</td>
                    <td className="py-2 px-2"><SymbolLink symbol={r.symbol} name={r.company} /></td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">
                      <span className={zTone(r.quant)}>{r.quant >= 0 ? "+" : ""}{fmt(r.quant)}</span>
                    </td>
                    <td className={`py-2 px-2 text-right font-mono tabular-nums ${zTone(r.momentum)}`}>{fmt(r.momentum, 1)}</td>
                    <td className={`py-2 px-2 text-right font-mono tabular-nums ${zTone(r.lowvol)}`}>{fmt(r.lowvol, 1)}</td>
                    <td className={`py-2 px-2 text-right font-mono tabular-nums ${zTone(r.quality)}`}>{fmt(r.quality, 1)}</td>
                    <td className={`py-2 px-2 text-right font-mono tabular-nums ${zTone(r.trend)}`}>{fmt(r.trend, 1)}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-muted">{fmt(r.sharpe)}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-muted">{r.ann_vol == null ? "—" : `${r.ann_vol.toFixed(0)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {composite.length > 12 && (
            <button onClick={() => setShowAll((s) => !s)}
              className="mt-2 text-xs text-accent hover:brightness-125 transition">
              {showAll ? "Show fewer" : `Show all ${composite.length} →`}
            </button>
          )}
          </div>
          <FactorRadar composite={composite} />
        </div>
      )}
    </section>
  );
}
