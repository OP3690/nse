"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScoreHistogram, BreadthScatter, MbProbBar, SignalDonut } from "./charts";
import InfoDot from "./InfoDot";

// Bucket boundaries for the smart-money score histogram (0–100).
const SCORE_BUCKETS = [
  ["0–30", 0, 30, "#ea3943"],
  ["30–45", 30, 45, "#f0a020"],
  ["45–55", 45, 55, "#8a96ab"],
  ["55–65", 55, 65, "#5b8cff"],
  ["65–75", 65, 75, "#2dd4bf"],
  ["75–100", 75, 101, "#16c784"],
];

// [label, bar-class, text-class, hex]
const SIGNAL_MIX = [
  ["Strong Accumulation", "bg-up", "text-up", "#16c784"],
  ["Accumulation", "bg-up/60", "text-up/90", "#2dd4bf"],
  ["Neutral", "bg-line", "text-muted", "#8a96ab"],
  ["Distribution", "bg-down", "text-down", "#ea3943"],
];

function ChartCard({ title, info, children, note, action }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {info && <InfoDot topic={info} />}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="flex-1">{children}</div>
      {note && <p className="text-[11px] text-muted mt-2">{note}</p>}
    </div>
  );
}

const cls = (v) => (v >= 0 ? "text-up" : "text-down");

// Clickable result chips for a drill-down selection.
function StockResults({ title, color, items, onClose }) {
  if (!items) return null;
  return (
    <div className="mt-4 rounded-xl border border-line bg-ink/40 p-4 animate-rise">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-sm font-bold text-white">{title}</span>
        <span className="chip chip-muted">{items.length}</span>
        <button onClick={onClose}
          className="ml-auto text-xs text-muted hover:text-white transition px-2 py-1 rounded-md hover:bg-panel2">
          Clear ✕
        </button>
      </div>
      {items.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {items.map((e) => (
            <Link key={e.symbol} href={`/stock/${e.symbol}`}
              className="group flex items-center justify-between gap-2 rounded-lg border border-line bg-panel2/50 px-3 py-2 hover:border-accent/50 hover:bg-panel2 transition min-w-0">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white group-hover:text-accent truncate">{e.symbol}</span>
                <span className="block text-[10px] text-muted truncate">{e.sector || "—"}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block font-mono text-xs font-bold text-white tabular-nums">{Math.round(e.score)}</span>
                <span className={`block font-mono text-[10px] tabular-nums ${cls(e.pct_change)}`}>
                  {e.pct_change >= 0 ? "+" : ""}{e.pct_change?.toFixed(1)}%
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted py-4 text-center">No stocks in this bucket.</p>
      )}
    </div>
  );
}

export default function ScreenerInsights({ rows, multibaggers }) {
  const router = useRouter();
  // selection: { kind: 'score'|'signal', key } — drives the drill-down list
  const [sel, setSel] = useState(null);

  const { scoreData, breadthData, signalMix, total, mbBar } = useMemo(() => {
    const scoreCounts = SCORE_BUCKETS.map(([label, lo, hi, color]) => ({
      bucket: label, count: 0, color,
    }));
    const signalCounts = {};
    const scatter = [];
    for (const e of rows) {
      if (e.score != null) {
        const idx = SCORE_BUCKETS.findIndex(([, lo, hi]) => e.score >= lo && e.score < hi);
        if (idx >= 0) scoreCounts[idx].count++;
      }
      if (e.signal) signalCounts[e.signal] = (signalCounts[e.signal] || 0) + 1;
      if (e.pct_change != null && e.deliv_pct != null && (e.turnover_cr || 0) >= 5) {
        scatter.push({
          symbol: e.symbol,
          x: Math.max(-8, Math.min(8, e.pct_change)),
          y: Math.max(0, Math.min(100, e.deliv_pct)),
          z: e.turnover_cr || 1,
          turnover: e.turnover_cr || 0,
        });
      }
    }
    // keep the scatter readable — cap to the heaviest-turnover names
    scatter.sort((a, b) => b.z - a.z);
    const breadth = scatter.slice(0, 220);

    const tot = rows.length || 1;
    const mix = SIGNAL_MIX.map(([label, bar, text, hex]) => ({
      label, bar, text, hex,
      count: signalCounts[label] || 0,
      pct: ((signalCounts[label] || 0) / tot) * 100,
    }));

    const picks = (multibaggers?.ok ? multibaggers.picks : []) || [];
    let bar = picks.map((p) => ({ symbol: p.symbol, prob: p.prob }));
    if (bar.length < 6) {
      const extra = rows
        .filter((e) => e.mb_prob != null && !bar.some((b) => b.symbol === e.symbol))
        .sort((a, b) => b.mb_prob - a.mb_prob)
        .slice(0, 8 - bar.length)
        .map((e) => ({ symbol: e.symbol, prob: e.mb_prob }));
      bar = [...bar, ...extra];
    }
    bar.sort((a, b) => a.prob - b.prob); // recharts vertical bars render bottom-up

    return { scoreData: scoreCounts, breadthData: breadth, signalMix: mix, total: rows.length, mbBar: bar };
  }, [rows, multibaggers]);

  // resolve the active selection into a sorted stock list
  const results = useMemo(() => {
    if (!sel) return null;
    let list = [];
    let title = "", color = "#5b8cff";
    if (sel.kind === "score") {
      const b = SCORE_BUCKETS.find(([label]) => label === sel.key);
      if (b) {
        const [label, lo, hi, c] = b;
        color = c; title = `Smart-money score ${label}`;
        list = rows.filter((e) => e.score != null && e.score >= lo && e.score < hi);
      }
    } else if (sel.kind === "signal") {
      const m = SIGNAL_MIX.find(([label]) => label === sel.key);
      color = m?.[3] || "#5b8cff"; title = sel.key;
      list = rows.filter((e) => e.signal === sel.key);
    }
    list = list.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 60);
    return { title, color, items: list };
  }, [sel, rows]);

  const toggle = (kind, key) =>
    setSel((p) => (p && p.kind === kind && p.key === key ? null : { kind, key }));

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
            <span>Universe Insights</span><InfoDot topic="screener.insights" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            Cross-sectional reads of all {total.toLocaleString("en-IN")} screened stocks — score distribution,
            delivery-backed breadth, the signal mix and the model's probability leaders.
            <span className="text-white/70"> Click a score bar or a signal slice to list those stocks; click a bubble to open it.</span>
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Smart-Money Score Distribution" info="screener.insights"
          note="Click a bar to list its stocks. The green tail (≥75) is where strong accumulation lives."
          action={<span className="text-[10px] text-accent font-semibold">● clickable</span>}>
          <ScoreHistogram data={scoreData}
            activeBucket={sel?.kind === "score" ? sel.key : null}
            onBarClick={(entry) => entry?.bucket && entry.count > 0 && toggle("score", entry.bucket)} />
        </ChartCard>

        <ChartCard title="Delivery vs Day Move" info="screener.insights"
          note="Each bubble a stock (size = turnover). Top-right = rising on heavy real delivery. Click to open."
          action={<span className="text-[10px] text-accent font-semibold">● clickable</span>}>
          <BreadthScatter data={breadthData}
            onPointClick={(sym) => sym && router.push(`/stock/${sym}`)} />
        </ChartCard>

        <ChartCard title="Signal Composition" info="screener.signal_mix"
          note="Donut of accumulation vs distribution. Center = net breadth (accum − distrib). Click a slice to list."
          action={<span className="text-[10px] text-accent font-semibold">● clickable</span>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <SignalDonut data={signalMix}
              activeLabel={sel?.kind === "signal" ? sel.key : null}
              onSliceClick={(label) => label && toggle("signal", label)} />
            <div className="flex flex-col gap-2">
              {signalMix.map((s) => (
                <button key={s.label} onClick={() => s.count > 0 && toggle("signal", s.label)}
                  className={`flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-1.5 transition text-left
                    ${sel?.kind === "signal" && sel.key === s.label ? "bg-panel2 ring-1 ring-line" : "hover:bg-panel2/60"}`}>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.hex }} />
                    <span className="text-muted truncate">{s.label}</span>
                  </span>
                  <span className={`font-mono tabular-nums shrink-0 ${s.text}`}>
                    {s.count} <span className="text-muted">· {s.pct.toFixed(0)}%</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Multibagger Probability Leaders" info="screener.mb_prob"
          note="Highest KNN analog probabilities of a >10% move within a month. Relative ranking — not advice.">
          <MbProbBar data={mbBar} />
        </ChartCard>
      </div>

      {results && (
        <StockResults title={results.title} color={results.color} items={results.items}
          onClose={() => setSel(null)} />
      )}
    </section>
  );
}
