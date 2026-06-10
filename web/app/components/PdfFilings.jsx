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

// Small, consistent section label used across every read body so the cached
// and live panels share one visual rhythm.
const FieldLabel = ({ children }) => (
  <div className="text-[9px] uppercase tracking-wider text-muted/70 font-semibold">{children}</div>
);

const Spinner = ({ className = "" }) => (
  <span className={`inline-block rounded-full border-[1.5px] border-accent border-t-transparent animate-spin ${className || "w-3 h-3"}`} />
);

// A quoted line from the filing with a polarity-coloured left rule and the
// matched signal terms highlighted. Used for both cached excerpts and the live
// read's key sentences, keeping them visually identical.
function Quote({ text, marks, polarity = 0 }) {
  const rule = polarity > 0 ? "border-up/60" : polarity < 0 ? "border-down/60" : "border-line";
  return (
    <p className={`border-l-2 ${rule} pl-2 text-[11px] text-muted/90 leading-relaxed`}>
      <Highlighted text={text} marks={marks} />
    </p>
  );
}

const toneChipClass = (sentiment) => PDF_TONE[sentiment] || "bg-line/40 text-muted";

// Fetch the actual filing PDF (server proxy warms an NSE session, extracts the
// text layer, and OCRs scanned English filings) and run the deterministic
// lexicon scan in the browser. Shared by the per-filing card below.
function useLiveRead(attachment) {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");

  async function run() {
    if (!attachment) return;
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
      setRes({ ...analyzePdfText(data.text), nPages: data.nPages, ocr: data.ocr });
      setStatus("done");
    } catch (e) {
      setErr(e?.message || "Could not read this filing.");
      setStatus("error");
    }
  }

  return { status, res, err, run };
}

// The body of a completed/loading/errored live read. Mirrors the cached body's
// label → chips → quotes rhythm for symmetry.
function LiveReadBody({ status, res, err }) {
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted/80">
        <Spinner />
        <span>Reading the filing…</span>
        <span className="text-muted/45">fetching &amp; analysing the PDF in your browser</span>
      </div>
    );
  }
  if (status === "error") return <p className="text-[11px] text-down/90 leading-snug">{err}</p>;
  if (status !== "done" || !res) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] uppercase tracking-wider text-accent font-semibold">Advanced read</span>
        {res.docType && <span className="chip text-[9px] bg-accent/15 text-accent">{res.docType}</span>}
        {res.sentiment && <span className={`chip text-[9px] ${toneChipClass(res.sentiment)}`}>{res.sentiment} tone</span>}
        {res.ocr && (
          <span className="chip text-[9px] bg-amber-500/15 text-amber-400" title="Text recovered from a scanned image via OCR">OCR</span>
        )}
        <span className="ml-auto text-[9px] text-muted/55 whitespace-nowrap">
          in your browser{res.nPages ? ` · ${res.nPages} pp` : ""}
        </span>
      </div>

      {res.keyWords.length > 0 ? (
        <div className="space-y-1">
          <FieldLabel>Key signals</FieldLabel>
          <div className="flex items-center gap-1.5 flex-wrap">
            {res.keyWords.map((w, i) => <TriggerChip key={i} t={w} />)}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted/80 leading-snug">No directional language detected — reads as neutral.</p>
      )}

      {res.keySentences.length > 0 && (
        <div className="space-y-1.5">
          <FieldLabel>Key sentences</FieldLabel>
          <div className="space-y-1.5">
            {res.keySentences.map((s, i) => (
              <Quote key={i} text={s.text} marks={s.marks} polarity={s.polarity} />
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] text-muted/50 leading-snug">
        Literal scan of words present in the filing — not investment advice.
      </p>
    </div>
  );
}

// Unified per-filing card. Every announcement that carries a PDF renders the
// same bordered bar: an identity label + (when available) the cached read's
// type/tone/signal chips on the left, and the document link + a small
// "Advanced read" trigger on the right. Expanding the cached read or running
// the live read reveals a full-width body section with matching structure, so
// the whole timeline reads as one symmetric system.
export function PdfRead({ pdf, attachment }) {
  const [open, setOpen] = useState(false);
  const live = useLiveRead(attachment);
  if (!pdf && !attachment) return null;

  const hasCached = Boolean(pdf);
  const trg = (pdf && pdf.triggers) || [];
  const sentiment = pdf ? pdf.sentiment || (trg.length ? null : "Neutral") : null;
  const snippets = trg.filter((t) => t.snippet);
  const liveOpen = live.status !== "idle";

  return (
    <div className="mt-1.5 rounded-lg border border-line/60 bg-ink/30 overflow-hidden">
      {/* header bar */}
      <div className="flex items-center gap-x-1.5 gap-y-1 flex-wrap px-2.5 py-1.5">
        {hasCached ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted font-semibold hover:text-white transition-colors"
            aria-expanded={open}
          >
            <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
            Read from PDF
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted/80 font-semibold">
            <span className="text-muted/40">▪</span>
            Filing PDF
          </span>
        )}

        {pdf?.doc_type && <span className="chip text-[9px] bg-accent/15 text-accent">{pdf.doc_type}</span>}
        {sentiment && <span className={`chip text-[9px] ${toneChipClass(sentiment)}`}>{sentiment} tone</span>}
        {hasCached && !open && trg.slice(0, 4).map((t, i) => <TriggerChip key={i} t={t} />)}
        {hasCached && !open && trg.length > 4 && <span className="text-[9px] text-muted">+{trg.length - 4}</span>}

        {/* right actions — document link + live-read trigger, kept together */}
        <div className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
          {attachment && (
            <a
              href={attachment}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent text-[10px] hover:underline"
            >
              View document ↗
            </a>
          )}
          {attachment && (live.status === "idle" || live.status === "error") && (
            <>
              <span className="text-line/60 text-[10px]">·</span>
              <button
                type="button"
                onClick={live.run}
                title="Fetch the PDF and analyse it in your browser"
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent hover:underline"
              >
                ⚡ {live.status === "error" ? "Retry" : "Advanced read"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* cached read body */}
      {hasCached && open && (
        <div className="px-2.5 pb-2.5 pt-2 border-t border-line/40 space-y-2.5">
          {trg.length ? (
            <>
              <div className="space-y-1">
                <FieldLabel>Signals</FieldLabel>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {trg.map((t, i) => <TriggerChip key={i} t={t} />)}
                </div>
              </div>
              {snippets.length > 0 && (
                <div className="space-y-1.5">
                  <FieldLabel>Excerpts</FieldLabel>
                  <div className="space-y-1.5">
                    {snippets.map((t, i) => (
                      <Quote key={i} text={t.snippet} polarity={t.polarity} marks={[t.phrase, t.amount].filter(Boolean)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-muted/80 leading-snug">
              No directional language detected in this filing — read as neutral.
            </p>
          )}
        </div>
      )}

      {/* live read body */}
      {liveOpen && (
        <div className="px-2.5 pb-2.5 pt-2 border-t border-line/40 bg-accent/[0.03]">
          <LiveReadBody status={live.status} res={live.res} err={live.err} />
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
