"use client";

import { useState } from "react";
import StockTip from "./StockTip";
import InfoDot from "./InfoDot";
import { MarketNarrative } from "./CorpNarrative";

// ---- shared tone helpers ---------------------------------------------------
const setupTone = (v) =>
  v == null ? "text-muted" : v >= 70 ? "text-up" : v >= 55 ? "text-accent" : v >= 40 ? "text-white" : "text-down";
const setupBar = (v) =>
  v == null ? "#8a96ab" : v >= 70 ? "#16c784" : v >= 55 ? "#5b8cff" : v >= 40 ? "#8a96ab" : "#ea3943";
const leanTone = (lbl) =>
  lbl === "Leans positive" ? "text-up" : lbl === "Leans cautious" ? "text-down" : "text-muted";
const VERDICT_TONE = {
  "Delivered strong": "chip-up",
  Positive: "chip-up",
  Mixed: "bg-amber-500/15 text-amber-400",
  Disappointed: "chip-down",
};
const KIND_TONE = {
  Results: "bg-accent/15 text-accent",
  Buyback: "chip-up",
  Bonus: "chip-up",
  Split: "chip-up",
  Dividend: "chip-up",
  Fundraise: "bg-amber-500/15 text-amber-400",
  "M&A": "bg-[#c77dff]/15 text-[#c77dff]",
};

const fmtDays = (d) =>
  d == null ? "" : d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d}d`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
};

// Slim horizontal setup meter.
function SetupMeter({ value }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="flex items-center gap-2 min-w-[112px]">
      <div className="h-1.5 flex-1 rounded-full bg-line/60 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${v}%`, background: setupBar(value) }} />
      </div>
      <span className={`font-mono text-xs font-semibold tabular-nums ${setupTone(value)}`}>
        {value == null ? "—" : value.toFixed(0)}
      </span>
    </div>
  );
}

// ---- a single upcoming-event row ------------------------------------------
function UpcomingRow({ r }) {
  const soon = r.days_until != null && r.days_until <= 3;
  return (
    <div className="flex items-center gap-3 py-2.5 px-1 border-b border-line/50 last:border-0">
      <div className="w-[68px] shrink-0">
        <div className="font-mono text-sm text-white tabular-nums">{fmtDate(r.date)}</div>
        <div className={`text-[10px] ${soon ? "text-amber-400 font-semibold" : "text-muted"}`}>
          {fmtDays(r.days_until)}
        </div>
      </div>
      <span className={`chip text-[10px] shrink-0 ${KIND_TONE[r.kind] || "bg-line/40 text-muted"}`}>
        {r.kind}
      </span>
      <div className="min-w-0 flex-1">
        <StockTip symbol={r.symbol} name={r.company}
          className="font-semibold text-white text-sm hover:text-accent cursor-pointer" />
        <div className="text-[11px] text-muted truncate" title={r.purpose || undefined}>
          {r.sector || "—"}{r.purpose ? ` · ${r.purpose}` : ""}
        </div>
      </div>
      <div className="shrink-0 text-right hidden sm:block">
        <div className={`text-[11px] font-medium ${leanTone(r.lean_label)}`}>{r.lean_label}</div>
        <div className="text-[10px] text-muted font-mono tabular-nums">{r.lean_prob}% lean</div>
      </div>
      <div className="shrink-0">
        <SetupMeter value={r.setup} />
        <div className="text-[10px] text-muted text-right mt-0.5">{r.setup_label}</div>
      </div>
    </div>
  );
}

// ---- a verdict flag chip card ---------------------------------------------
function VerdictCard({ f, tone }) {
  return (
    <div className="rounded-xl border border-line bg-ink/30 p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <StockTip symbol={f.symbol} name={f.company}
          className="font-semibold text-white text-sm hover:text-accent cursor-pointer" />
        {f.verdict && (
          <span className={`chip text-[10px] ${VERDICT_TONE[f.verdict] || "bg-line/40 text-muted"}`}>
            {f.verdict}
          </span>
        )}
      </div>
      <div className="text-[11px] text-muted truncate">{f.sector || "—"}</div>
      {f.last_category && (
        <div className="text-[11px]">
          <span className={tone}>{f.last_category}</span>
          {f.last_headline && (
            <span className="text-muted" title={f.last_headline}> · {f.last_headline.slice(0, 70)}</span>
          )}
        </div>
      )}
      {!!f.verdict_reasons?.length && (
        <div className="flex flex-wrap gap-1">
          {f.verdict_reasons.map((r, i) => (
            <span key={i} className="text-[10px] text-muted font-mono">{r}{i < f.verdict_reasons.length - 1 ? " ·" : ""}</span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mt-0.5">
        <SetupMeter value={f.setup} />
      </div>
    </div>
  );
}

export default function EarningsEvents({ corp }) {
  const [tab, setTab] = useState("upcoming");
  if (!corp || !corp.stats) return null;

  const recommend = corp.recommend || [];
  const strong = corp.flags?.recent_strong || [];
  const weak = corp.flags?.recent_weak || [];
  const stats = corp.stats || {};

  const hasUpcoming = recommend.length > 0;
  const hasMoves = strong.length > 0 || weak.length > 0;
  if (!hasUpcoming && !hasMoves) return null;

  return (
    <section className="card p-5 border border-accent/25">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              Earnings &amp; Events
            </span>
            <span className="chip text-[10px] bg-accent/15 text-accent">Setup · Verdict</span>
            <InfoDot topic="screener.earnings" />
          </h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            Upcoming board meetings &amp; results ranked by the stock&apos;s pre-event{" "}
            <span className="text-white">accumulation setup</span>, plus a read on how names that just
            reported have been digested. Setup blends the smart-money score, model composite, 20-day
            up-probability, trend, delivery and F&amp;O posture — a structured read, not a prediction.
          </p>
        </div>
        <div className="text-right shrink-0 text-[11px] text-muted">
          <div><span className="font-mono text-white">{stats.calendar}</span> upcoming</div>
          <div><span className="font-mono text-white">{stats.results}</span> results tracked</div>
          <div><span className="font-mono text-white">{(stats.announcements_30d || 0).toLocaleString("en-IN")}</span> filings · 30d</div>
        </div>
      </div>

      {/* plain-English market read */}
      <MarketNarrative corp={corp} className="mb-3 leading-relaxed bg-ink/30 border border-line/60 rounded-lg px-3 py-2" />

      {/* tab switch */}
      <div className="flex gap-1.5 mb-3">
        {hasUpcoming && (
          <button onClick={() => setTab("upcoming")}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
              tab === "upcoming" ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>
            Upcoming · ranked by setup
          </button>
        )}
        {hasMoves && (
          <button onClick={() => setTab("moves")}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
              tab === "moves" ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>
            Recent verdicts
          </button>
        )}
      </div>

      {tab === "upcoming" && hasUpcoming && (
        <div className="rounded-xl border border-line/70 bg-panel2/40 px-3">
          {recommend.map((r) => <UpcomingRow key={`${r.symbol}-${r.date}`} r={r} />)}
        </div>
      )}

      {tab === "moves" && hasMoves && (
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-up font-semibold mb-2">
              Reported / news landed well
            </div>
            <div className="space-y-2">
              {strong.length
                ? strong.slice(0, 8).map((f) => <VerdictCard key={f.symbol} f={f} tone="text-up" />)
                : <div className="text-xs text-muted py-3">None flagged.</div>}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-down font-semibold mb-2">
              Soft reaction / adverse news
            </div>
            <div className="space-y-2">
              {weak.length
                ? weak.slice(0, 8).map((f) => <VerdictCard key={f.symbol} f={f} tone="text-down" />)
                : <div className="text-xs text-muted py-3">None flagged.</div>}
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted mt-4 flex items-start gap-1.5">
        <span className="text-amber-400 shrink-0">⚠</span>
        <span>
          Educational analytics, <span className="text-white">not investment advice</span>. The setup score
          and lean are transparent blends of existing signals — they describe accumulation and reaction, they
          do not forecast outcomes. Verify against the filing and do your own research; markets carry risk.
        </span>
      </p>
    </section>
  );
}
