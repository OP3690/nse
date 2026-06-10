// Client-side filing reader — a faithful JavaScript port of the pipeline's
// deterministic lexicon scan (pipeline/corp_pdf.py), extended with a "key
// words & sentences" extractor for the live, in-browser read.
//
// This is NOT an LLM and NOT investment advice. It is a transparent scan: we
// look for a fixed list of plain-English phrases that, in the language of
// Indian exchange filings, tend to accompany a constructive or adverse
// development, negation-guard them, attach the nearest monetary figure, and
// surface the literal sentences that drove the read. Every output is a
// quotable read of words actually present in the document.

const POSITIVE_TRIGGERS = [
  ["Order win", ["received an order", "order worth", "order valued at", "bagged",
    "secured a contract", "secured an order", "letter of intent",
    "work order", "purchase order from", "received a work order",
    "received a purchase order", "awarded the contract", "awarded a contract",
    "order intake", "won a contract", "emerged as the lowest bidder",
    "emerged l1", "declared l1", "order book of", "strong order book",
    "robust order book"]],
  ["Record performance", ["record revenue", "highest ever", "record profit",
    "all-time high", "all time high", "best ever",
    "highest quarterly", "record quarter"]],
  ["Profit growth", ["profit grew", "profit increased", "profit rose",
    "pat grew", "net profit rose", "net profit grew",
    "growth in net profit", "robust growth in", "strong growth in"]],
  ["Margin expansion", ["margin expansion", "margins improved", "margin improved",
    "improvement in margin", "ebitda margin improved",
    "operating margin improved"]],
  ["Capacity expansion", ["capacity expansion", "commercial production",
    "commenced production", "commenced commercial operation",
    "commissioning of", "plant commissioned", "unit commissioned",
    "greenfield", "brownfield", "expand capacity",
    "capacity addition", "debottlenecking",
    "new manufacturing facility", "new plant at"]],
  ["Debt reduction", ["debt reduction", "reduced debt", "debt free", "debt-free",
    "prepayment of debt", "prepaid debt", "deleveraging",
    "repaid borrowings", "reduction in borrowings",
    "net debt reduced", "becoming debt free"]],
  ["Capital return", ["buyback", "buy-back", "buy back of", "interim dividend",
    "final dividend", "special dividend", "recommended a dividend",
    "bonus issue", "bonus share"]],
  ["Strategic deal", ["strategic partnership", "entered into a joint venture",
    "formed a joint venture", "joint venture with", "50:50 joint venture",
    "definitive agreement", "long-term agreement", "long term supply",
    "signed an mou", "signed a mou", "memorandum of understanding",
    "supply agreement with", "acquisition of"]],
  ["Rating upgrade", ["rating upgrade", "upgraded the rating", "rating upgraded",
    "revised upward", "outlook revised to positive",
    "outlook upgraded"]],
  ["Guidance raise", ["raised guidance", "upgraded guidance", "guidance upward",
    "demand remains strong", "healthy demand outlook"]],
];

const NEGATIVE_TRIGGERS = [
  ["Resignation", ["resignation of", "has resigned", "tendered his resignation",
    "tendered her resignation", "stepped down", "stepping down",
    "cessation of", "demise of"]],
  ["Loss", ["net loss of", "reported a net loss", "incurred a net loss",
    "loss after tax of", "slipped into loss", "loss before tax of",
    "widening of loss"]],
  ["Default", ["default in payment", "default on", "failed to pay",
    "delay in payment", "delayed payment", "payment default"]],
  ["Insolvency", ["corporate insolvency", "insolvency proceedings",
    "insolvency resolution", "admitted under insolvency",
    "resolution professional", "liquidation", "winding up",
    "moratorium under section"]],
  ["Regulatory action", ["show cause notice", "penalty of", "imposed a penalty",
    "levied a penalty", "demand notice", "demand order",
    "gst demand", "gst notice", "income tax demand of",
    "sebi order", "adjudicating officer", "search and seizure",
    "summons"]],
  ["Audit concern", ["qualified opinion", "adverse opinion", "disclaimer of opinion",
    "material weakness", "material uncertainty related to going concern",
    "emphasis of matter"]],
  ["Litigation", ["filed a suit against", "writ petition", "ruling against the company",
    "tribunal ruled", "court ruled against", "class action",
    "order against the company", "material litigation", "adverse order"]],
  ["Pledge", ["pledge of shares", "invocation of pledge", "shares pledged",
    "creation of encumbrance", "encumbrance on shares"]],
  ["Rating downgrade", ["rating downgrade", "downgraded the rating", "rating downgraded",
    "revised downward", "outlook revised to negative",
    "negative outlook"]],
  ["Operations hit", ["plant shutdown", "suspension of operations", "halt production",
    "halted production", "lock-out", "lockout", "fire at",
    "force majeure", "disruption in operations"]],
  ["Fraud", ["instance of fraud", "instances of fraud", "fraud committed",
    "alleged fraud", "reported a fraud", "detected a fraud",
    "fraud against the company", "forensic audit", "misappropriation",
    "embezzlement", "siphoning of funds", "financial irregularit"]],
  ["Stake sale / exit", ["promoter stake sale", "sold its entire stake",
    "divestment of", "stake sale by promoter"]],
];

const DOC_TYPES = [
  ["Quarterly results", ["unaudited financial results", "audited financial results",
    "statement of standalone", "statement of consolidated",
    "financial results for the quarter", "statement of profit and loss"]],
  ["Order win", ["received an order", "work order", "letter of intent", "purchase order",
    "bagged", "secured a contract", "secured an order", "order worth",
    "awarded the contract", "emerged as the lowest"]],
  ["Dividend", ["recommended a dividend", "declared a dividend", "interim dividend",
    "final dividend", "record date for"]],
  ["Buyback", ["buy-back", "buyback"]],
  ["Fundraise", ["preferential issue", "qualified institutions placement", "qip",
    "rights issue", "raising of funds", "issue of equity shares",
    "convertible warrants", "fund raising"]],
  ["M&A / scheme", ["scheme of arrangement", "scheme of amalgamation", "acquisition of",
    "amalgamation", "slump sale", "demerger"]],
  ["Credit rating", ["credit rating", "rating action", "reaffirmed the rating",
    "assigned a rating", "rating rationale"]],
  ["Investor update", ["investor presentation", "earnings call", "analyst meet",
    "con. call", "conference call", "earnings conference",
    "transcript of", "investor meet"]],
  ["Leadership change", ["resignation of", "has resigned", "appointment of",
    "cessation of", "re-appointment"]],
  ["Board meeting", ["board meeting", "meeting of the board", "intimation of board"]],
];

const WS = /\s+/g;
const BOILERPLATE = /(regd\.?\s*off|register?ed\s+off|corporate\s+off|\bcin\b|e-?mail|website|www\.|https?:|tel\.?\s*[:\-]|phone|\bfax\b|listing\s+dep|the\s+secretary|bse\s+limited|national\s+stock\s+exchange|exchange\s+plaza|bandra|dalal\s+street|scrip\s+code|\bisin\b|dear\s+sir|corporate\s+relationship|department\s+of\s+corporate)/i;
const AMOUNT = /(?:₹|rs\.?|inr)?\s?([\d][\d,]{0,13}(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|million|mn|billion|bn)\b/i;
const NEG_GUARD = /\b(no|not|without|never|nor|fails?\s+to|failed\s+to|did\s+not|does\s+not|do\s+not|deferred|denied|cancell?ed|withdrawn|rejected|unable\s+to)\b/i;

const normalise = (text) => text.replace(WS, " ").toLowerCase();

function fmtAmount(num, unit) {
  const u = unit.toLowerCase();
  const disp = u.startsWith("cr") ? "Cr"
    : (u.startsWith("lakh") || u.startsWith("lac")) ? "Lakh"
    : (u === "million" || u === "mn") ? "Mn"
    : (u === "billion" || u === "bn") ? "Bn" : "";
  let n = num;
  if (n.includes(".")) n = n.replace(/0+$/, "").replace(/\.$/, "");
  return disp ? `₹${n} ${disp}`.trim() : `₹${n}`;
}

function nearestAmount(text, phrase, window = 200) {
  const low = text.toLowerCase();
  const i = low.indexOf(phrase.toLowerCase());
  if (i < 0) return null;
  const seg = text.slice(Math.max(0, i - Math.floor(window / 3)), i + phrase.length + window);
  const m = seg.match(AMOUNT);
  return m ? fmtAmount(m[1], m[2]) : null;
}

const negated = (norm, idx, back = 42) =>
  NEG_GUARD.test(norm.slice(Math.max(0, idx - back), idx));

function classify(norm) {
  for (const [label, keys] of DOC_TYPES) {
    if (keys.some((k) => norm.includes(k))) return label;
  }
  return null;
}

function cleanExcerpt(text, limit = 360) {
  const m = text.match(/\bsub(?:ject)?\s*[:\-]\s*(.+)/i);
  if (m) {
    const subj = m[1].replace(WS, " ").trim();
    if (subj.length >= 14) {
      return subj.length > limit ? subj.slice(0, limit).replace(/\s+\S*$/, "") : subj;
    }
  }
  const kept = text.split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter((ln) => ln && ln.length > 3 && !BOILERPLATE.test(ln));
  const body = kept.join(" ").replace(WS, " ").trim();
  return body.length > limit ? body.slice(0, limit).replace(/\s+\S*$/, "") : body;
}

function snippet(haystack, phrase, width = 140) {
  const i = haystack.toLowerCase().indexOf(phrase);
  if (i < 0) return "";
  const a = Math.max(0, i - Math.floor(width / 3));
  const b = Math.min(haystack.length, i + phrase.length + width);
  let frag = haystack.slice(a, b).trim().replace(WS, " ");
  if (a > 0) frag = "…" + frag;
  if (b < haystack.length) frag = frag + "…";
  return frag;
}

function firstHit(norm, phrases, guardNegation) {
  for (const p of phrases) {
    let idx = norm.indexOf(p);
    while (idx !== -1) {
      if (!(guardNegation && negated(norm, idx))) return p;
      idx = norm.indexOf(p, idx + 1);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Key-sentence extraction for the live read. Split the original text into
// candidate sentences, drop letterhead/boilerplate, then rank each by how much
// directional signal it carries (matched phrases + a monetary figure + being
// the filing's own subject line). Returns the strongest few, each tagged with
// the exact terms to highlight, so the reader sees *why* a sentence mattered.
function splitSentences(text) {
  const out = [];
  for (const block of text.split(/\r?\n+/)) {
    const line = block.replace(WS, " ").trim();
    if (!line) continue;
    for (const s of line.split(/(?<=[.!?;])\s+(?=[A-Z0-9₹"'(])/)) {
      const sent = s.trim();
      if (sent.length >= 24 && sent.length <= 360) out.push(sent);
    }
  }
  return out;
}

function buildKeySentences(text, triggers, limit = 4) {
  const phraseSet = triggers.map((t) => ({ phrase: t.phrase, polarity: t.polarity }));
  const seen = new Set();
  const scored = [];
  for (const sent of splitSentences(text)) {
    const low = sent.toLowerCase();
    if (BOILERPLATE.test(sent)) continue;
    const marks = [];
    let polarity = 0;
    let score = 0;
    for (const { phrase, polarity: pol } of phraseSet) {
      if (low.includes(phrase.toLowerCase())) {
        marks.push(phrase);
        polarity += pol;
        score += 3;
      }
    }
    const am = sent.match(AMOUNT);
    if (am) {
      marks.push(am[0].trim());
      score += 1.5;
    }
    if (/\bsub(?:ject)?\s*[:\-]/i.test(sent)) score += 1;
    if (score <= 0) continue;
    const key = low.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    scored.push({
      text: sent,
      marks: [...new Set(marks)],
      polarity: polarity > 0 ? 1 : polarity < 0 ? -1 : 0,
      score,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Main entry: analyse extracted PDF text → the same shape the pipeline emits,
// plus `keySentences` and `keyWords` for the live summary panel.
export function analyzePdfText(text) {
  if (!text || !text.trim()) {
    return {
      ok: false, hasText: false, sentiment: null, score: 0, triggers: [],
      excerpt: "", nPos: 0, nNeg: 0, docType: null, keySentences: [], keyWords: [],
    };
  }
  const norm = normalise(text);
  const triggers = [];

  for (const [label, phrases] of POSITIVE_TRIGGERS) {
    const hit = firstHit(norm, phrases, true);
    if (hit) {
      const t = { label, polarity: 1, phrase: hit.trim(), snippet: snippet(text, hit) };
      const amt = nearestAmount(text, hit);
      if (amt) t.amount = amt;
      triggers.push(t);
    }
  }
  for (const [label, phrases] of NEGATIVE_TRIGGERS) {
    const hit = firstHit(norm, phrases, false);
    if (hit) {
      const t = { label, polarity: -1, phrase: hit.trim(), snippet: snippet(text, hit) };
      const amt = nearestAmount(text, hit);
      if (amt) t.amount = amt;
      triggers.push(t);
    }
  }

  const nPos = triggers.filter((t) => t.polarity > 0).length;
  const nNeg = triggers.filter((t) => t.polarity < 0).length;
  const score = nPos - nNeg;
  const sentiment = score > 0 ? "Positive" : score < 0 ? "Negative" : (triggers.length ? "Neutral" : null);

  triggers.sort((a, b) => (a.polarity - b.polarity) || a.label.localeCompare(b.label));

  // Key words = the distinct directional labels (with any amount) the scan hit.
  const keyWords = triggers.map((t) => ({
    label: t.label, polarity: t.polarity, amount: t.amount || null,
  }));

  return {
    ok: true,
    hasText: true,
    sentiment,
    score,
    triggers,
    excerpt: cleanExcerpt(text),
    nPos,
    nNeg,
    docType: classify(norm),
    keySentences: buildKeySentences(text, triggers),
    keyWords,
  };
}
