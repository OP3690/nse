"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import InfoDot from "./InfoDot";
import { SymbolLink } from "./ui";
import { SectorScatter, SectorHorizonBars } from "./charts";

const UP = "22 199 132"; // #16c784
const DOWN = "234 57 67"; // #ea3943

// timeframe → [key, sector aggregate key, per-stock return key, label]
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
const toneCls = (v) => (v == null ? "text-muted" : v >= 0 ? "text-up" : "text-down");

function heat(v, scale, floor = 0.06, ceil = 0.5) {
  if (v == null) return "transparent";
  const a = Math.min(1, Math.abs(v) / (scale || 1)) * (ceil - floor) + floor;
  return `rgb(${v >= 0 ? UP : DOWN} / ${a.toFixed(3)})`;
}

// ── squarified treemap (Bruls/Huizing/van Wijk) in pixel space ──────────────
function squarify(items, W, H) {
  const total = items.reduce((s, it) => s + it.weight, 0) || 1;
  const scaled = items.map((it) => ({ ...it, area: (it.weight / total) * (W * H) }));
  const rects = [];
  const worst = (row, len) => {
    const s = row.reduce((a, r) => a + r.area, 0);
    const mx = Math.max(...row.map((r) => r.area));
    const mn = Math.min(...row.map((r) => r.area));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const layout = (row, x, y, w, h) => {
    const s = row.reduce((a, r) => a + r.area, 0);
    const vertical = w >= h;
    if (vertical) {
      const rw = s / h;
      let cy = y;
      for (const r of row) {
        const rh = r.area / rw;
        rects.push({ ...r, x, y: cy, w: rw, h: rh });
        cy += rh;
      }
      return [x + rw, y, w - rw, h];
    }
    const rh = s / w;
    let cx = x;
    for (const r of row) {
      const rw = r.area / rh;
      rects.push({ ...r, x: cx, y, w: rw, h: rh });
      cx += rw;
    }
    return [x, y + rh, w, h - rh];
  };
  let rest = [...scaled];
  let [x, y, w, h] = [0, 0, W, H];
  while (rest.length) {
    if (rest.length === 1) {
      rects.push({ ...rest[0], x, y, w, h });
      break;
    }
    const len = Math.min(w, h);
    let row = [];
    while (rest.length) {
      const cand = [...row, rest[0]];
      if (row.length === 0 || worst(row, len) >= worst(cand, len)) {
        row = cand;
        rest.shift();
      } else break;
    }
    [x, y, w, h] = layout(row, x, y, w, h);
  }
  return rects;
}

// Trajectory of returns across the four horizons, as a tiny sparkline.
function Spark({ pts, w = 60, h = 20, strokeW = 1.6 }) {
  const vals = pts.filter((v) => v != null);
  if (vals.length < 2) return <span className="text-muted/50 text-[10px]">—</span>;
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const range = max - min || 1;
  const stepX = w / (pts.length - 1);
  const yOf = (v) => h - ((v - min) / range) * h;
  let d = "";
  let lastX = 0;
  let started = false;
  pts.forEach((v, i) => {
    if (v == null) return;
    const px = i * stepX;
    const py = yOf(v);
    d += `${started ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`;
    started = true;
    lastX = px;
  });
  const last = vals[vals.length - 1];
  const col = last >= 0 ? "#16c784" : "#ea3943";
  const zeroY = yOf(0);
  return (
    <svg width={w} height={h} className="overflow-visible">
      <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="currentColor" className="text-line" strokeWidth="1" strokeDasharray="2 2" />
      <path d={d} fill="none" stroke={col} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={yOf(last)} r={2} fill={col} />
    </svg>
  );
}

function Segmented({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel2/40 p-0.5">
      {TIMEFRAMES.map(([key, , , label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition ${
            value === key
              ? "bg-gradient-to-b from-accent/30 to-accent/10 text-white ring-1 ring-inset ring-accent/40 shadow-[0_2px_8px_-3px_rgb(var(--accent)/0.6)]"
              : "text-muted hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function HeroCard({ label, children, accent = "accent", spark }) {
  const bar = accent === "up" ? "from-up/70" : accent === "down" ? "from-down/70" : "from-accent/70";
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-gradient-to-br from-panel2/60 to-panel/40 p-4">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${bar} to-transparent`} />
      <div className="text-[10px] uppercase tracking-wider text-muted font-semibold flex items-center justify-between gap-2">
        <span>{label}</span>
        {spark}
      </div>
      {children}
    </div>
  );
}

export default function SectorsView({ analytics, stocks }) {
  const [tf, setTf] = useState("1m");
  const sectors = analytics?.sectors || [];
  const market = analytics?.market || {};
  const [, secKey, retKey, tfLabel] = TIMEFRAMES.find(([k]) => k === tf) || TIMEFRAMES[0];
  const mktRet = market[tf];

  const defaultSel = useMemo(() => {
    if (!sectors.length) return null;
    return [...sectors].sort(
      (a, b) => (b.mktcap_cr || b.turnover_cr || 0) - (a.mktcap_cr || a.turnover_cr || 0)
    )[0].sector;
  }, [sectors]);
  const [selected, setSelected] = useState(defaultSel);
  const sel = selected || defaultSel;
  const selData = sectors.find((s) => s.sector === sel) || null;

  // ── treemap geometry (measured, recomputed on resize) ──
  const boxRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const cr = e.contentRect;
      setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const heatScale = useMemo(
    () => Math.max(1, ...sectors.map((s) => Math.abs(s[secKey] ?? 0))),
    [sectors, secKey]
  );

  const tiles = useMemo(() => {
    if (!size.w || !size.h) return [];
    const items = sectors.map((s) => ({
      sector: s.sector,
      // compress the cap range so small sectors stay clickable, big ones still dominate
      weight: Math.pow(s.mktcap_cr || s.turnover_cr * 50 || s.count * 200 || 1, 0.62),
      s,
    }));
    items.sort((a, b) => b.weight - a.weight);
    return squarify(items, size.w, size.h);
  }, [sectors, size]);

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

  const constituents = useMemo(() => {
    if (!sel) return [];
    return (stocks || []).filter((e) => e.sector === sel).sort((a, b) => (b[retKey] ?? -1e9) - (a[retKey] ?? -1e9));
  }, [stocks, sel, retKey]);

  const greens = ranked.filter((s) => s[secKey] >= 0).length;
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const greenW = ranked.length ? (greens / ranked.length) * 100 : 50;

  // RRG phase distribution — drives the clickable quadrant strip under the map.
  const phaseGroups = useMemo(() => {
    const order = ["Leading", "Improving", "Weakening", "Lagging"];
    return order.map((name) => {
      const list = sectors
        .filter((s) => s.phase === name)
        .sort((a, b) => (b.rel_1m ?? -1e9) - (a.rel_1m ?? -1e9));
      return { name, list, ...PHASES[name] };
    });
  }, [sectors]);

  const horizonData = useMemo(
    () =>
      selData
        ? TIMEFRAMES.map(([k, sk, , label]) => ({ label, sector: selData[sk] ?? 0, market: market[k] ?? 0 }))
        : [],
    [selData, market]
  );

  if (!sectors.length)
    return <div className="card p-8 text-center text-muted">Sector analytics build as the pipeline runs.</div>;

  return (
    <div className="space-y-5">
      {/* toolbar */}
      <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel/80 backdrop-blur px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-muted font-semibold hidden sm:inline">Window</span>
          <Segmented value={tf} onChange={setTf} />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="font-semibold hidden sm:inline">Sector</span>
          <select
            value={sel || ""}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-lg border border-line bg-panel2/50 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-accent/50 max-w-[200px]"
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

      {/* hero band */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <HeroCard label="Market breadth">
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-white tabular-nums">{greens}</span>
            <span className="text-sm text-muted">/ {ranked.length} positive</span>
          </div>
          <div className="mt-2 flex h-1.5 rounded-full overflow-hidden bg-line">
            <div className="bg-up h-full" style={{ width: `${greenW}%` }} />
            <div className="bg-down h-full" style={{ width: `${100 - greenW}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-muted">over {tfLabel}</div>
        </HeroCard>

        <HeroCard label={`Market median · ${tfLabel}`} accent={mktRet >= 0 ? "up" : "down"}>
          <div className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${toneCls(mktRet)}`}>{fmtPct(mktRet)}</div>
          <div className="text-[10px] text-muted mt-1">median liquid stock</div>
        </HeroCard>

        <HeroCard
          label={`Strongest · ${tfLabel}`}
          accent="up"
          spark={best && <Spark pts={[best.r1m, best.r3m, best.r6m, best.r1y]} w={44} h={16} />}
        >
          <button onClick={() => best && setSelected(best.sector)} className="text-left w-full">
            <div className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${best ? toneCls(best[secKey]) : ""}`}>
              {best ? fmtPct(best[secKey]) : "—"}
            </div>
            <div className="text-[11px] text-white/80 truncate mt-0.5 hover:text-accent">{best?.sector}</div>
          </button>
        </HeroCard>

        <HeroCard
          label={`Weakest · ${tfLabel}`}
          accent="down"
          spark={worst && <Spark pts={[worst.r1m, worst.r3m, worst.r6m, worst.r1y]} w={44} h={16} />}
        >
          <button onClick={() => worst && setSelected(worst.sector)} className="text-left w-full">
            <div className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${worst ? toneCls(worst[secKey]) : ""}`}>
              {worst ? fmtPct(worst[secKey]) : "—"}
            </div>
            <div className="text-[11px] text-white/80 truncate mt-0.5 hover:text-accent">{worst?.sector}</div>
          </button>
        </HeroCard>
      </div>

      {/* treemap heatmap */}
      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Sector Heatmap
              <InfoDot topic="sectors.heatmap" />
            </h2>
            <p className="text-xs text-muted mt-1 max-w-2xl">
              Tile area scales with each sector's market cap; colour is its median {tfLabel} return. Click any tile to drill in.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span>weaker</span>
            <span className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(90deg, rgb(${DOWN}/0.5), rgb(${DOWN}/0.12), rgb(${UP}/0.12), rgb(${UP}/0.5))` }} />
            <span>stronger</span>
          </div>
        </div>
        <div ref={boxRef} className="relative w-full h-[360px] sm:h-[440px]">
          {tiles.map(({ s, x, y, w, h }) => {
            const v = s[secKey];
            const on = s.sector === sel;
            const p = PHASES[s.phase];
            const big = w > 96 && h > 60;
            const med = w > 58 && h > 38;
            return (
              <button
                key={s.sector}
                onClick={() => setSelected(s.sector)}
                title={`${s.sector} · ${s.phase} · ${s.count} stocks · ${fmtPct(v)} ${tfLabel}`}
                className={`absolute rounded-lg border p-2 text-left overflow-hidden transition-all duration-500 ease-out hover:z-20 hover:brightness-125 ${
                  on ? "border-accent ring-2 ring-accent/50 z-10" : "border-line/40"
                }`}
                style={{
                  left: x + 2,
                  top: y + 2,
                  width: Math.max(0, w - 4),
                  height: Math.max(0, h - 4),
                  backgroundColor: heat(v, heatScale),
                }}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={`font-semibold text-white leading-tight ${big ? "text-xs" : "text-[10px]"} ${med ? "" : "truncate"}`}>
                    {med ? s.sector : s.sector.slice(0, 3)}
                  </span>
                  {med && <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: `rgb(${p.dot})` }} />}
                </div>
                {med && (
                  <div className={`font-mono font-bold tabular-nums ${v >= 0 ? "text-up" : "text-down"} ${big ? "text-base" : "text-xs"} mt-0.5`}>
                    {fmtPct(v)}
                  </div>
                )}
                {big && (
                  <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] text-white/55">
                    <span>{s.count} stocks</span>
                    <Spark pts={[s.r1m, s.r3m, s.r6m, s.r1y]} w={40} h={12} strokeW={1.3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ranking + rotation */}
      <div className="grid lg:grid-cols-5 gap-5 lg:items-start">
        <section className="card p-5 space-y-3 lg:col-span-2">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            {tfLabel} Ranking
            <InfoDot topic="sectors.performance" />
          </h2>
          <div className="space-y-1">
            {ranked.map((s, i) => {
              const v = s[secKey];
              const w = (Math.abs(v) / rankScale) * 100;
              const on = s.sector === sel;
              return (
                <button
                  key={s.sector}
                  onClick={() => setSelected(s.sector)}
                  className={`w-full flex items-center gap-2 rounded-md px-1.5 py-1 transition group ${on ? "bg-accent/10 ring-1 ring-inset ring-accent/30" : "hover:bg-panel2/40"}`}
                >
                  <span className="w-4 text-[10px] font-mono text-muted shrink-0 tabular-nums">{i + 1}</span>
                  <span className={`w-24 shrink-0 truncate text-left text-xs ${on ? "text-white font-semibold" : "text-muted group-hover:text-white"}`}>
                    {s.sector}
                  </span>
                  <Spark pts={[s.r1m, s.r3m, s.r6m, s.r1y]} w={42} h={16} strokeW={1.3} />
                  <div className="flex-1 flex items-center min-w-0">
                    <div className="w-1/2 flex justify-end">
                      {v < 0 && <div className="h-2 rounded-l bg-gradient-to-l from-down to-down/50" style={{ width: `${w}%` }} />}
                    </div>
                    <div className="w-px h-3.5 bg-line/70 shrink-0" />
                    <div className="w-1/2 flex justify-start">
                      {v >= 0 && <div className="h-2 rounded-r bg-gradient-to-r from-up to-up/50" style={{ width: `${w}%` }} />}
                    </div>
                  </div>
                  <span className={`w-14 text-right text-xs font-mono tabular-nums font-semibold ${toneCls(v)}`}>{fmtPct(v)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-5 space-y-2 lg:col-span-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Rotation Map
              <InfoDot topic="sectors.rotation" />
            </h2>
            <span className="text-[11px] text-muted hidden sm:inline">3M (x) vs 1M (y) relative strength · click a bubble</span>
          </div>
          <SectorScatter points={scatterPoints} selected={sel} onSelect={(s) => setSelected(s || defaultSel)} />

          {/* quadrant breakdown — clickable phase chips fill the column + add insight */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {phaseGroups.map((g) => {
              const lead = g.list[0];
              return (
                <button
                  key={g.name}
                  type="button"
                  disabled={!lead}
                  onClick={() => lead && setSelected(lead.sector)}
                  title={g.note}
                  className={`group rounded-lg border px-3 py-2 text-left transition ${
                    lead ? "hover:border-accent/50 hover:bg-panel2/40" : "opacity-50 cursor-default"
                  } ${g.list.some((s) => s.sector === sel) ? "border-accent/60 bg-accent/5" : "border-line bg-panel2/20"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: `rgb(${g.dot})` }} />
                    <span className={`text-[11px] font-semibold ${g.tone}`}>{g.name}</span>
                    <span className="ml-auto text-xs font-bold tabular-nums text-white">{g.list.length}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-muted truncate group-hover:text-white/80">
                    {lead ? lead.sector : "—"}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* sector detail */}
      {selData && (
        <section className="card p-0 overflow-hidden">
          {/* header band */}
          <div className="relative overflow-hidden border-b border-line bg-gradient-to-br from-panel2/70 to-panel/30 p-5">
            <div
              className="absolute -top-14 -right-8 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-40"
              style={{ background: `rgb(${PHASES[selData.phase]?.dot})` }}
            />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: `rgb(${PHASES[selData.phase]?.dot})`, boxShadow: `0 0 8px rgb(${PHASES[selData.phase]?.dot})` }} />
                <h2 className="text-xl font-bold text-white">{selData.sector}</h2>
                <span className={`badge ${PHASES[selData.phase]?.tone || "text-muted"}`} style={{ backgroundColor: `rgb(${PHASES[selData.phase]?.dot} / 0.14)` }} title={PHASES[selData.phase]?.note}>
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
          </div>

          <div className="p-5 space-y-5">
            {/* horizon chart + tiles */}
            <div className="grid lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3">
                <div className="text-xs text-muted font-semibold mb-1 flex items-center gap-2">
                  <span>Return vs market across horizons</span>
                  <span className="inline-flex items-center gap-1 text-[10px]"><span className="w-2 h-2 rounded-sm bg-up" />sector</span>
                  <span className="inline-flex items-center gap-1 text-[10px]"><span className="w-2 h-2 rounded-sm" style={{ background: "#5b8cff55" }} />market</span>
                </div>
                <SectorHorizonBars data={horizonData} />
              </div>
              <div className="lg:col-span-2 grid grid-cols-2 gap-2.5 content-start">
                {TIMEFRAMES.map(([k, sk, , label]) => {
                  const v = selData[sk];
                  const rel = v == null || market[k] == null ? null : v - market[k];
                  return (
                    <div key={k} className={`rounded-lg border p-2.5 ${k === tf ? "border-accent/60 bg-accent/5" : "border-line bg-panel2/30"}`}>
                      <div className="text-[10px] uppercase tracking-wide text-muted font-semibold">{label}</div>
                      <div className={`text-lg font-bold font-mono tabular-nums ${toneCls(v)}`}>{fmtPct(v)}</div>
                      {rel != null && (
                        <div className={`text-[10px] ${toneCls(rel)}`}>{rel >= 0 ? "▲" : "▼"} {fmtPct(rel)} vs mkt</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* secondary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                ["Breadth", `${selData.adv}/${selData.dec}`, `${selData.unch} flat`, selData.adv >= selData.dec ? "text-up" : "text-down"],
                ["Median score", selData.score == null ? "—" : selData.score.toFixed(0), "smart-money", "text-white"],
                ["From high", fmtPct(selData.from_high), "median", toneCls(selData.from_high)],
                ["Turnover", fmtCr(selData.turnover_cr), "today", "text-white"],
                ["Market cap", fmtCr(selData.mktcap_cr), "aggregate", "text-white"],
                ["Inst flow", fmtFlow(selData.inst_net_cr), "net", selData.inst_net_cr == null ? "text-white" : selData.inst_net_cr >= 0 ? "text-up" : "text-down"],
              ].map(([label, val, sub, tone]) => (
                <div key={label} className="rounded-lg border border-line bg-panel2/25 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted font-semibold">{label}</div>
                  <div className={`text-base font-bold font-mono tabular-nums leading-tight ${tone}`}>{val}</div>
                  <div className="text-[10px] text-muted mt-0.5">{sub}</div>
                </div>
              ))}
            </div>

            {/* leaders / laggards */}
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ["Leaders", selData.leaders, "text-up", UP],
                ["Laggards", selData.laggards, "text-down", DOWN],
              ].map(([title, list, tone, rgb]) => {
                const mx = Math.max(1, ...(list || []).map((e) => Math.abs(e.ret_1y ?? 0)));
                return (
                  <div key={title} className="rounded-lg border border-line bg-panel2/20 p-3">
                    <div className={`text-xs font-semibold mb-2 ${tone}`}>{title} · trailing 1Y</div>
                    <div className="space-y-1.5">
                      {(list || []).map((e) => (
                        <div key={e.symbol} className="flex items-center gap-2 text-xs">
                          <div className="w-24 shrink-0 truncate">
                            <SymbolLink symbol={e.symbol} name={e.company} />
                          </div>
                          <div className="flex-1 h-1.5 rounded-full bg-line/60 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(Math.abs(e.ret_1y ?? 0) / mx) * 100}%`, background: `rgb(${rgb})` }} />
                          </div>
                          <span className={`w-14 text-right font-mono tabular-nums ${toneCls(e.ret_1y)}`}>{fmtPct(e.ret_1y)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* constituents */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted font-semibold">Constituents · sorted by {tfLabel} return</div>
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
                        <th key={k} className={`py-2 px-2 text-right font-semibold whitespace-nowrap ${k === tf ? "text-white" : ""}`}>{label}</th>
                      ))}
                      <th className="py-2 px-2 text-center font-semibold">Trend</th>
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
                        <td className={`py-1.5 px-2 text-right font-mono tabular-nums ${toneCls(e.pct_change)}`}>{fmtPct(e.pct_change)}</td>
                        {TIMEFRAMES.map(([k, , rk]) => (
                          <td
                            key={k}
                            className={`py-1.5 px-2 text-right font-mono tabular-nums rounded ${toneCls(e[rk])} ${k === tf ? "font-semibold" : "opacity-80"}`}
                            style={k === tf ? { backgroundColor: heat(e[rk], rankScale * 1.5, 0.04, 0.3) } : undefined}
                          >
                            {fmtPct(e[rk])}
                          </td>
                        ))}
                        <td className="py-1.5 px-2">
                          <div className="flex justify-center">
                            <Spark pts={[e.ret_1m, e.ret_3m, e.ret_6m, e.ret_1y]} w={46} h={16} strokeW={1.3} />
                          </div>
                        </td>
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
                Sector aggregates use the <span className="text-white">median</span> of each sector's liquid constituents, so one outlier can't distort the read.
                Descriptive analytics — <span className="text-white">not investment advice</span>.
              </span>
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
