"use client";

import { useState } from "react";
import { Pct, SymbolLink } from "./ui";
import InfoDot from "./InfoDot";

// Delivery-backed money flow: real demat money that changed hands = turnover x
// delivery%, signed by the day's price direction (up on delivery = money IN /
// accumulation, down = OUT / distribution). The server precomputes two lenses —
// "liquid" (turnover >= ₹5 Cr, the trustworthy default) and "all" traded stocks —
// each with aggregate totals + the top-12 inflow/outflow names. This component
// just renders the chosen lens, toggled by the user.
const fmtCr = (n) =>
  n == null
    ? "—"
    : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 1 })} Cr`;

function FlowColumn({ title, rows, tone, max, total }) {
  const isIn = tone === "in";
  const accent = isIn ? "text-up" : "text-down";
  const barBg = isIn ? "bg-up/70" : "bg-down/70";
  const shown = Math.min(rows.length, 12);
  return (
    <div className="rounded-xl border border-line bg-panel2/40 overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-line ${isIn ? "bg-up/5" : "bg-down/5"}`}>
        <span className={`w-2 h-2 rounded-full ${isIn ? "bg-up" : "bg-down"}`} />
        <span className={`text-sm font-bold ${accent}`}>{title}</span>
        <span className="ml-auto text-xs text-muted">
          {total > shown ? `top ${shown} of ${total}` : `${total} stocks`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Symbol</th>
              <th className="th text-right">Chg</th>
              <th className="th text-right hidden sm:table-cell">Deliv %</th>
              <th className="th text-right">Flow (Cr)</th>
              <th className="th text-right hidden md:table-cell">Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((e) => {
              const mag = Math.abs(e.flowCr);
              const w = max > 0 ? Math.max(4, Math.min(100, (mag / max) * 100)) : 0;
              return (
                <tr key={e.symbol} className="row-hover">
                  <td className="td">
                    <SymbolLink symbol={e.symbol} name={e.company} />
                    <div className="text-[11px] text-muted max-w-[130px] truncate" title={e.company || undefined}>{e.sector || "—"}</div>
                  </td>
                  <td className="td text-right"><Pct value={e.pct_change} className="text-xs" /></td>
                  <td className="td text-right font-mono text-xs hidden sm:table-cell">
                    {e.delivBacked ? `${e.deliv_pct.toFixed(0)}%` : <span className="text-muted/60">n/a</span>}
                  </td>
                  <td className="td text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="hidden lg:block w-16 h-1.5 rounded bg-line overflow-hidden">
                        <div className={`h-full ${barBg}`} style={{ width: `${w}%` }} />
                      </div>
                      <span className={`font-mono text-sm font-semibold ${accent}`}>{fmtCr(mag)}</span>
                    </div>
                  </td>
                  <td className="td text-right font-mono text-xs text-muted hidden md:table-cell">
                    {e.vol_surge ? `${e.vol_surge.toFixed(1)}×` : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td className="td text-muted text-sm" colSpan={5}>No qualifying flow today.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({ value, onChange, liquidCount, allCount }) {
  const opts = [
    { key: "liquid", label: "Liquid", sub: "₹5 Cr+", count: liquidCount },
    { key: "all", label: "All stocks", sub: "full market", count: allCount },
  ];
  return (
    <div className="inline-flex items-stretch rounded-lg border border-line bg-panel2/40 p-0.5 text-xs shrink-0">
      {opts.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`px-3 py-1.5 rounded-md transition leading-tight ${
              active ? "bg-accent/20 text-white" : "text-muted hover:text-white"
            }`}
            title={`${o.label} — ${o.sub}`}
          >
            <span className="font-semibold">{o.label}</span>
            {o.count != null && (
              <span className="ml-1.5 font-mono text-[10px] text-muted">{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function MoneyFlow({ data }) {
  const [lens, setLens] = useState("liquid"); // liquid filter ON by default
  const v = data?.[lens] || data?.liquid;
  if (!v) return null;

  const inflow = v.top_in || [];
  const outflow = v.top_out || [];
  const inTotal = v.in_total || 0;
  const outTotal = v.out_total || 0; // negative
  const net = v.net || 0;
  const inShare = v.balance ?? 0;
  const max = Math.max(inflow[0]?.flowCr || 0, Math.abs(outflow[0]?.flowCr || 0));
  const liquidCount = (data?.liquid?.in_count || 0) + (data?.liquid?.out_count || 0);
  const allCount = (data?.all?.in_count || 0) + (data?.all?.out_count || 0);

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap"><span>Where Money Is Flowing</span><InfoDot topic="moneyflow" /></h2>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            Delivery-backed money flow per stock — delivered turnover (real demat demand) signed by
            the day&apos;s price direction. Rising price on delivery = money in; falling = money out.
          </p>
        </div>
        <Toggle value={lens} onChange={setLens} liquidCount={liquidCount} allCount={allCount} />
      </div>

      {/* summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="mini-card">
          <div className="stat-label">Money In</div>
          <div className="stat-value text-up">{fmtCr(inTotal)}</div>
          <div className="text-[11px] text-muted">{v.in_count} stocks rising on delivery</div>
        </div>
        <div className="mini-card">
          <div className="stat-label">Money Out</div>
          <div className="stat-value text-down">{fmtCr(Math.abs(outTotal))}</div>
          <div className="text-[11px] text-muted">{v.out_count} stocks falling</div>
        </div>
        <div className="mini-card">
          <div className="stat-label">Net Flow</div>
          <div className={`stat-value ${net >= 0 ? "text-up" : "text-down"}`}>
            {net >= 0 ? "+" : "−"}{fmtCr(Math.abs(net)).replace("₹", "₹")}
          </div>
          <div className="text-[11px] text-muted">{net >= 0 ? "Net accumulation" : "Net distribution"}</div>
        </div>
        <div className="mini-card">
          <div className="stat-label">Flow Balance</div>
          <div className="stat-value text-white">{inShare}% in</div>
          <div className="mt-1.5 h-1.5 rounded bg-down/40 overflow-hidden">
            <div className="h-full bg-up" style={{ width: `${inShare}%` }} />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <FlowColumn title="Flowing In — Accumulation" rows={inflow} tone="in" max={max} total={v.in_count} />
        <FlowColumn title="Flowing Out — Distribution" rows={outflow} tone="out" max={max} total={v.out_count} />
      </div>
    </section>
  );
}
