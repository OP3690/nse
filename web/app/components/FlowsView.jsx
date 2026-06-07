"use client";

import { useState } from "react";
import { FlowChart, DestinationChart, FiiDerivChart } from "./charts";
import InfoDot from "./InfoDot";

const TABS = [
  ["day", "Day"],
  ["week", "Week"],
  ["month", "Month"],
  ["quarter", "Quarter"],
  ["year", "Year"],
];

const SUMMARY = [
  ["1d", "1 Day"],
  ["1w", "1 Week"],
  ["1m", "1 Month"],
  ["1q", "1 Quarter"],
  ["1y", "1 Year"],
];

// Static so Tailwind keeps these classes; picks columns by visible-card count.
const COLS = {
  1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3",
  4: "md:grid-cols-4", 5: "md:grid-cols-5",
};

const cr = (v) =>
  v == null ? "—" : `${v >= 0 ? "+" : "−"}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function FlowCard({ label, w }) {
  if (!w) return null;
  return (
    <div className="card">
      <div className="card-title mb-2">{label}</div>
      <div className="space-y-1.5 text-sm font-mono">
        <div className="flex justify-between">
          <span className="text-muted">FII</span>
          <span className={w.fii >= 0 ? "text-up" : "text-down"}>{cr(w.fii)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">DII</span>
          <span className={w.dii >= 0 ? "text-up" : "text-down"}>{cr(w.dii)}</span>
        </div>
        <div className="flex justify-between border-t border-line pt-1.5">
          <span className="text-muted">Net</span>
          <span className={w.net >= 0 ? "text-up" : "text-down"}>{cr(w.net)}</span>
        </div>
      </div>
      <div className="text-[10px] text-muted mt-1">{w.sessions} session{w.sessions === 1 ? "" : "s"}</div>
    </div>
  );
}

const REC_TABS = [
  ["month", "Month"],
  ["quarter", "Quarter"],
  ["year", "Year"],
];

export default function FlowsView({ flows }) {
  const [tab, setTab] = useState("month");
  const [recTab, setRecTab] = useState("month");
  const nsdl = flows.nsdl;
  const deriv = flows.fii_deriv;
  const rec = flows.reconciled;
  const recData = rec?.timeframes?.[recTab] || [];
  const sectors = flows.sector_destination || [];
  const s = flows.summary || {};

  // Only show windows the provisional history can actually fill — 1Q/1Y stay
  // hidden until enough sessions accumulate, then appear automatically.
  const cards = SUMMARY.filter(([k]) => s[k] && s[k].full !== false);
  const visTabs = TABS.filter(([k]) => (flows.timeframes?.[k]?.length || 0) >= 2);
  const activeTab = visTabs.some(([k]) => k === tab) ? tab : (visTabs[visTabs.length - 1]?.[0] || "month");
  const tabData = flows.timeframes?.[activeTab] || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="card-title mb-2 flex items-center gap-2"><span>Net FII / DII by Timeframe</span><InfoDot topic="flows.summary" /></h2>
        <div className={`grid grid-cols-2 ${COLS[cards.length] || "md:grid-cols-3"} gap-3`}>
          {cards.map(([k, label]) => <FlowCard key={k} label={label} w={s[k]} />)}
        </div>
      </div>

      <section className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="card-title mb-0 flex items-center gap-2"><span>Net Flow & Cumulative Trend</span><InfoDot topic="flows.netflow" /></h2>
          <div className="flex gap-1 bg-panel2 rounded-lg p-1">
            {visTabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-1 text-xs rounded-md transition ${
                  activeTab === key ? "bg-accent text-ink font-semibold" : "text-muted hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tabData.length ? (
          <FlowChart data={tabData} />
        ) : (
          <p className="text-sm text-muted py-10 text-center">
            Not enough history for this timeframe yet — FII/DII flow accumulates daily going forward.
          </p>
        )}
        <p className="text-xs text-muted mt-2">
          Bars = net buy/sell per {activeTab}. Dashed lines = cumulative (the persistent trend). Green/red = FII, blue/amber = DII.
        </p>
      </section>

      {rec && (
        <section className="card">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <h2 className="card-title mb-0 flex items-center gap-2"><span>NSDL Official — Reconciled Trend</span><InfoDot topic="flows.reconciled" /></h2>
            <div className="flex gap-1 bg-panel2 rounded-lg p-1">
              {REC_TABS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setRecTab(key)}
                  className={`px-3 py-1 text-xs rounded-md transition ${
                    recTab === key ? "bg-accent text-ink font-semibold" : "text-muted hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted mb-3">
            Custodial-confirmed figures from NSE&apos;s Category-wise Turnover report: FII = NSDL FPI,
            DII = Total DII (Banks/DFI/Insurance/MF/NPS), back to 2021. These are the <em>reconciled</em>{" "}
            official numbers — they differ slightly from the provisional same-day figures above, but go back years.
          </p>
          {recData.length ? (
            <FlowChart data={recData} showCum={false} />
          ) : (
            <p className="text-sm text-muted py-10 text-center">Reconciled history loading.</p>
          )}
          <p className="text-xs text-muted mt-2">
            FPI (FII) through {rec.fpi_date || "—"} · DII through {rec.dii_month || "—"}. Reconciled DII runs back to 2021;
            reconciled FPI begins May 2025, so earlier {recTab}s show DII only. Green/red = FII, blue/amber = DII.
          </p>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card min-w-0">
          <h2 className="card-title mb-1 flex items-center gap-2"><span>Asset-Class Destination (FPI)</span><InfoDot topic="flows.destination" /></h2>
          <p className="text-xs text-muted mb-3">
            Where foreign money went {nsdl?.date ? `on ${nsdl.date}` : ""} — Equity vs Debt vs Hybrid (NSDL, ₹ Cr).
          </p>
          <DestinationChart data={nsdl?.latest} />
        </section>

        <section className="card min-w-0">
          <h2 className="card-title mb-1 flex items-center gap-2"><span>Sector Destination (5-day)</span><InfoDot topic="flows.sector_dest" /></h2>
          <p className="text-xs text-muted mb-3">
            Sectors absorbing the most delivered money — real demat accumulation.
          </p>
          {sectors.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Sector</th>
                    <th className="th text-right">Delivered ₹Cr</th>
                    <th className="th text-right hidden sm:table-cell">Turnover ₹Cr</th>
                    <th className="th text-right">Avg Chg</th>
                  </tr>
                </thead>
                <tbody>
                  {sectors.slice(0, 12).map((r) => (
                    <tr key={r.sector} className="hover:bg-panel2/50">
                      <td className="td font-semibold">{r.sector}</td>
                      <td className="td text-right font-mono">{r.deliv_cr?.toLocaleString("en-IN")}</td>
                      <td className="td text-right font-mono text-muted hidden sm:table-cell">{r.turnover_cr?.toLocaleString("en-IN")}</td>
                      <td className={`td text-right font-mono ${r.avg_pct >= 0 ? "text-up" : "text-down"}`}>
                        {r.avg_pct >= 0 ? "+" : ""}{r.avg_pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted py-8 text-center">No sector data.</p>
          )}
        </section>
      </div>

      {deriv && (
        <section className="card">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <h2 className="card-title mb-0 flex items-center gap-2"><span>FII Derivatives Positioning (F&amp;O)</span><InfoDot topic="flows.deriv" /></h2>
            <span className="text-xs text-muted">{deriv.date}</span>
          </div>
          <p className="text-xs text-muted mb-3">
            FII net buy/sell (₹ Cr) per F&amp;O category, monthly. Index/stock futures net is the classic
            directional gauge; open interest below shows where FII is currently positioned.
          </p>
          <FiiDerivChart data={deriv.monthly} />
          {deriv.latest?.length > 0 && (
            <div className="overflow-x-auto mt-4">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Category</th>
                    <th className="th text-right">Net (₹Cr)</th>
                    <th className="th text-right hidden sm:table-cell">OI Amt (₹Cr)</th>
                    <th className="th text-right hidden md:table-cell">OI Contracts</th>
                  </tr>
                </thead>
                <tbody>
                  {deriv.latest.map((r) => (
                    <tr key={r.instrument} className="hover:bg-panel2/50">
                      <td className="td font-semibold">{r.instrument}</td>
                      <td className={`td text-right font-mono ${r.net >= 0 ? "text-up" : "text-down"}`}>
                        {cr(r.net)}
                      </td>
                      <td className="td text-right font-mono text-muted hidden sm:table-cell">
                        {r.oi_amt != null ? Math.round(r.oi_amt).toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="td text-right font-mono text-muted hidden md:table-cell">
                        {r.oi_contracts != null ? r.oi_contracts.toLocaleString("en-IN") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
