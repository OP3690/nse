import InfoDot from "./InfoDot";
import CorpNarrative, { StockThesis } from "./CorpNarrative";
import { finMargins } from "../lib/corpNarrative";

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
const POLARITY_DOT = (p) => (p > 0 ? "bg-up" : p < 0 ? "bg-down" : "bg-muted");
const PDF_TONE = {
  Positive: "chip-up",
  Negative: "chip-down",
  Neutral: "bg-amber-500/15 text-amber-400",
};

// The lexicon read of a filing's PDF: a sentiment chip, the matched trigger
// labels, and the actual extracted text snippets that drove them.
function PdfTriggers({ pdf }) {
  if (!pdf || !pdf.triggers?.length) return null;
  return (
    <div className="mt-1.5 rounded-lg border border-line/60 bg-ink/30 px-2.5 py-2">
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <span className="text-[9px] uppercase tracking-wide text-muted font-semibold">Read from PDF</span>
        {pdf.sentiment && (
          <span className={`chip text-[9px] ${PDF_TONE[pdf.sentiment] || "bg-line/40 text-muted"}`}>
            {pdf.sentiment} tone
          </span>
        )}
        {pdf.triggers.map((t, i) => (
          <span key={i} className={`chip text-[9px] ${t.polarity > 0 ? "chip-up" : "chip-down"}`}>
            {t.polarity > 0 ? "▲" : "▼"} {t.label}
          </span>
        ))}
      </div>
      {pdf.triggers.filter((t) => t.snippet).slice(0, 2).map((t, i) => (
        <p key={i} className="text-[11px] text-muted/90 leading-snug">
          <span className="text-muted/60">“</span>{t.snippet}<span className="text-muted/60">”</span>
        </p>
      ))}
    </div>
  );
}

const fmtCr = (n) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
const fmtYoY = (n) => (n == null ? null : `${n >= 0 ? "+" : ""}${Number(n).toFixed(0)}%`);
const yoyTone = (n) => (n == null ? "text-muted" : n >= 0 ? "text-up" : "text-down");
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};
const daysUntil = (iso) => {
  if (!iso) return null;
  try {
    const d = Math.ceil((new Date(`${iso}T00:00:00`) - Date.now()) / 86400000);
    return d;
  } catch {
    return null;
  }
};
const fmtDays = (d) => (d == null ? "" : d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

function SetupMeter({ value, label }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
        <span className={`font-mono text-sm font-semibold tabular-nums ${setupTone(value)}`}>
          {value == null ? "—" : value.toFixed(0)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-line/60 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${v}%`, background: setupBar(value) }} />
      </div>
    </div>
  );
}

// `corp` is the per-stock summary block emitted by analyze.emit_histories.
export default function ManagementSummary({ corp }) {
  if (!corp) return null;
  const { next_event: nxt, verdict: vd, financials: fin, timeline = [] } = corp;
  const hasFin = fin && (fin.revenue != null || fin.pat != null || fin.pbt != null);
  const mgn = finMargins(fin);
  const nd = nxt ? daysUntil(nxt.date) : null;

  return (
    <section className="card border border-accent/25">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h2 className="card-title mb-0 flex items-center gap-2">
          <span>Management &amp; Financial Summary</span>
          <InfoDot topic="stock.corp_summary" />
        </h2>
        <span className="text-[11px] text-muted">From NSE/BSE corporate disclosures</span>
      </div>

      {/* plain-English synthesis of everything below */}
      <CorpNarrative corp={corp} className="mb-4" />

      {/* bull / bear factor decomposition */}
      <StockThesis corp={corp} className="mb-4" />

      {/* setup + lean + verdict row */}
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <div className="rounded-xl border border-line bg-ink/30 p-3">
          <SetupMeter value={corp.setup} label="Pre-event setup" />
          <div className="text-[11px] text-muted mt-1">{corp.setup_label || "—"}</div>
        </div>
        <div className="rounded-xl border border-line bg-ink/30 p-3 flex flex-col justify-center">
          <span className="text-[11px] uppercase tracking-wide text-muted">Model lean</span>
          <span className={`font-mono text-lg font-bold tabular-nums ${leanTone(corp.lean_label)}`}>
            {corp.lean_prob != null ? `${corp.lean_prob}%` : "—"}
          </span>
          <span className={`text-[11px] ${leanTone(corp.lean_label)}`}>{corp.lean_label || ""}</span>
        </div>
        <div className="rounded-xl border border-line bg-ink/30 p-3 flex flex-col justify-center">
          <span className="text-[11px] uppercase tracking-wide text-muted">Post-event verdict</span>
          {vd ? (
            <>
              <span className={`chip text-[11px] w-fit mt-1 ${VERDICT_TONE[vd.label] || "bg-line/40 text-muted"}`}>
                {vd.label}
              </span>
              {!!vd.reasons?.length && (
                <span className="text-[11px] text-muted mt-1 font-mono">{vd.reasons.join(" · ")}</span>
              )}
            </>
          ) : (
            <span className="text-sm text-muted mt-1">No recent event</span>
          )}
        </div>
      </div>

      {/* next event banner */}
      {nxt && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className={`chip text-[10px] ${KIND_TONE[nxt.kind] || "bg-line/40 text-muted"}`}>{nxt.kind}</span>
          <div className="min-w-0">
            <div className="text-sm text-white font-medium">
              Next event: {fmtDate(nxt.date)}{" "}
              <span className={nd != null && nd <= 3 ? "text-amber-400 font-semibold" : "text-muted"}>
                ({fmtDays(nd)})
              </span>
            </div>
            {nxt.purpose && <div className="text-[11px] text-muted truncate">{nxt.purpose}</div>}
          </div>
        </div>
      )}

      {/* financial snapshot */}
      {hasFin && (
        <div className="mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h3 className="text-sm font-semibold text-white">Latest reported quarter</h3>
            <span className="text-[11px] text-muted">
              {fin.quarter || ""}{fin.fy ? ` · ${fin.fy}` : ""}
              {fin.consolidated ? ` · ${fin.consolidated}` : ""}
              {fin.period_end ? ` · ended ${fmtDate(fin.period_end)}` : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FinCell label="Revenue" value={fmtCr(fin.revenue)} yoy={fmtYoY(fin.revenue_yoy)} tone={yoyTone(fin.revenue_yoy)} />
            <FinCell label="PBT" value={fmtCr(fin.pbt)} sub={mgn?.pbtMargin != null ? `${mgn.pbtMargin.toFixed(1)}% margin` : null} />
            <FinCell label="PAT" value={fmtCr(fin.pat)} yoy={fmtYoY(fin.pat_yoy)} tone={yoyTone(fin.pat_yoy)} />
            <FinCell label="Total income" value={fmtCr(fin.income)} />
          </div>
          {mgn?.patMargin != null && (
            <div className="mt-2 flex items-center gap-2 flex-wrap text-[12px]">
              <span className="text-muted">Net (PAT) margin</span>
              <span className="font-mono font-semibold text-white tabular-nums">{mgn.patMargin.toFixed(1)}%</span>
              {mgn.patMarginYoY != null && (
                <span className={`font-mono ${yoyTone(mgn.patMarginYoY)}`}>
                  {mgn.patMarginYoY >= 0 ? "+" : ""}{mgn.patMarginYoY.toFixed(1)}pp YoY
                  <span className="text-muted ml-1">({mgn.patMarginYoY >= 0 ? "expanding" : "compressing"})</span>
                </span>
              )}
            </div>
          )}
          <p className="text-[11px] text-muted mt-2">
            Headline numbers parsed best-effort from the filing&apos;s XBRL. Margins computed as a % of
            revenue; the YoY swing reconstructs the year-ago figure from the reported growth rates.
          </p>
        </div>
      )}

      {/* announcement timeline */}
      {!!timeline.length && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-2">Recent announcements</h3>
          <div className="space-y-2">
            {timeline.map((a, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${POLARITY_DOT(a.polarity)}`} />
                <div className="w-[78px] shrink-0 text-[11px] text-muted font-mono pt-0.5">{fmtDate(a.date)}</div>
                <span className="chip text-[10px] shrink-0 bg-line/40 text-muted">{a.category}</span>
                <div className="min-w-0 flex-1">
                  <span className="text-white/90">{a.headline || "—"}</span>
                  {a.attachment && (
                    <a href={a.attachment} target="_blank" rel="noopener noreferrer"
                      className="text-accent text-[11px] ml-1.5 hover:underline whitespace-nowrap">PDF ↗</a>
                  )}
                  <PdfTriggers pdf={a.pdf} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted mt-4">
        Setup, lean and verdict are transparent reads of accumulation and market reaction —
        <span className="text-white"> not investment advice</span> or a price target.
      </p>
    </section>
  );
}

function FinCell({ label, value, yoy, tone, sub }) {
  return (
    <div className="rounded-lg border border-line/70 bg-panel2/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="font-mono text-sm font-semibold text-white tabular-nums">{value}</div>
      {yoy && <div className={`text-[11px] font-mono ${tone}`}>{yoy} YoY</div>}
      {sub && <div className="text-[11px] font-mono text-muted">{sub}</div>}
    </div>
  );
}
