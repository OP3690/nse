"use client";

import StockTip from "./StockTip";
import InfoDot from "./InfoDot";

const setupTone = (v) =>
  v == null ? "text-muted" : v >= 70 ? "text-up" : v >= 55 ? "text-accent" : v >= 40 ? "text-white" : "text-down";
const VERDICT_TONE = {
  "Delivered strong": "text-up",
  Positive: "text-up",
  Mixed: "text-amber-400",
  Disappointed: "text-down",
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

const fmtDays = (d) => (d == null ? "" : d <= 0 ? "today" : d === 1 ? "1d" : `${d}d`);
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
};

function Col({ title, dot, children, empty }) {
  return (
    <div className="mini-card">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-sm font-bold text-white">{title}</span>
      </div>
      <div className="space-y-1.5">{children?.length ? children : <div className="text-xs text-muted">{empty}</div>}</div>
    </div>
  );
}

export default function EarningsRadar({ corp }) {
  if (!corp || !corp.stats) return null;
  const recommend = corp.recommend || [];
  const strong = corp.flags?.recent_strong || [];
  const weak = corp.flags?.recent_weak || [];
  if (!recommend.length && !strong.length && !weak.length) return null;

  return (
    <section className="card border border-accent/25">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="card-title mb-0 flex items-center gap-2">
          <span className="inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            Earnings Radar
          </span>
          <InfoDot topic="dash.earnings_radar" />
        </h2>
        <a href="/screener" className="text-accent text-xs hover:underline">Open Screener →</a>
      </div>
      <p className="text-xs text-muted mb-3">
        Corporate events on the horizon and how recent reporters were received — flags from NSE/BSE
        disclosures, ranked by the stock&apos;s accumulation setup.
      </p>

      <div className="grid sm:grid-cols-3 gap-4">
        <Col title="Events soon" dot="bg-accent" empty="No upcoming events.">
          {recommend.slice(0, 6).map((r) => (
            <div key={`${r.symbol}-${r.date}`} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-1.5 min-w-0">
                <StockTip symbol={r.symbol} name={r.company}
                  className="font-medium text-white hover:text-accent cursor-pointer truncate" />
                <span className={`chip text-[9px] shrink-0 ${KIND_TONE[r.kind] || "bg-line/40 text-muted"}`}>{r.kind}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-muted font-mono">{fmtDate(r.date)}·{fmtDays(r.days_until)}</span>
                <span className={`font-mono text-xs font-semibold tabular-nums ${setupTone(r.setup)}`}>{r.setup?.toFixed(0)}</span>
              </div>
            </div>
          ))}
        </Col>

        <Col title="Reported well" dot="bg-up" empty="None flagged.">
          {strong.slice(0, 6).map((f) => (
            <div key={f.symbol} className="flex items-center justify-between gap-2 text-sm">
              <StockTip symbol={f.symbol} name={f.company}
                className="font-medium text-white hover:text-accent cursor-pointer truncate" />
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] ${VERDICT_TONE[f.verdict] || "text-muted"}`}>{f.verdict || f.last_category}</span>
                <span className={`font-mono text-xs font-semibold tabular-nums ${setupTone(f.setup)}`}>{f.setup?.toFixed(0)}</span>
              </div>
            </div>
          ))}
        </Col>

        <Col title="Soft / adverse" dot="bg-down" empty="None flagged.">
          {weak.slice(0, 6).map((f) => (
            <div key={f.symbol} className="flex items-center justify-between gap-2 text-sm">
              <StockTip symbol={f.symbol} name={f.company}
                className="font-medium text-white hover:text-accent cursor-pointer truncate" />
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] ${VERDICT_TONE[f.verdict] || "text-down"}`}>{f.verdict || f.last_category}</span>
                <span className={`font-mono text-xs font-semibold tabular-nums ${setupTone(f.setup)}`}>{f.setup?.toFixed(0)}</span>
              </div>
            </div>
          ))}
        </Col>
      </div>

      <p className="text-[11px] text-muted mt-3">
        Educational flags, <span className="text-white">not investment advice</span>. The number is the
        0-100 setup score; verdict reads market reaction, not the filing&apos;s merit.
      </p>
    </section>
  );
}
