"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import InfoDot from "./InfoDot";

const fmtCr = (n) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: n >= 100 ? 0 : 1 })} Cr`;

const BOARDS = ["All", "Mainboard", "SME"];
const SORTS = [
  ["strength", "IPO Strength"],
  ["ret_issue", "Return since IPO"],
  ["post_listing", "Since listing"],
  ["mom_20", "Recent momentum"],
  ["days_listed", "Most recent listing"],
  ["avg_turnover_cr", "Liquidity"],
];

const STRENGTH_TONE = {
  "Strong Momentum": "chip-up",
  Building: "chip-accent",
  Mixed: "chip-muted",
  Soft: "chip-amber",
  Weak: "chip-down",
};

function Ret({ value, big }) {
  if (value == null) return <span className="text-muted">—</span>;
  const up = value >= 0;
  return (
    <span className={`font-mono ${big ? "text-base font-bold" : "text-sm font-semibold"} ${up ? "text-up" : "text-down"}`}>
      {up ? "+" : ""}{value.toFixed(value > -100 && value < 1000 ? 1 : 0)}%
    </span>
  );
}

function StrengthBar({ value, label }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 rounded-full bg-line overflow-hidden">
        <div className="h-full bg-gradient-to-r from-accent to-up" style={{ width: `${v}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-white w-7 text-right">{v?.toFixed?.(0) ?? "—"}</span>
      {label && <span className={`chip ${STRENGTH_TONE[label] || "chip-muted"} text-[10px] hidden xl:inline-flex`}>{label}</span>}
    </div>
  );
}

// Inline SVG sparkline of close vs issue price (no chart lib needed).
function Spark({ series, issue }) {
  if (!series || series.length < 2) return <span className="text-muted/50 text-xs">—</span>;
  const ys = series.map((p) => p.c);
  const lo = Math.min(...ys, issue ?? Infinity);
  const hi = Math.max(...ys, issue ?? -Infinity);
  const W = 110, H = 30, pad = 2;
  const span = hi - lo || 1;
  const x = (i) => pad + (i / (series.length - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - lo) / span) * (H - 2 * pad);
  const d = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join(" ");
  const up = ys[ys.length - 1] >= ys[0];
  const stroke = up ? "#16c784" : "#ea3943";
  const issY = issue != null ? y(issue) : null;
  return (
    <svg width={W} height={H} className="overflow-visible">
      {issY != null && (
        <line x1={pad} x2={W - pad} y1={issY} y2={issY} stroke="#8a96ab" strokeDasharray="3 2" strokeWidth="1" opacity="0.5" />
      )}
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function BoardChip({ board }) {
  const cls = board === "Mainboard" ? "chip-accent" : board === "SME" ? "chip-amber" : "chip-muted";
  return <span className={`chip ${cls} text-[10px]`}>{board}</span>;
}

const PHASE_TONE = {
  Open: ["chip-up", "Open now"],
  Upcoming: ["chip-accent", "Upcoming"],
  Closed: ["chip-muted", "Closed"],
};

// Live subscription gauge — objective demand read, capped at 5× for the bar.
function SubGauge({ times, label }) {
  if (times == null) {
    return <span className="text-xs text-muted">Subscription not yet reported</span>;
  }
  const over = times >= 1;
  const w = Math.min(100, (times / 5) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-muted">Subscribed</span>
        <span className={`font-mono text-sm font-bold ${over ? "text-up" : "text-amber-400"}`}>{times.toFixed(2)}×</span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div className={`h-full rounded-full ${over ? "bg-up" : "bg-amber-400"}`} style={{ width: `${w}%` }} />
      </div>
      {label && <div className={`text-[10px] mt-1 ${over ? "text-up" : "text-amber-400"}`}>{label}</div>}
    </div>
  );
}

function UpcomingCard({ e }) {
  const [tone, phaseLabel] = PHASE_TONE[e.phase] || PHASE_TONE.Upcoming;
  return (
    <div className="mini-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-white truncate">{e.symbol || e.company}</div>
          <div className="text-[11px] text-muted truncate">{e.company}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`chip ${tone} text-[10px]`}>{phaseLabel}</span>
          <BoardChip board={e.board} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div>
          <div className="text-[10px] text-muted uppercase tracking-wide">Price Band</div>
          <div className="font-mono text-white">{e.price_range || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted uppercase tracking-wide">Window</div>
          <div className="text-white/90">{e.issue_start} → {e.issue_end}</div>
        </div>
      </div>
      <div className="mt-3">
        <SubGauge times={e.sub_times} label={e.sub_label} />
      </div>
      {e.phase === "Open" && e.days_to_close != null && (
        <div className="text-[11px] text-muted mt-2">
          {e.days_to_close > 0 ? `Closes in ${e.days_to_close} day${e.days_to_close === 1 ? "" : "s"}` : "Closes today"}
        </div>
      )}
    </div>
  );
}

function UpcomingIPOs({ upcoming }) {
  if (!upcoming || upcoming.length === 0) return null;
  const open = upcoming.filter((e) => e.phase === "Open");
  const soon = upcoming.filter((e) => e.phase !== "Open");
  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap"><span>Open & Upcoming IPOs</span><InfoDot topic="ipo.upcoming" /></h2>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            Live issues with price band, subscription window and current demand. These are the
            objective figures to weigh yourself — not a buy/skip call.
          </p>
        </div>
        <span className="chip chip-accent text-[10px] shrink-0">{upcoming.length} live</span>
      </div>
      {open.length > 0 && (
        <>
          <div className="text-xs font-bold text-up mb-2">Open for subscription</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {open.map((e) => <UpcomingCard key={e.symbol || e.company} e={e} />)}
          </div>
        </>
      )}
      {soon.length > 0 && (
        <>
          <div className="text-xs font-bold text-accent mb-2">Upcoming</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {soon.map((e) => <UpcomingCard key={e.symbol || e.company} e={e} />)}
          </div>
        </>
      )}
      <p className="text-[10px] text-muted mt-4 leading-relaxed">
        Subscription multiple is the live “Total” demand reported by NSE; oversubscription signals
        strong demand but does not predict listing performance. Figures are observations, not investment advice.
      </p>
    </section>
  );
}

// Podium accents for the top three strength leaders — gold / silver / bronze.
const MEDAL = {
  1: { badge: "bg-amber-400/20 text-amber-300 border-amber-400/40", ring: "border-amber-400/30", glow: "bg-amber-400/10" },
  2: { badge: "bg-slate-300/20 text-slate-200 border-slate-300/40", ring: "border-slate-300/25", glow: "bg-slate-300/10" },
  3: { badge: "bg-orange-400/20 text-orange-300 border-orange-400/40", ring: "border-orange-400/25", glow: "bg-orange-400/10" },
};

function LeaderCard({ e, rank }) {
  const m = MEDAL[rank];
  return (
    <Link href={`/stock/${e.symbol}`}
      className={`mini-card relative block overflow-hidden transition group hover:-translate-y-0.5 hover:border-accent/50 ${m ? m.ring : ""}`}>
      {m && <div className={`absolute -top-10 -right-8 w-28 h-28 rounded-full blur-2xl pointer-events-none ${m.glow}`} />}
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md border text-[10px] font-bold shrink-0 ${m ? m.badge : "border-line text-muted"}`}>
              {rank}
            </span>
            <span className="font-bold text-white group-hover:text-accent truncate">{e.symbol}</span>
          </div>
          <div className="text-[11px] text-muted truncate mt-0.5">{e.company || e.sector || "—"}</div>
        </div>
        <BoardChip board={e.board} />
      </div>
      <div className="relative mt-3 flex items-end justify-between">
        <div>
          <div className="text-[10px] text-muted uppercase tracking-wide">Since IPO</div>
          <Ret value={e.ret_issue} big />
        </div>
        <Spark series={e.series} issue={e.issue_price} />
      </div>
      <div className="relative mt-3">
        <StrengthBar value={e.strength} label={e.strength_label} />
      </div>
    </Link>
  );
}

export default function IpoView({ ipo }) {
  const [board, setBoard] = useState("All");
  const [sortKey, setSortKey] = useState("strength");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toUpperCase();
    let r = (ipo.items || []).filter((e) => {
      if (board !== "All" && e.board !== board) return false;
      if (term && !e.symbol.includes(term) && !(e.company || "").toUpperCase().includes(term)) return false;
      return true;
    });
    return [...r].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      return vb - va;
    });
  }, [ipo.items, board, sortKey, q]);

  const s = ipo.summary || {};
  const leaders = (ipo.items || []).slice(0, 6);

  return (
    <div className="space-y-6">
      {/* open & upcoming IPOs */}
      <UpcomingIPOs upcoming={ipo.upcoming} />

      {/* summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-tile">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent/80 to-transparent" />
          <div className="stat-label flex items-center justify-between gap-1.5"><span className="truncate">Recent Listings</span><InfoDot topic="ipo.summary" /></div>
          <div className="stat-value text-white">{s.count}</div>
          <div className="text-xs text-muted">{s.mainboard} mainboard · {s.sme} SME</div>
        </div>
        <div className="stat-tile">
          <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${s.above_issue_pct >= 50 ? "from-up/80" : "from-down/80"} to-transparent`} />
          <div className="stat-label">Above Issue Price</div>
          <div className={`stat-value ${s.above_issue_pct >= 50 ? "text-up" : "text-down"}`}>{s.above_issue_pct}%</div>
          <div className="text-xs text-muted">{s.above_issue} of {s.count} in the green</div>
        </div>
        <div className="stat-tile">
          <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${(s.median_ret ?? 0) >= 0 ? "from-up/80" : "from-down/80"} to-transparent`} />
          <div className="stat-label">Median Return</div>
          <div className={`stat-value ${(s.median_ret ?? 0) >= 0 ? "text-up" : "text-down"}`}>
            {(s.median_ret ?? 0) >= 0 ? "+" : ""}{s.median_ret}%
          </div>
          <div className="text-xs text-muted">since issue price</div>
        </div>
        <div className="stat-tile">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-up/80 via-down/40 to-transparent" />
          <div className="stat-label">Best & Worst</div>
          <div className="mt-1 space-y-1.5">
            <Link href={`/stock/${s.best?.symbol}`} className="flex items-center justify-between gap-2 group">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-up text-xs">▲</span>
                <span className="font-semibold text-white group-hover:text-accent truncate">{s.best?.symbol}</span>
              </span>
              <span className="font-mono text-sm font-bold text-up tabular-nums shrink-0">+{s.best?.ret}%</span>
            </Link>
            <Link href={`/stock/${s.worst?.symbol}`} className="flex items-center justify-between gap-2 group">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-down text-xs">▼</span>
                <span className="font-semibold text-white group-hover:text-accent truncate">{s.worst?.symbol}</span>
              </span>
              <span className="font-mono text-sm font-bold text-down tabular-nums shrink-0">{s.worst?.ret}%</span>
            </Link>
          </div>
        </div>
      </div>

      {/* leaderboard */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><span>Top Strength Leaders</span><InfoDot topic="ipo.leaders" /></h2>
          <span className="chip chip-up text-[10px]">Highest cross-sectional rank</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {leaders.map((e, i) => <LeaderCard key={e.symbol} e={e} rank={i + 1} />)}
        </div>
      </section>

      {/* controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-panel border border-line rounded-lg p-1">
          {BOARDS.map((b) => (
            <button key={b} onClick={() => setBoard(b)}
              className={`px-3 py-1 rounded-md text-sm transition ${board === b ? "bg-accent/15 text-white font-medium" : "text-muted hover:text-white"}`}>
              {b}
            </button>
          ))}
        </div>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}
          className="bg-panel border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent">
          {SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol or company…"
          className="bg-panel border border-line rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:border-accent" />
        <span className="text-xs text-muted ml-auto">{rows.length} listings</span>
      </div>

      {/* ranked table */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-panel z-10">
            <tr>
              <th className="th">#</th>
              <th className="th">Stock</th>
              <th className="th hidden md:table-cell">Listed</th>
              <th className="th text-right">Issue → Now</th>
              <th className="th text-right">Since IPO</th>
              <th className="th text-right hidden lg:table-cell">Post-listing</th>
              <th className="th text-right hidden lg:table-cell">Deliv %</th>
              <th className="th text-right hidden xl:table-cell">Turnover</th>
              <th className="th"><span className="inline-flex items-center gap-1.5">Strength <InfoDot topic="ipo.strength" /></span></th>
              <th className="th hidden sm:table-cell">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={e.symbol} className={`align-middle transition-colors hover:bg-panel2/60 ${i % 2 ? "bg-panel2/20" : ""}`}>
                <td className="td font-mono text-xs">
                  {i < 3
                    ? <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md border text-[10px] font-bold ${MEDAL[i + 1].badge}`}>{i + 1}</span>
                    : <span className="text-muted">{i + 1}</span>}
                </td>
                <td className="td">
                  <div className="flex items-center gap-2">
                    <Link href={`/stock/${e.symbol}`} className="font-semibold hover:text-accent">{e.symbol}</Link>
                    <BoardChip board={e.board} />
                  </div>
                  <div className="text-[11px] text-muted max-w-[170px] truncate">{e.company || e.sector || "—"}</div>
                </td>
                <td className="td hidden md:table-cell">
                  <div className="text-xs text-white">{e.listing_date}</div>
                  <div className="text-[11px] text-muted">{e.days_listed}d ago · {e.sessions} sess</div>
                </td>
                <td className="td text-right font-mono text-xs">
                  <span className="text-muted">{e.issue_price?.toLocaleString("en-IN")}</span>
                  <span className="text-muted/50"> → </span>
                  <span className="text-white">{e.close?.toLocaleString("en-IN")}</span>
                </td>
                <td className="td text-right"><Ret value={e.ret_issue} /></td>
                <td className="td text-right hidden lg:table-cell"><Ret value={e.post_listing} /></td>
                <td className="td text-right font-mono text-xs hidden lg:table-cell">
                  {e.deliv_recent != null ? `${e.deliv_recent.toFixed(0)}%` : "—"}
                </td>
                <td className="td text-right font-mono text-xs text-muted hidden xl:table-cell">{fmtCr(e.avg_turnover_cr)}</td>
                <td className="td"><StrengthBar value={e.strength} label={e.strength_label} /></td>
                <td className="td hidden sm:table-cell"><Spark series={e.series} issue={e.issue_price} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
