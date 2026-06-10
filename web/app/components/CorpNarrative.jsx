import { stockNarrative, marketNarrative, stockThesis, stockIntelligence } from "../lib/corpNarrative";

const Spans = ({ spans }) =>
  spans.map((sp, i) => (sp.c ? <span key={i} className={sp.c}>{sp.t}</span> : <span key={i}>{sp.t}</span>));

// Crown of the summary: the weighted synthesis. Reconciles every corp signal
// into one stance + confidence, names the drivers/risks, and — when they
// disagree — surfaces the tension instead of averaging it away.
const STANCE_CHIP = {
  Constructive: "chip-up",
  "Leans constructive": "chip-up",
  Balanced: "bg-line/40 text-muted",
  Conflicted: "bg-amber-500/15 text-amber-400",
  "Leans cautious": "chip-down",
  Cautious: "chip-down",
};
const CONF_TONE = { High: "text-up", Moderate: "text-accent", Low: "text-muted" };
const CONF_BAR = { High: "#16c784", Moderate: "#5b8cff", Low: "#8a96ab" };

export function IntelligenceVerdict({ corp, className = "" }) {
  const iq = stockIntelligence(corp);
  if (!iq) return null;
  const { stance, confidence, synthesis, tension, factors } = iq;
  return (
    <div className={`rounded-xl border border-accent/30 bg-gradient-to-br from-accent/[0.08] to-transparent p-4 ${className}`}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-accent font-semibold">Intelligence read</span>
          <span className={`chip text-[11px] ${STANCE_CHIP[stance.label] || "bg-line/40 text-muted"}`}>
            {stance.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-muted">Confidence</span>
          <div className="h-1.5 w-16 rounded-full bg-line/60 overflow-hidden">
            <div className="h-full rounded-full"
              style={{ width: `${confidence.pct}%`, background: CONF_BAR[confidence.label] }} />
          </div>
          <span className={`text-[11px] font-semibold ${CONF_TONE[confidence.label]}`}>{confidence.label}</span>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted"><Spans spans={synthesis} /></p>
      {tension && (
        <p className="mt-2 text-[13px] leading-snug rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
          <Spans spans={tension} />
        </p>
      )}
      <p className="text-[10px] text-muted/70 mt-2">
        Weighted across {factors} signal{factors === 1 ? "" : "s"} — a transparent synthesis of data already shown
        below, <span className="text-muted">not investment advice</span>.
      </p>
    </div>
  );
}

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
