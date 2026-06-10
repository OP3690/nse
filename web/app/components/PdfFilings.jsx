"use client";

import { useState } from "react";
import { filingsOverview } from "../lib/corpNarrative";

const Spans = ({ spans }) =>
  spans.map((sp, i) => (sp.c ? <span key={i} className={sp.c}>{sp.t}</span> : <span key={i}>{sp.t}</span>));

const PDF_TONE = {
  Positive: "chip-up",
  Negative: "chip-down",
  Neutral: "bg-line/40 text-muted",
  Mixed: "bg-amber-500/15 text-amber-400",
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};

// Collapsible "Read from PDF" for a single filing. Button (closed) → sentiment
// chip + trigger count; expanded → trigger chips + the extracted snippets that
// drove them, plus a link to open the actual document. Renders for every
// readable filing (neutral filings show an honest "no directional language").
export function PdfRead({ pdf, attachment }) {
  const [open, setOpen] = useState(false);
  if (!pdf) return null;
  const trg = pdf.triggers || [];
  const sentiment = pdf.sentiment || (trg.length ? null : "Neutral");
  const snippets = trg.filter((t) => t.snippet);

  return (
    <div className="mt-1.5 rounded-lg border border-line/60 bg-ink/30">
      <div className="flex items-center gap-1.5 flex-wrap px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-muted font-semibold hover:text-white transition-colors"
          aria-expanded={open}
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          Read from PDF
        </button>
        {sentiment && (
          <span className={`chip text-[9px] ${PDF_TONE[sentiment] || "bg-line/40 text-muted"}`}>
            {sentiment} tone
          </span>
        )}
        {!open &&
          trg.slice(0, 4).map((t, i) => (
            <span key={i} className={`chip text-[9px] ${t.polarity > 0 ? "chip-up" : "chip-down"}`}>
              {t.polarity > 0 ? "▲" : "▼"} {t.label}
            </span>
          ))}
        {!open && trg.length > 4 && <span className="text-[9px] text-muted">+{trg.length - 4}</span>}
        {attachment && (
          <a
            href={attachment}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-accent text-[10px] hover:underline whitespace-nowrap"
          >
            View document ↗
          </a>
        )}
      </div>

      {open && (
        <div className="px-2.5 pb-2 pt-0.5 border-t border-line/40">
          {trg.length ? (
            <>
              <div className="flex items-center gap-1.5 flex-wrap my-1.5">
                {trg.map((t, i) => (
                  <span key={i} className={`chip text-[9px] ${t.polarity > 0 ? "chip-up" : "chip-down"}`}>
                    {t.polarity > 0 ? "▲" : "▼"} {t.label}
                  </span>
                ))}
              </div>
              {snippets.map((t, i) => (
                <p key={i} className="text-[11px] text-muted/90 leading-snug mt-1">
                  <span className="text-muted/60">“</span>
                  {t.snippet}
                  <span className="text-muted/60">”</span>
                </p>
              ))}
            </>
          ) : (
            <p className="text-[11px] text-muted/80 leading-snug mt-1.5">
              No directional language detected in this filing — read as neutral.
            </p>
          )}
          {pdf.excerpt && (
            <p className="text-[10px] text-muted/60 leading-snug mt-1.5 italic">
              From the document: “{pdf.excerpt}…”
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Overall read synthesised across the latest readable PDF documents — a tally
// of net positive/negative triggers, the recurring themes, and a plain-English
// one-liner. Crowns the announcement timeline.
export function FilingsOverview({ corp, className = "" }) {
  const ov = filingsOverview(corp);
  if (!ov) return null;
  const { tone, toneChip, nDocs, nDirectional, nPos, nNeg, posThemes, negThemes, synthesis, range } = ov;

  return (
    <div className={`rounded-xl border border-accent/25 bg-accent/[0.04] p-3.5 ${className}`}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-accent font-semibold">
            Latest filings — overall read
          </span>
          <span className={`chip text-[10px] ${toneChip}`}>{tone}</span>
        </div>
        <span className="text-[10px] text-muted">
          {nDocs} document{nDocs === 1 ? "" : "s"}
          {range.from && range.to ? ` · ${fmtDate(range.from)} – ${fmtDate(range.to)}` : ""}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-muted mb-2">
        <Spans spans={synthesis} />
      </p>

      <div className="flex items-center gap-3 flex-wrap text-[11px]">
        <span className="text-muted">
          <span className="text-up font-semibold tabular-nums">{nPos}</span> positive
          {" · "}
          <span className="text-down font-semibold tabular-nums">{nNeg}</span> cautionary signal{nNeg === 1 ? "" : "s"}
          {" · "}
          <span className="text-white tabular-nums">{nDirectional}</span>/{nDocs} with direction
        </span>
      </div>

      {(posThemes.length > 0 || negThemes.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {posThemes.map((x) => (
            <span key={`p-${x.label}`} className="chip text-[9px] chip-up">
              ▲ {x.label}
              {x.count > 1 ? ` ×${x.count}` : ""}
            </span>
          ))}
          {negThemes.map((x) => (
            <span key={`n-${x.label}`} className="chip text-[9px] chip-down">
              ▼ {x.label}
              {x.count > 1 ? ` ×${x.count}` : ""}
            </span>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted/70 mt-2">
        A literal roll-up of words present in the filings — not investment advice.
      </p>
    </div>
  );
}
