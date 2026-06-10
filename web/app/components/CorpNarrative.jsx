import { stockNarrative, marketNarrative, stockThesis } from "../lib/corpNarrative";

const Spans = ({ spans }) =>
  spans.map((sp, i) => (sp.c ? <span key={i} className={sp.c}>{sp.t}</span> : <span key={i}>{sp.t}</span>));

// Per-stock plain-English summary paragraph (Management & Financial panel).
export default function CorpNarrative({ corp, className = "" }) {
  const sentences = stockNarrative(corp);
  if (!sentences.length) return null;
  return (
    <div className={`rounded-xl border border-accent/20 bg-accent/[0.04] p-3.5 ${className}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        <span className="text-[11px] uppercase tracking-wide text-accent font-semibold">In a nutshell</span>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        {sentences.map((s, i) => (
          <span key={i}>
            <Spans spans={s} />{i < sentences.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    </div>
  );
}

// Two-column bull / bear thesis — "What supports it" vs "What to watch".
// Each side lists transparent factors decomposed from the corp summary.
export function StockThesis({ corp, className = "" }) {
  const { support, watch, context } = stockThesis(corp);
  if (!support.length && !watch.length && !context.length) return null;

  const Side = ({ title, rows, dot, head, empty }) => (
    <div className="rounded-xl border border-line bg-ink/30 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className={`text-[11px] uppercase tracking-wide font-semibold ${head}`}>{title}</span>
      </div>
      {rows.length ? (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="text-[13px] leading-snug text-muted flex gap-1.5">
              <span className={`shrink-0 ${head}`}>•</span>
              <span><Spans spans={r.spans} /></span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-[12px] text-muted/70 italic">{empty}</div>
      )}
    </div>
  );

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] uppercase tracking-wide text-accent font-semibold">Setup thesis</span>
        <span className="text-[11px] text-muted">— decomposed, not a recommendation</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Side title="What supports it" rows={support} dot="bg-up" head="text-up"
          empty="No clearly supportive factors right now." />
        <Side title="What to watch" rows={watch} dot="bg-down" head="text-down"
          empty="No notable risk flags right now." />
      </div>
      {!!context.length && (
        <div className="mt-2 rounded-lg border border-line/70 bg-panel2/30 px-3 py-2">
          <span className="text-[10px] uppercase tracking-wide text-muted font-semibold mr-2">Context</span>
          {context.map((r, i) => (
            <span key={r.key} className="text-[12px] text-muted">
              {i > 0 ? " · " : ""}<Spans spans={r.spans} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Market-wide one-liner for dashboard / screener headers.
export function MarketNarrative({ corp, className = "" }) {
  const spans = marketNarrative(corp);
  if (!spans.length) return null;
  return (
    <p className={`text-xs text-muted ${className}`}>
      <Spans spans={spans} />
    </p>
  );
}
