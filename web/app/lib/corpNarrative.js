// Turn the structured corp summary (setup / lean / verdict / financials /
// calendar / timeline) into plain-English sentences. Pure, deterministic and
// presentation-only — every clause is a transparent read of numbers already in
// the payload, never a forecast or recommendation. Each "sentence" is an array
// of { t, c } spans so callers can colour the key words while staying
// theme-aware. No LLM, no investment advice.

const fmtCr = (n) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
const fmtSignedPct = (n) => (n == null ? "" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(0)}%`);
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
};
const daysUntil = (iso) => {
  if (!iso) return null;
  try {
    return Math.ceil((new Date(`${iso}T00:00:00`) - Date.now()) / 86400000);
  } catch {
    return null;
  }
};
const fmtDays = (d) => (d == null ? "" : d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

const yoyTone = (n) => (n == null ? "text-muted" : n >= 0 ? "text-up" : "text-down");
const setupTone = (v) =>
  v == null ? "text-muted" : v >= 70 ? "text-up" : v >= 55 ? "text-accent" : v >= 40 ? "text-white" : "text-down";
const setupWord = (v) =>
  v == null ? "neutral" : v >= 70 ? "strong" : v >= 55 ? "constructive" : v >= 40 ? "neutral" : "soft";
const leanTone = (lbl) =>
  lbl === "Leans positive" ? "text-up" : lbl === "Leans cautious" ? "text-down" : "text-muted";

const VERDICT_LEAD = {
  "Delivered strong": ["The tape has rewarded the print", "text-up"],
  Positive: ["Market reception reads constructive", "text-up"],
  Mixed: ["Reaction has been mixed", "text-amber-400"],
  Disappointed: ["The tape has marked it down", "text-down"],
};

const isConsolidated = (s) => String(s || "").toLowerCase().startsWith("consol");

// Per-stock paragraph. Returns an array of sentences; each sentence is an array
// of { t, c } spans. Empty array when there's nothing worth narrating.
export function stockNarrative(corp) {
  if (!corp) return [];
  const out = [];
  const name = corp.company || corp.symbol;

  // 1) Headline financials (only when XBRL numbers parsed).
  const fin = corp.financials;
  if (fin && (fin.revenue != null || fin.pat != null)) {
    const period = [fin.quarter, fin.fy].filter(Boolean).join(" ");
    const s = [{ t: period ? `In ${period}, ` : "Last reported quarter — " },
               { t: name, c: "text-white font-semibold" }, { t: " posted " }];
    if (fin.revenue != null) {
      s.push({ t: "revenue of " }, { t: fmtCr(fin.revenue), c: "text-white font-medium" });
      if (fin.revenue_yoy != null)
        s.push({ t: " (" }, { t: `${fmtSignedPct(fin.revenue_yoy)} YoY`, c: yoyTone(fin.revenue_yoy) }, { t: ")" });
    }
    if (fin.pat != null) {
      s.push({ t: fin.revenue != null ? " and net profit of " : "net profit of " },
             { t: fmtCr(fin.pat), c: "text-white font-medium" });
      if (fin.pat_yoy != null)
        s.push({ t: " (" }, { t: `${fmtSignedPct(fin.pat_yoy)} YoY`, c: yoyTone(fin.pat_yoy) }, { t: ")" });
    }
    if (fin.consolidated)
      s.push({ t: ` on ${isConsolidated(fin.consolidated) ? "consolidated" : "standalone"} numbers` });
    s.push({ t: "." });
    out.push(s);
  }

  // 2) Post-event verdict / market reaction.
  const vd = corp.verdict;
  if (vd && VERDICT_LEAD[vd.label]) {
    const [lead, tone] = VERDICT_LEAD[vd.label];
    const s = [{ t: lead, c: tone }];
    if (vd.reasons?.length) s.push({ t: " — " }, { t: vd.reasons.join(", ") });
    s.push({ t: ` (verdict: ${vd.label.toLowerCase()}).` });
    out.push(s);
  }

  // 2b) What the latest filing's PDF actually says (lexicon read).
  const pdf = corp.pdf;
  if (pdf && pdf.triggers?.length) {
    const tone = pdf.sentiment === "Positive" ? "text-up"
      : pdf.sentiment === "Negative" ? "text-down" : "text-amber-400";
    const labels = [...new Set(pdf.triggers.map((t) => t.label))];
    out.push([{ t: "Reading the latest filing, the document flags " },
              { t: labels.join(", "), c: tone },
              { t: ` (${(pdf.sentiment || "neutral").toLowerCase()} tone).` }]);
  }

  // 3) Pre-event accumulation setup + model lean.
  if (corp.setup != null) {
    const s = [{ t: "Pre-event accumulation looks " },
               { t: setupWord(corp.setup), c: setupTone(corp.setup) },
               { t: " (" }, { t: `${Math.round(corp.setup)}/100`, c: setupTone(corp.setup) }, { t: ")" }];
    if (corp.lean_prob != null && corp.lean_label) {
      const leanPhrase = corp.lean_label === "Balanced" ? "reads balanced" : corp.lean_label.toLowerCase();
      s.push({ t: ", and the model " },
             { t: leanPhrase, c: leanTone(corp.lean_label) },
             { t: ` at ${corp.lean_prob}%` });
    }
    s.push({ t: "." });
    out.push(s);
  }

  // 4) What's next — forward event, else the latest disclosure.
  const nx = corp.next_event;
  if (nx && nx.date) {
    const d = daysUntil(nx.date);
    const s = [{ t: "Next on the calendar: " },
               { t: nx.kind || "event", c: "text-white font-medium" },
               { t: ` on ${fmtDate(nx.date)}` }];
    if (d != null) s.push({ t: ` (${fmtDays(d)})`, c: d <= 3 ? "text-amber-400" : "text-muted" });
    if (nx.purpose) s.push({ t: ` — ${nx.purpose}` });
    s.push({ t: "." });
    out.push(s);
  } else if (corp.timeline?.length) {
    const a = corp.timeline[0];
    out.push([{ t: "Latest disclosure: " },
              { t: a.headline || a.category || "—", c: "text-white" },
              { t: ` (${fmtDate(a.date)}).`, c: "text-muted" }]);
  }

  return out;
}

// Market-wide one-liner for the dashboard / screener headers. Single sentence
// (array of spans). Empty when the payload is thin.
export function marketNarrative(corp) {
  if (!corp) return [];
  const stats = corp.stats || {};
  const rec = corp.recommend || [];
  const cal = corp.calendar || rec;
  const soon = cal.filter((e) => e.days_until != null && e.days_until <= 7).length;
  const strong = corp.flags?.recent_strong?.length || 0;
  const weak = corp.flags?.recent_weak?.length || 0;
  const top = rec[0];

  const s = [{ t: `${stats.calendar ?? rec.length} corporate events ahead` }];
  if (soon) s.push({ t: " — " }, { t: `${soon} within a week`, c: "text-amber-400" });
  s.push({ t: ". " });
  if (strong || weak) {
    s.push({ t: `${strong} ` }, { t: "reported well", c: "text-up" },
           { t: ", " }, { t: `${weak} soft`, c: "text-down" }, { t: ". " });
  }
  if (top && top.setup != null) {
    s.push({ t: "Best setup: " }, { t: top.company || top.symbol, c: "text-white font-medium" },
           { t: " (" }, { t: `${Math.round(top.setup)}`, c: setupTone(top.setup) }, { t: ")." });
  }
  return s;
}

// ---------------------------------------------------------------------------
// Computed margins. PAT / PBT as a % of revenue, plus the YoY swing in PAT
// margin when both this-year and (implied) year-ago figures are present. Pure
// arithmetic on numbers already in the filing — no estimates.
export function finMargins(fin) {
  if (!fin || fin.revenue == null || fin.revenue === 0) return null;
  const rev = Number(fin.revenue);
  const patMargin = fin.pat != null ? (Number(fin.pat) / rev) * 100 : null;
  const pbtMargin = fin.pbt != null ? (Number(fin.pbt) / rev) * 100 : null;

  // Reconstruct year-ago revenue & PAT from the YoY % to get a margin delta.
  let patMarginYoY = null;
  if (patMargin != null && fin.revenue_yoy != null && fin.pat_yoy != null) {
    const revPrev = rev / (1 + Number(fin.revenue_yoy) / 100);
    const patPrev = Number(fin.pat) / (1 + Number(fin.pat_yoy) / 100);
    if (revPrev > 0 && Number.isFinite(patPrev)) {
      const patMarginPrev = (patPrev / revPrev) * 100;
      patMarginYoY = patMargin - patMarginPrev; // percentage-point swing
    }
  }
  return { patMargin, pbtMargin, patMarginYoY };
}

// ---------------------------------------------------------------------------
// Bull / bear thesis. Decomposes the corp summary into two transparent lists
// of factors — "What supports it" and "What to watch" — each a labelled span
// row. Every factor is a literal read of a number/label already in the
// payload; nothing is forecast. Returns { support, watch } where each is an
// array of { spans, key } rows (spans = [{t,c}]). Empty arrays when thin.
export function stockThesis(corp) {
  const support = [];
  const watch = [];
  const context = []; // neutral / informational — keeps the read honest, never blank
  if (!corp) return { support, watch, context };

  const push = (arr, key, spans) => arr.push({ key, spans });

  // --- financial momentum (YoY) ---
  const fin = corp.financials;
  if (fin) {
    if (fin.revenue_yoy != null) {
      const row = [{ t: "Revenue " }, { t: fin.revenue_yoy >= 0 ? "growing " : "declining " },
                   { t: `${fmtSignedPct(fin.revenue_yoy)} YoY`, c: yoyTone(fin.revenue_yoy) }];
      push(fin.revenue_yoy >= 0 ? support : watch, "rev_yoy", row);
    }
    if (fin.pat_yoy != null) {
      const row = [{ t: "Net profit " }, { t: fin.pat_yoy >= 0 ? "up " : "down " },
                   { t: `${fmtSignedPct(fin.pat_yoy)} YoY`, c: yoyTone(fin.pat_yoy) }];
      push(fin.pat_yoy >= 0 ? support : watch, "pat_yoy", row);
    }
    // margin & its direction
    const m = finMargins(fin);
    if (m?.patMargin != null) {
      const row = [{ t: "PAT margin " }, { t: `${m.patMargin.toFixed(1)}%`, c: "text-white font-medium" }];
      if (m.patMarginYoY != null) {
        const exp = m.patMarginYoY >= 0;
        row.push({ t: exp ? " — expanding " : " — compressing " },
                 { t: `${exp ? "+" : ""}${m.patMarginYoY.toFixed(1)}pp`, c: yoyTone(m.patMarginYoY) });
        push(exp ? support : watch, "pat_margin", row);
      } else {
        // no direction → bucket by absolute level (double-digit = healthy)
        push(m.patMargin >= 10 ? support : watch, "pat_margin", row);
      }
    }
  }

  // --- accumulation setup (always surfaced — neutral falls to context) ---
  if (corp.setup != null) {
    const row = [{ t: "Pre-event setup " }, { t: setupWord(corp.setup), c: setupTone(corp.setup) },
                 { t: " (" }, { t: `${Math.round(corp.setup)}/100`, c: setupTone(corp.setup) }, { t: ")" }];
    if (corp.setup >= 55) push(support, "setup", row);
    else if (corp.setup < 40) push(watch, "setup", row);
    else push(context, "setup", row); // 40–55 neutral → no decisive edge
  }

  // --- model lean (always surfaced — balanced falls to context) ---
  if (corp.lean_prob != null && corp.lean_label) {
    if (corp.lean_label === "Leans positive")
      push(support, "lean", [{ t: "Model leans positive at " }, { t: `${corp.lean_prob}%`, c: "text-up" }]);
    else if (corp.lean_label === "Leans cautious")
      push(watch, "lean", [{ t: "Model leans cautious at " }, { t: `${corp.lean_prob}%`, c: "text-down" }]);
    else
      push(context, "lean", [{ t: "Model reads balanced at " }, { t: `${corp.lean_prob}%`, c: "text-muted" }]);
  }

  // --- post-event verdict ---
  const vd = corp.verdict;
  if (vd?.label) {
    const txt = vd.reasons?.length ? `${vd.label} (${vd.reasons.join(", ")})` : vd.label;
    if (vd.label === "Delivered strong" || vd.label === "Positive")
      push(support, "verdict", [{ t: "Reaction: " }, { t: txt, c: "text-up" }]);
    else if (vd.label === "Disappointed")
      push(watch, "verdict", [{ t: "Reaction: " }, { t: txt, c: "text-down" }]);
    else if (vd.label === "Mixed")
      push(watch, "verdict", [{ t: "Reaction: " }, { t: txt, c: "text-amber-400" }]);
  }

  // --- disclosure tone (timeline polarity) ---
  const tl = corp.timeline || [];
  if (tl.length) {
    const pos = tl.filter((a) => (a.polarity || 0) > 0).length;
    const neg = tl.filter((a) => (a.polarity || 0) < 0).length;
    if (pos > neg && pos)
      push(support, "tone", [{ t: "Recent disclosures skew " }, { t: "constructive", c: "text-up" },
                             { t: ` (${pos} positive vs ${neg})` }]);
    else if (neg > pos && neg)
      push(watch, "tone", [{ t: "Recent disclosures skew " }, { t: "cautionary", c: "text-down" },
                          { t: ` (${neg} adverse vs ${pos})` }]);
  }

  // --- filing-PDF triggers (what the latest document literally says) ---
  const pdf = corp.pdf;
  if (pdf?.triggers?.length) {
    for (const t of pdf.triggers) {
      const row = [{ t: "Filing: " },
                   { t: t.label, c: t.polarity > 0 ? "text-up" : "text-down" }];
      push(t.polarity > 0 ? support : watch, `pdf_${t.label}`, row);
    }
  }

  // --- imminent event = watch item (volatility around the print) ---
  const nx = corp.next_event;
  if (nx?.date) {
    const d = daysUntil(nx.date);
    if (d != null && d <= 5 && d >= 0) {
      push(watch, "event", [{ t: `${nx.kind || "Event"} ` },
                            { t: fmtDays(d), c: d <= 3 ? "text-amber-400" : "text-muted" },
                            { t: " — expect volatility around the print" }]);
    }
  }

  // --- absolute backstop: never leave the read blank when corp data exists.
  // If nothing landed anywhere (e.g. setup/lean absent but a timeline exists),
  // surface the latest disclosure as neutral context.
  if (!support.length && !watch.length && !context.length) {
    if (tl.length) {
      const a = tl[0];
      push(context, "latest", [{ t: "Latest disclosure: " },
                               { t: a.headline || a.category || "—", c: "text-white" }]);
    } else {
      push(context, "thin", [{ t: "Limited corporate-disclosure data for this name yet." }]);
    }
  }

  return { support, watch, context };
}

// ---------------------------------------------------------------------------
// Intelligence synthesis. Where stockThesis *lists* factors, this *reconciles*
// them: every signal is weighted into one normalised stance in [-1, 1], a
// confidence is derived from how many independent signals agree, and — the
// genuinely useful part — material disagreement between fundamentals and the
// tape (or the setup and the model) is surfaced as an explicit "tension" rather
// than silently averaged away. Still fully deterministic and transparent: every
// number traces back to a field already in the payload. No LLM, no advice.
const clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

const VERDICT_STRENGTH = {
  "Delivered strong": 1, Positive: 0.6, Mixed: -0.3, Disappointed: -0.9,
};

export function stockIntelligence(corp) {
  if (!corp) return null;
  // Each factor: { key, group, w (importance), s (signed strength in [-1,1]),
  // pos (driver phrase), neg (risk phrase) }.
  const F = [];
  const add = (key, group, w, s, pos, neg) =>
    F.push({ key, group, w, s: clamp(s), pos, neg });

  const fin = corp.financials;
  if (fin) {
    if (fin.revenue_yoy != null)
      add("rev", "fundamentals", 0.8, fin.revenue_yoy / 40, "revenue growth", "a revenue decline");
    if (fin.pat_yoy != null)
      add("pat", "fundamentals", 1.2, fin.pat_yoy / 50, "profit growth", "falling profit");
    const m = finMargins(fin);
    if (m?.patMarginYoY != null)
      add("margin", "fundamentals", 1.0, m.patMarginYoY / 5, "margin expansion", "margin compression");
    else if (m?.patMargin != null)
      add("margin", "fundamentals", 0.5, (m.patMargin - 8) / 12, "a healthy margin", "a thin margin");
  }
  if (corp.setup != null)
    add("setup", "positioning", 1.0, (corp.setup - 50) / 30, "constructive accumulation", "soft accumulation");
  if (corp.lean_prob != null)
    add("lean", "positioning", 0.8, (corp.lean_prob - 50) / 25, "a positive model lean", "a cautious model lean");
  const vd = corp.verdict;
  if (vd?.label && VERDICT_STRENGTH[vd.label] != null) {
    const lbl = { "Delivered strong": "a strong market reception", Positive: "a constructive reception",
                  Mixed: "a mixed reaction", Disappointed: "a soft market reaction" };
    add("verdict", "tape", 1.1, VERDICT_STRENGTH[vd.label], lbl[vd.label], lbl[vd.label]);
  }
  const tl = corp.timeline || [];
  if (tl.length) {
    const pos = tl.filter((a) => (a.polarity || 0) > 0).length;
    const neg = tl.filter((a) => (a.polarity || 0) < 0).length;
    if (pos !== neg)
      add("tone", "disclosure", 0.5, (pos - neg) / 4, "constructive disclosures", "cautionary disclosures");
  }
  const pdf = corp.pdf;
  if (pdf?.triggers?.length) {
    const net = pdf.triggers.reduce((a, t) => a + (t.polarity > 0 ? 1 : -1), 0);
    if (net !== 0)
      add("pdf", "filing", 0.9, net / 3, "a constructive filing read", "an adverse filing read");
  }

  const totalW = F.reduce((a, f) => a + f.w, 0);
  if (!F.length || totalW < 0.5) return null;

  const net = F.reduce((a, f) => a + f.w * f.s, 0);
  const normalized = net / totalW; // [-1, 1]

  // Conflict mass: weighted magnitude pushing each way.
  const posMass = F.filter((f) => f.s > 0).reduce((a, f) => a + f.w * f.s, 0);
  const negMass = F.filter((f) => f.s < 0).reduce((a, f) => a - f.w * f.s, 0);
  const conflicted = posMass >= 0.22 * totalW && negMass >= 0.22 * totalW && Math.abs(normalized) < 0.16;

  // Stance label.
  let label, tone;
  if (conflicted) { label = "Conflicted"; tone = "text-amber-400"; }
  else if (normalized >= 0.34) { label = "Constructive"; tone = "text-up"; }
  else if (normalized >= 0.12) { label = "Leans constructive"; tone = "text-up"; }
  else if (normalized > -0.12) { label = "Balanced"; tone = "text-muted"; }
  else if (normalized > -0.34) { label = "Leans cautious"; tone = "text-down"; }
  else { label = "Cautious"; tone = "text-down"; }

  // Confidence = signal coverage × directional agreement, softened when conflicted.
  const sign = normalized >= 0 ? 1 : -1;
  const agreeW = F.filter((f) => Math.sign(f.s) === sign).reduce((a, f) => a + f.w, 0);
  const agreement = totalW ? agreeW / totalW : 0;
  const coverage = clamp(totalW / 4, 0, 1);
  let conf = agreement * coverage;
  if (conflicted) conf *= 0.6;
  const confPct = Math.round(conf * 100);
  const confLabel = conf >= 0.66 ? "High" : conf >= 0.42 ? "Moderate" : "Low";

  // Drivers / risks — strongest contributors each way (dedupe by phrase).
  const byMag = (a, b) => b.w * Math.abs(b.s) - a.w * Math.abs(a.s);
  const drivers = F.filter((f) => f.s > 0).sort(byMag).slice(0, 2).map((f) => f.pos);
  const risks = F.filter((f) => f.s < 0).sort(byMag).slice(0, 2).map((f) => f.neg);

  // --- synthesis sentence (spans) ---
  const name = corp.company || corp.symbol || "This name";
  const synthesis = [{ t: name, c: "text-white font-semibold" }, { t: " reads " },
                     { t: label.toLowerCase(), c: tone }];
  if (drivers.length) {
    synthesis.push({ t: " — carried by " }, { t: joinNice(drivers), c: "text-up" });
    if (risks.length) synthesis.push({ t: ", though weighed by " }, { t: joinNice(risks), c: "text-down" });
  } else if (risks.length) {
    synthesis.push({ t: " — weighed by " }, { t: joinNice(risks), c: "text-down" });
  }
  synthesis.push({ t: "." });

  // --- tension: the most salient fundamentals-vs-tape style disagreement ---
  const g = (name2) => F.filter((f) => f.group === name2);
  const groupMean = (name2) => {
    const arr = g(name2);
    if (!arr.length) return null;
    return arr.reduce((a, f) => a + f.w * f.s, 0) / arr.reduce((a, f) => a + f.w, 0);
  };
  const fund = groupMean("fundamentals");
  const tape = g("tape").length ? g("tape")[0].s : null;
  const setupF = F.find((f) => f.key === "setup");
  const leanF = F.find((f) => f.key === "lean");
  const filing = g("filing").length ? g("filing")[0].s : null;

  let tension = null;
  if (fund != null && tape != null && fund >= 0.25 && tape <= -0.3) {
    tension = [{ t: "Tension: ", c: "text-amber-400 font-semibold" },
               { t: "the numbers came in firm, but the tape " },
               { t: "faded the print", c: "text-down" },
               { t: " — the market may be discounting the quarter or looking past it." }];
  } else if (fund != null && tape != null && fund <= -0.25 && tape >= 0.3) {
    tension = [{ t: "Tension: ", c: "text-amber-400 font-semibold" },
               { t: "fundamentals softened, yet the reaction was " },
               { t: "constructive", c: "text-up" },
               { t: " — buyers may be pricing a turn ahead of the financials." }];
  } else if (setupF && leanF && setupF.s >= 0.3 && leanF.s <= -0.3) {
    tension = [{ t: "Tension: ", c: "text-amber-400 font-semibold" },
               { t: "accumulation looks " }, { t: "constructive", c: "text-up" },
               { t: " while the model " }, { t: "leans cautious", c: "text-down" },
               { t: " — positioning and the signal disagree." }];
  } else if (setupF && leanF && setupF.s <= -0.3 && leanF.s >= 0.3) {
    tension = [{ t: "Tension: ", c: "text-amber-400 font-semibold" },
               { t: "the model " }, { t: "leans positive", c: "text-up" },
               { t: " but accumulation is still " }, { t: "soft", c: "text-down" },
               { t: " — the edge isn't confirmed by flow yet." }];
  } else if (filing != null && tape != null && filing >= 0.3 && tape <= -0.3) {
    tension = [{ t: "Tension: ", c: "text-amber-400 font-semibold" },
               { t: "the filing reads " }, { t: "constructive", c: "text-up" },
               { t: " but the reaction was " }, { t: "soft", c: "text-down" }, { t: "." }];
  } else if (conflicted) {
    tension = [{ t: "Signals are pulling both ways", c: "text-amber-400 font-semibold" },
               { t: " — roughly balanced support and risk, so the net read is low-conviction." }];
  }

  return { stance: { label, tone, normalized }, confidence: { label: confLabel, pct: confPct },
           drivers, risks, synthesis, tension, factors: F.length };
}

// Oxford-ish join: ["a", "b"] -> "a and b"; ["a","b","c"] -> "a, b and c".
function joinNice(arr) {
  if (!arr.length) return "";
  if (arr.length === 1) return arr[0];
  return `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;
}
