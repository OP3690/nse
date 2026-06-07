"use client";

import { useMemo, useState } from "react";
import InfoDot from "./InfoDot";

const UP = "22 199 132";    // #16c784
const DOWN = "234 57 67";   // #ea3943

// RRG-style rotation phases. Position vs the market average on the short (1M)
// and long (3M) horizon decides the quadrant.
const PHASES = {
  Leading:   { tone: "text-up",       dot: UP,   note: "Strong on both 1M & 3M" },
  Improving: { tone: "text-accent",   dot: "96 165 250", note: "1M turning up, 3M still soft" },
  Weakening: { tone: "text-amber-500", dot: "240 160 32", note: "3M strong but 1M fading" },
  Lagging:   { tone: "text-down",     dot: DOWN, note: "Behind market on both" },
};
const PHASE_ORDER = { Leading: 0, Improving: 1, Weakening: 2, Lagging: 3 };

const fmtPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const fmtCr = (v) =>
  v == null ? "—" : `${v >= 0 ? "+" : "−"}₹${Math.abs(v).toFixed(0)}`;

// Diverging green↔red heat for a return cell, scaled by magnitude vs the
// column's strongest absolute value so the spread fills the available contrast.
function heat(v, scale) {
  if (v == null) return "transparent";
  const a = Math.min(1, Math.abs(v) / (scale || 1)) * 0.22 + 0.04;
  return `rgb(${v >= 0 ? UP : DOWN} / ${a.toFixed(3)})`;
}

const COLUMNS = [
  { key: "name", label: "Sector", align: "left" },
  { key: "n", label: "Stocks", align: "right" },
  { key: "phase", label: "Phase", align: "left" },
  { key: "today", label: "Today", align: "right", heat: true },
  { key: "breadth", label: "Adv / Dec", align: "right" },
  { key: "r1", label: "1M", align: "right", heat: true },
  { key: "r3", label: "3M", align: "right", heat: true },
  { key: "fromHigh", label: "From High", align: "right" },
  { key: "score", label: "Score", align: "right" },
  { key: "inst", label: "Inst ₹Cr", align: "right" },
];

const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

export default function SectorMatrix({ rows }) {
  const [sortKey, setSortKey] = useState("score");
  const [dir, setDir] = useState("desc");

  const { sectors, market, scales } = useMemo(() => {
    const groups = new Map();
    let m1 = [], m3 = [];
    for (const e of rows || []) {
      if (!e.sector) continue;
      if (!groups.has(e.sector)) groups.set(e.sector, []);
      groups.get(e.sector).push(e);
      if (e.ret_1m != null) m1.push(e.ret_1m);
      if (e.ret_3m != null) m3.push(e.ret_3m);
    }
    const market = { r1: avg(m1) ?? 0, r3: avg(m3) ?? 0 };

    const sectors = [];
    for (const [name, list] of groups) {
      if (list.length < 3) continue;
      const today = avg(list.map((e) => e.pct_change).filter((v) => v != null));
      const r1 = avg(list.map((e) => e.ret_1m).filter((v) => v != null));
      const r3 = avg(list.map((e) => e.ret_3m).filter((v) => v != null));
      const fromHigh = avg(list.map((e) => e.from_high).filter((v) => v != null));
      const score = avg(list.map((e) => e.score).filter((v) => v != null));
      const instVals = list.map((e) => e.inst_net_cr).filter((v) => v != null);
      const inst = instVals.length ? instVals.reduce((s, x) => s + x, 0) : null;
      const adv = list.filter((e) => e.pct_change > 0.05).length;
      const dec = list.filter((e) => e.pct_change < -0.05).length;

      const rel1 = (r1 ?? 0) - market.r1;
      const rel3 = (r3 ?? 0) - market.r3;
      const phase =
        rel3 >= 0 ? (rel1 >= 0 ? "Leading" : "Weakening") : rel1 >= 0 ? "Improving" : "Lagging";

      sectors.push({ name, n: list.length, today, breadth: adv - dec, adv, dec, r1, r3, fromHigh, score, inst, phase });
    }

    const colMax = (k) => Math.max(1, ...sectors.map((s) => Math.abs(s[k] ?? 0)));
    const scales = { today: colMax("today"), r1: colMax("r1"), r3: colMax("r3") };
    return { sectors, market, scales };
  }, [rows]);

  const sorted = useMemo(() => {
    const arr = [...sectors];
    arr.sort((a, b) => {
      let av, bv;
      if (sortKey === "name") return dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      if (sortKey === "phase") { av = PHASE_ORDER[a.phase]; bv = PHASE_ORDER[b.phase]; }
      else if (sortKey === "breadth") { av = a.breadth; bv = b.breadth; }
      else { av = a[sortKey] ?? -Infinity; bv = b[sortKey] ?? -Infinity; }
      return dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [sectors, sortKey, dir]);

  if (!sectors.length) return null;

  const onSort = (k) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setDir(k === "name" ? "asc" : "desc"); }
  };

  // phase tally for the summary strip
  const tally = sorted.reduce((m, s) => ((m[s.phase] = (m[s.phase] || 0) + 1), m), {});

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
            <span>Sector Rotation Matrix</span>
            <InfoDot topic="screener.sector_matrix" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            Every sector's breadth, momentum, drawdown, smart-money score and institutional flow on one grid.
            Each phase reads each sector's 1-month and 3-month return against the whole liquid universe —
            an RRG-style map of where money is rotating.
          </p>
        </div>
        <span className="text-xs text-muted shrink-0">{sorted.length} sectors · {(rows || []).filter((e) => e.sector).length} stocks</span>
      </div>

      {/* phase legend + tally */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        {Object.entries(PHASES).map(([name, p]) => (
          <span key={name} className="inline-flex items-center gap-1.5" title={p.note}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `rgb(${p.dot})` }} />
            <span className={`font-semibold ${p.tone}`}>{name}</span>
            <span className="font-mono tabular-nums text-muted">{tally[name] || 0}</span>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-line">
              {COLUMNS.map((c) => (
                <th key={c.key}
                  onClick={() => onSort(c.key)}
                  className={`py-2 px-2 font-semibold text-muted cursor-pointer select-none hover:text-white transition whitespace-nowrap ${
                    c.align === "right" ? "text-right" : "text-left"
                  } ${sortKey === c.key ? "text-white" : ""}`}>
                  {c.label}
                  {sortKey === c.key && <span className="ml-0.5 text-[9px]">{dir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const p = PHASES[s.phase];
              return (
                <tr key={s.name} className={`border-b border-line/40 transition hover:bg-panel2/40 ${i % 2 ? "bg-panel2/15" : ""}`}>
                  <td className="py-2 px-2 font-medium text-white whitespace-nowrap max-w-[180px] truncate">{s.name}</td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-muted">{s.n}</td>
                  <td className="py-2 px-2">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: `rgb(${p.dot})` }} />
                      <span className={`text-xs font-semibold ${p.tone}`}>{s.phase}</span>
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums rounded"
                    style={{ backgroundColor: heat(s.today, scales.today) }}>
                    <span className={s.today >= 0 ? "text-up" : "text-down"}>{fmtPct(s.today)}</span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                    <span className="text-up">{s.adv}</span>
                    <span className="text-muted"> / </span>
                    <span className="text-down">{s.dec}</span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums"
                    style={{ backgroundColor: heat(s.r1, scales.r1) }}>
                    <span className={(s.r1 ?? 0) >= 0 ? "text-up" : "text-down"}>{fmtPct(s.r1)}</span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums"
                    style={{ backgroundColor: heat(s.r3, scales.r3) }}>
                    <span className={(s.r3 ?? 0) >= 0 ? "text-up" : "text-down"}>{fmtPct(s.r3)}</span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-muted">{fmtPct(s.fromHigh)}</td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums">
                    <span className={s.score >= 60 ? "text-up" : s.score >= 45 ? "text-amber-500" : "text-muted"}>
                      {s.score == null ? "—" : s.score.toFixed(0)}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-xs">
                    <span className={s.inst == null ? "text-muted" : s.inst >= 0 ? "text-up" : "text-down"}>{fmtCr(s.inst)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted flex items-start gap-1.5">
        <span className="text-amber-400 shrink-0">⚠</span>
        <span>Sector averages are descriptive, <span className="text-white">not investment advice</span>.
          A leading sector can roll over and a lagging one can bottom; phases describe the recent past, not the future.</span>
      </p>
    </section>
  );
}
