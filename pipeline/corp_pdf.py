"""Read the actual filing PDF behind a corporate announcement and derive a
transparent, deterministic "trigger" read — a set of matched positive/negative
phrases and a net sentiment for the disclosure's likely forward bias.

This is NOT an LLM and NOT investment advice. It is a lexicon scan: we look for
a fixed list of plain-English phrases that, in the language of Indian exchange
filings, tend to accompany a constructive or an adverse development (an order
win, a capacity expansion, a debt prepayment — versus a resignation, a demand
notice, a pledge invocation, a qualified audit opinion). Every output is a
literal, quotable read of words present in the document. Image-only (scanned)
PDFs carry no extractable text and yield nothing — that's expected.
"""

from __future__ import annotations

import io
import logging
import re

try:
    from pypdf import PdfReader
    # pypdf logs noisy "Multiple definitions in dictionary" / malformed-object
    # warnings for the many quirky exchange PDFs — silence them; we only care
    # about extracted text, and unreadable files degrade to empty gracefully.
    logging.getLogger("pypdf").setLevel(logging.ERROR)
except Exception:  # noqa: BLE001 — module must import even if dep is missing
    PdfReader = None


# ---------------------------------------------------------------------------
# Trigger lexicon. Each entry: (label, polarity, [phrases]). Phrases are matched
# case-insensitively against the normalised document text. A label scores at
# most once per document (so a press note that repeats "order" ten times still
# counts as a single Order-win trigger), keeping the net read balanced.
# NOTE on specificity: exchange filings (esp. audited results) embed a lot of
# standard auditor boilerplate — "preventing and detecting frauds", "ability to
# continue as a going concern", "does not have any joint venture entity". Bare
# words like "fraud"/"going concern"/"joint venture" therefore fire on clean
# filings. Every phrase below is deliberately specific enough to skip that
# boilerplate and only match an actual development.
POSITIVE_TRIGGERS: list[tuple[str, list[str]]] = [
    ("Order win", ["received an order", "order worth", "order valued at", "bagged",
                   "secured a contract", "secured an order", "letter of intent",
                   "work order", "purchase order from", "received a work order",
                   "received a purchase order", "awarded the contract", "awarded a contract",
                   "order intake", "won a contract", "emerged as the lowest bidder",
                   "emerged l1", "declared l1", "order book of", "strong order book",
                   "robust order book"]),
    ("Record performance", ["record revenue", "highest ever", "record profit",
                            "all-time high", "all time high", "best ever",
                            "highest quarterly", "record quarter"]),
    ("Profit growth", ["profit grew", "profit increased", "profit rose",
                       "pat grew", "net profit rose", "net profit grew",
                       "growth in net profit", "robust growth in", "strong growth in"]),
    ("Margin expansion", ["margin expansion", "margins improved", "margin improved",
                          "improvement in margin", "ebitda margin improved",
                          "operating margin improved"]),
    ("Capacity expansion", ["capacity expansion", "commercial production",
                            "commenced production", "commenced commercial operation",
                            "commissioning of", "plant commissioned", "unit commissioned",
                            "greenfield", "brownfield", "expand capacity",
                            "capacity addition", "debottlenecking",
                            "new manufacturing facility", "new plant at"]),
    ("Debt reduction", ["debt reduction", "reduced debt", "debt free", "debt-free",
                        "prepayment of debt", "prepaid debt", "deleveraging",
                        "repaid borrowings", "reduction in borrowings",
                        "net debt reduced", "becoming debt free"]),
    ("Capital return", ["buyback", "buy-back", "buy back of", "interim dividend",
                        "final dividend", "special dividend", "recommended a dividend",
                        "bonus issue", "bonus share"]),
    ("Strategic deal", ["strategic partnership", "entered into a joint venture",
                        "formed a joint venture", "joint venture with", "50:50 joint venture",
                        "definitive agreement", "long-term agreement", "long term supply",
                        "signed an mou", "signed a mou", "memorandum of understanding",
                        "supply agreement with", "acquisition of"]),
    ("Rating upgrade", ["rating upgrade", "upgraded the rating", "rating upgraded",
                        "revised upward", "outlook revised to positive",
                        "outlook upgraded"]),
    ("Guidance raise", ["raised guidance", "upgraded guidance", "guidance upward",
                        "demand remains strong", "healthy demand outlook"]),
]

NEGATIVE_TRIGGERS: list[tuple[str, list[str]]] = [
    ("Resignation", ["resignation of", "has resigned", "tendered his resignation",
                     "tendered her resignation", "stepped down", "stepping down",
                     "cessation of", "demise of"]),
    ("Loss", ["net loss of", "reported a net loss", "incurred a net loss",
              "loss after tax of", "slipped into loss", "loss before tax of",
              "widening of loss"]),
    ("Default", ["default in payment", "default on", "failed to pay",
                 "delay in payment", "delayed payment", "payment default"]),
    # "nclt"/"ibc" excluded — the NCLT also sanctions mergers & schemes of
    # arrangement (often positive), so the bare term is not a distress signal.
    ("Insolvency", ["corporate insolvency", "insolvency proceedings",
                    "insolvency resolution", "admitted under insolvency",
                    "resolution professional", "liquidation", "winding up",
                    "moratorium under section"]),
    # "income tax demand of" (with an amount) excludes the hypothetical
    # "in the event of any income tax demand" indemnity clause in dividend notices.
    ("Regulatory action", ["show cause notice", "penalty of", "imposed a penalty",
                           "levied a penalty", "demand notice", "demand order",
                           "gst demand", "gst notice", "income tax demand of",
                           "sebi order", "adjudicating officer", "search and seizure",
                           "summons"]),
    # "significant doubt" / "cast significant doubt" are deliberately excluded —
    # they appear verbatim in the auditor's standard responsibility paragraph of
    # every report. Only the distinctive section heading below flags a real one.
    ("Audit concern", ["qualified opinion", "adverse opinion", "disclaimer of opinion",
                       "material weakness", "material uncertainty related to going concern",
                       "emphasis of matter"]),
    ("Litigation", ["filed a suit against", "writ petition", "ruling against the company",
                    "tribunal ruled", "court ruled against", "class action",
                    "order against the company", "material litigation", "adverse order"]),
    ("Pledge", ["pledge of shares", "invocation of pledge", "shares pledged",
                "creation of encumbrance", "encumbrance on shares"]),
    ("Rating downgrade", ["rating downgrade", "downgraded the rating", "rating downgraded",
                          "revised downward", "outlook revised to negative",
                          "negative outlook"]),
    ("Operations hit", ["plant shutdown", "suspension of operations", "halt production",
                        "halted production", "lock-out", "lockout", "fire at",
                        "force majeure", "disruption in operations"]),
    ("Fraud", ["instance of fraud", "instances of fraud", "fraud committed",
               "alleged fraud", "reported a fraud", "detected a fraud",
               "fraud against the company", "forensic audit", "misappropriation",
               "embezzlement", "siphoning of funds", "financial irregularit"]),
    ("Stake sale / exit", ["promoter stake sale", "sold its entire stake",
                           "divestment of", "stake sale by promoter"]),
]

_WS = re.compile(r"\s+")

# ---------------------------------------------------------------------------
# Masthead / letterhead boilerplate. The top of almost every exchange filing is
# the company's address block and the standard "To, The Secretary, Listing
# Department, BSE Limited…" cover matter — pure noise that drowns the actual
# development. We drop those lines before building the excerpt so the preview
# shows substance, not a postal address.
_BOILERPLATE = re.compile(
    r"(regd\.?\s*off|register?ed\s+off|corporate\s+off|\bcin\b|e-?mail|"
    r"website|www\.|https?:|tel\.?\s*[:\-]|phone|\bfax\b|listing\s+dep|"
    r"the\s+secretary|bse\s+limited|national\s+stock\s+exchange|exchange\s+plaza|"
    r"bandra|dalal\s+street|scrip\s+code|\bisin\b|dear\s+sir|"
    r"corporate\s+relationship|department\s+of\s+corporate)",
    re.I)

# A monetary figure that carries an explicit magnitude unit — this requirement
# is what keeps pincodes, CINs, phone numbers and page numbers out of the read.
_AMOUNT = re.compile(
    r"(?:₹|rs\.?|inr)?\s?([\d][\d,]{0,13}(?:\.\d+)?)\s*"
    r"(crores?|cr|lakhs?|lacs?|million|mn|billion|bn)\b",
    re.I)

# Words that negate a following positive phrase ("did not receive an order",
# "no buyback") — a light guard against false positives.
_NEG_GUARD = re.compile(
    r"\b(no|not|without|never|nor|fails?\s+to|failed\s+to|did\s+not|does\s+not|"
    r"do\s+not|deferred|denied|cancell?ed|withdrawn|rejected|unable\s+to)\b", re.I)

# Document-type classifier. First match wins; ordering puts the most specific
# (and most market-moving) categories first.
_DOC_TYPES: list[tuple[str, list[str]]] = [
    ("Quarterly results", ["unaudited financial results", "audited financial results",
                           "statement of standalone", "statement of consolidated",
                           "financial results for the quarter", "statement of profit and loss"]),
    ("Order win", ["received an order", "work order", "letter of intent", "purchase order",
                   "bagged", "secured a contract", "secured an order", "order worth",
                   "awarded the contract", "emerged as the lowest"]),
    ("Dividend", ["recommended a dividend", "declared a dividend", "interim dividend",
                  "final dividend", "record date for"]),
    ("Buyback", ["buy-back", "buyback"]),
    ("Fundraise", ["preferential issue", "qualified institutions placement", "qip",
                   "rights issue", "raising of funds", "issue of equity shares",
                   "convertible warrants", "fund raising"]),
    ("M&A / scheme", ["scheme of arrangement", "scheme of amalgamation", "acquisition of",
                      "amalgamation", "slump sale", "demerger"]),
    ("Credit rating", ["credit rating", "rating action", "reaffirmed the rating",
                       "assigned a rating", "rating rationale"]),
    ("Investor update", ["investor presentation", "earnings call", "analyst meet",
                         "con. call", "conference call", "earnings conference",
                         "transcript of", "investor meet"]),
    ("Leadership change", ["resignation of", "has resigned", "appointment of",
                           "cessation of", "re-appointment"]),
    ("Board meeting", ["board meeting", "meeting of the board", "intimation of board"]),
]


def _normalise(text: str) -> str:
    return _WS.sub(" ", text).lower()


def _fmt_amount(num: str, unit: str) -> str:
    """₹/lakh/crore figure → a compact display string like '₹500 Cr'."""
    u = unit.lower()
    disp = ("Cr" if u.startswith("cr") else
            "Lakh" if u.startswith(("lakh", "lac")) else
            "Mn" if u in ("million", "mn") else
            "Bn" if u in ("billion", "bn") else "")
    if "." in num:
        num = num.rstrip("0").rstrip(".")
    return f"₹{num} {disp}".strip() if disp else f"₹{num}"


def _nearest_amount(text: str, phrase: str, window: int = 200) -> str | None:
    """The first magnitude-bearing figure within `window` chars of `phrase`.
    Returns a clean display string (₹500 Cr) or None when nothing qualifies."""
    low = text.lower()
    i = low.find(phrase.lower())
    if i < 0:
        return None
    seg = text[max(0, i - window // 3): i + len(phrase) + window]
    m = _AMOUNT.search(seg)
    return _fmt_amount(m.group(1), m.group(2)) if m else None


def _negated(norm: str, idx: int, back: int = 42) -> bool:
    return bool(_NEG_GUARD.search(norm[max(0, idx - back):idx]))


def _classify(norm: str) -> str | None:
    for label, keys in _DOC_TYPES:
        if any(k in norm for k in keys):
            return label
    return None


def _clean_excerpt(text: str, limit: int = 360) -> str:
    """A readable preview that skips the letterhead. Prefers the filing's own
    subject line (which usually states the development) when present."""
    m = re.search(r"\bsub(?:ject)?\s*[:\-]\s*(.+)", text, re.I)
    if m:
        subj = _WS.sub(" ", m.group(1)).strip()
        if 14 <= len(subj):
            return subj[:limit].rsplit(" ", 1)[0] if len(subj) > limit else subj
    kept = [ln.strip() for ln in text.splitlines()
            if ln.strip() and len(ln.strip()) > 3 and not _BOILERPLATE.search(ln)]
    body = _WS.sub(" ", " ".join(kept)).strip()
    return body[:limit].rsplit(" ", 1)[0] if len(body) > limit else body


def _snippet(haystack: str, phrase: str, width: int = 140) -> str:
    """~width-char window of original text around the first hit, trimmed clean."""
    i = haystack.lower().find(phrase)
    if i < 0:
        return ""
    a = max(0, i - width // 3)
    b = min(len(haystack), i + len(phrase) + width)
    frag = haystack[a:b].strip()
    frag = _WS.sub(" ", frag)
    if a > 0:
        frag = "…" + frag
    if b < len(haystack):
        frag = frag + "…"
    return frag


def extract_text(data: bytes, max_pages: int = 8, max_chars: int = 24000) -> str:
    """Best-effort text from the first `max_pages` pages. Empty string when the
    PDF is unreadable or image-only (no embedded text)."""
    if not data or PdfReader is None:
        return ""
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception:  # noqa: BLE001
        return ""
    parts: list[str] = []
    for page in reader.pages[:max_pages]:
        try:
            parts.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001
            continue
        if sum(len(p) for p in parts) > max_chars:
            break
    return "\n".join(parts).strip()[:max_chars]


def _first_hit(norm: str, phrases: list[str], guard_negation: bool) -> str | None:
    """First phrase that occurs in `norm` and (for positives) isn't negated."""
    for p in phrases:
        idx = norm.find(p)
        while idx != -1:
            if not (guard_negation and _negated(norm, idx)):
                return p
            idx = norm.find(p, idx + 1)
    return None


def scan_triggers(text: str) -> dict:
    """Advanced lexicon read → {sentiment, score, triggers:[{label, polarity,
    phrase, snippet, amount?}], excerpt, n_pos, n_neg, doc_type}.

    Beyond a bare keyword hit, each trigger is negation-guarded (so "did not
    receive an order" doesn't fire) and annotated with the nearest monetary
    figure when one is in context (e.g. an order's value). The document is also
    classified into a coarse filing type, and the excerpt skips the letterhead."""
    if not text:
        return {"sentiment": None, "score": 0, "triggers": [], "excerpt": "",
                "n_pos": 0, "n_neg": 0, "doc_type": None}
    norm = _normalise(text)
    triggers: list[dict] = []

    for label, phrases in POSITIVE_TRIGGERS:
        hit = _first_hit(norm, phrases, guard_negation=True)
        if hit:
            t = {"label": label, "polarity": 1, "phrase": hit.strip(),
                 "snippet": _snippet(text, hit)}
            amt = _nearest_amount(text, hit)
            if amt:
                t["amount"] = amt
            triggers.append(t)
    for label, phrases in NEGATIVE_TRIGGERS:
        hit = _first_hit(norm, phrases, guard_negation=False)
        if hit:
            t = {"label": label, "polarity": -1, "phrase": hit.strip(),
                 "snippet": _snippet(text, hit)}
            amt = _nearest_amount(text, hit)
            if amt:
                t["amount"] = amt
            triggers.append(t)

    n_pos = sum(1 for t in triggers if t["polarity"] > 0)
    n_neg = sum(1 for t in triggers if t["polarity"] < 0)
    score = n_pos - n_neg
    sentiment = "Positive" if score > 0 else "Negative" if score < 0 else (
        "Neutral" if triggers else None)

    # Sort strongest-signal first: negatives ahead of positives on a tie so risk
    # is never buried, then keep deterministic order.
    triggers.sort(key=lambda t: (t["polarity"], t["label"]))
    return {"sentiment": sentiment, "score": score, "triggers": triggers,
            "excerpt": _clean_excerpt(text), "n_pos": n_pos, "n_neg": n_neg,
            "doc_type": _classify(norm)}


def analyze_url(client, url: str) -> dict | None:
    """Fetch the PDF at `url` and return its trigger read. None on fetch failure
    (so the caller can retry later); a dict with sentiment=None when the PDF was
    fetched but carried no extractable text (so the caller can mark it done)."""
    if not url:
        return None
    try:
        data = client.get_bytes(url)
    except Exception:  # noqa: BLE001
        return None
    if not data:
        return None
    text = extract_text(data)
    result = scan_triggers(text)
    result["has_text"] = bool(text)
    result["n_pages"] = 0
    if PdfReader is not None:
        try:
            result["n_pages"] = len(PdfReader(io.BytesIO(data)).pages)
        except Exception:  # noqa: BLE001
            pass
    return result


if __name__ == "__main__":  # manual smoke test: python corp_pdf.py <url>
    import sys
    from nse_client import NSEClient
    if len(sys.argv) > 1:
        import json
        print(json.dumps(analyze_url(NSEClient(), sys.argv[1]), indent=2))
