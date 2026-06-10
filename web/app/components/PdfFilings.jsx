"use client";

import { useState } from "react";
import { filingsOverview } from "../lib/corpNarrative";
import { analyzePdfText } from "../lib/pdfReader";

const Spans = ({ spans }) =>
  spans.map((sp, i) => (sp.c ? <span key={i} className={sp.c}>{sp.t}</span> : <span key={i}>{sp.t}</span>));

// Render a sentence with the matched signal terms (phrases + amounts) emphasised
// so the reader sees the exact words that drove the read.
function Highlighted({ text, marks }) {
  if (!marks || !marks.length) return <>{text}</>;
  const clean = marks.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!clean.length) return <>{text}</>;
  const esc = clean.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const lookup = new Set(clean.map((m) => m.toLowerCase()));
  const parts = text.split(new RegExp(`(${esc.join("|")})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        lookup.has(part.toLowerCase()) ? (
          <mark key={i} className="bg-accent/20 text-white rounded px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

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

// A single trigger chip — label plus the monetary figure when the reader found
// one in context (e.g. an order's value).
const TriggerChip = ({ t }) => (
  <span className={`chip text-[9px] ${t.polarity > 0 ? "chip-up" : "chip-down"}`}>
    {t.polarity > 0 ? "▲" : "▼"} {t.label}
    {t.amount ? <span className="font-semibold"> · {t.amount}</span> : null}
  </span>
);

// Live, in-browser "advanced read". The button fetches the actual filing PDF
// (via a server proxy that warms an NSE session and extracts text), then runs
// the deterministic lexicon scan client-side — surfacing the document type,
// net tone, the key signal words (with any monetary figures) and the literal
// sentences that drove the read, with the matched terms highlighted.
export function PdfLiveRead({ attachment }) {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  if (!attachment) return null;

  async function run() {
    setStatus("loading");
    setErr("");
    try {
      const r = await fetch(`/api/pdf?url=${encodeURIComponent(attachment)}`);
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "Could not read this filing.");
      if (!data.hasText) {
        setRes(null);
        setErr("No readable text found in this filing, even after OCR.");
        setStatus("error");
        return;
      }
      const analysis = analyzePdfText(data.text);
      setRes({ ...analysis, nPages: data.nPages, ocr: data.ocr });
      setStatus("done");
    } catch (e) {
      setErr(e?.message || "Could not read this filing.");
      setStatus("error");
    }
  }

  const toneClass = res
    ? PDF_TONE[res.sentiment] || "bg-line/40 text-muted"
    : "bg-line/40 text-muted";

  return (
    <>
      {status !== "done" && (
        <button
          type="button"
          onClick={run}
          disabled={status === "loading"}
          title="Fetch the PDF and analyse it in your browser"
          className="inline-flex items-center gap-1 align-middle text-[10px] font-semibold text-accent hover:underline disabled:opacity-60 whitespace-nowrap"
        >
          {status === "loading" ? (
            <>
              <span className="inline-block w-2.5 h-2.5 rounded-full border border-accent border-t-transparent animate-spin" />
              reading…
            </>
          ) : (
            <>⚡ Advanced read</>
          )}
        </button>
      )}

      {status === "error" && (
        <p className="w-full basis-full text-[11px] text-down/90 leading-snug mt-1">{err}</p>
      )}

      {status === "done" && res && (
        <div className="w-full basis-full rounded-lg border border-accent/25 bg-accent/[0.05] p-2.5 mt-1.5">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className="text-[9px] uppercase tracking-wide text-accent font-semibold">
              Advanced read
            </span>
            {res.docType && (
              <span className="chip text-[9px] bg-accent/15 text-accent">{res.docType}</span>
            )}
            {res.sentiment && (
              <span className={`chip text-[9px] ${toneClass}`}>{res.sentiment} tone</span>
            )}
            {res.ocr && (
              <span className="chip text-[9px] bg-amber-500/15 text-amber-400" title="Text recovered from a scanned image via OCR">OCR</span>
            )}
            <span className="ml-auto text-[9px] text-muted/70">
              read in your browser{res.nPages ? ` · ${res.nPages} pp` : ""}
            </span>
          </div>

          {res.keyWords.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="text-[9px] uppercase tracking-wide text-muted">Key signals</span>
              {res.keyWords.map((w, i) => (
                <TriggerChip key={i} t={w} />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted/80 leading-snug mb-1.5">
              No directional language detected — reads as neutral.
            </p>
          )}

          {res.keySentences.length > 0 && (
            <>
              <span className="text-[9px] uppercase tracking-wide text-muted">Key sentences</span>
              <ul className="mt-1 space-y-1">
                {res.keySentences.map((s, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] text-muted/90 leading-snug">
                    <span
                      className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                        s.polarity > 0 ? "bg-up" : s.polarity < 0 ? "bg-down" : "bg-muted"
                      }`}
                    />
                    <span>
                      <span className="text-muted/60">“</span>
                      <Highlighted text={s.text} marks={s.marks} />
                      <span className="text-muted/60">”</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="text-[9px] text-muted/60 mt-2">
            Literal scan of words present in the filing — not investment advice.
          </p>
        </div>
      )}
    </>
  );
}

// Collapsible "Read from PDF" for a single filing. Button (closed) → filing-type
// + sentiment chips + the trigger labels; expanded → trigger chips (with any
// amounts) and the extracted snippets that drove them, plus a link to open the
// document. Renders for every readable filing (neutral ones say so honestly).
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
        {pdf.doc_type && (
          <span className="chip text-[9px] bg-accent/15 text-accent">{pdf.doc_type}</span>
        )}
        {sentiment && (
          <span className={`chip text-[9px] ${PDF_TONE[sentiment] || "bg-line/40 text-muted"}`}>
            {sentiment} tone
          </span>
        )}
        {!open && trg.slice(0, 4).map((t, i) => <TriggerChip key={i} t={t} />)}
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
        {/* small live-read button beside the document link; its result panel
            wraps to its own full-width line below (basis-full) */}
        {attachment && (
          <>
            <span className="text-line/60 text-[10px]">·</span>
            <PdfLiveRead attachment={attachment} />
          </>
        )}
      </div>

      {open && (
        <div className="px-2.5 pb-2 pt-0.5 border-t border-line/40">
          {trg.length ? (
            <>
              <div className="flex items-center gap-1.5 flex-wrap my-1.5">
                {trg.map((t, i) => <TriggerChip key={i} t={t} />)}
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
  const { tone, toneChip, nDocs, nDirectional, nPos, nNeg, posThemes, negThemes,
          synthesis, range, docTypes = [] } = ov;

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

      {docTypes.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <span className="text-[10px] uppercase tracking-wide text-muted">Covering</span>
          {docTypes.map((d) => (
            <span key={d} className="chip text-[9px] bg-accent/15 text-accent">{d}</span>
          ))}
        </div>
      )}

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
