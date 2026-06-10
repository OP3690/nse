"""Corporate-disclosure ingestion: announcements, the forward board-meeting
calendar, and quarterly results (with best-effort XBRL number extraction).

Three live NSE feeds power the "Earnings & Events" layer:

  * corporate-announcements  -> a rolling window of every equity filing, which we
    classify (order win, fundraise, buyback, rating, pledge, concall, ...) and
    give a directional polarity (+1 constructive / 0 neutral / -1 adverse).
  * event-calendar           -> upcoming board meetings with their stated purpose
    (the only forward-looking "an announcement is coming" signal NSE publishes).
  * corporates-financial-results -> who filed quarterly results and when; the
    headline numbers (revenue / PBT / PAT) are parsed from each filing's XBRL.

Nothing here predicts an outcome — it ingests facts. The pre-event "setup" and
post-event "verdict" scores are computed downstream in analyze.py from these
facts plus the price/flow history already in the DB.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import xml.etree.ElementTree as ET

import store

try:
    import corp_pdf
except Exception:  # noqa: BLE001 — module must import even if pypdf is missing
    corp_pdf = None

# ----------------------------------------------------------------------------
# Date helpers — NSE mixes "DD-Mon-YYYY HH:MM:SS" and "DD-Mon-YYYY"; XBRL is ISO.
# ----------------------------------------------------------------------------
_MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def _parse_dt(s: str | None) -> dt.datetime | None:
    if not s:
        return None
    m = re.match(r"(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?", s.strip())
    if not m:
        return None
    d, mon, y, hh, mm, ss = m.groups()
    mi = _MONTHS.get(mon.title())
    if not mi:
        return None
    try:
        return dt.datetime(int(y), mi, int(d), int(hh or 0), int(mm or 0), int(ss or 0))
    except ValueError:
        return None


def _iso(s: str | None) -> str | None:
    """ISO date string (YYYY-MM-DD) from an NSE 'DD-Mon-YYYY[...]' value."""
    d = _parse_dt(s)
    return d.date().isoformat() if d else None


def _iso_ts(s: str | None) -> str | None:
    d = _parse_dt(s)
    return d.isoformat(timespec="seconds") if d else None


# ----------------------------------------------------------------------------
# Classification — keyword rules over the disclosure headline + detail text.
# Order matters: the first matching rule wins. (category, polarity).
# ----------------------------------------------------------------------------
def _has(text: str, *words: str) -> bool:
    return any(w in text for w in words)


def classify_announcement(headline: str | None, detail: str | None) -> tuple[str, int]:
    t = f"{headline or ''} {detail or ''}".lower()
    if _has(t, "financial result", "audited result", "unaudited result",
            "quarterly result", "standalone and consolidated", "statement of"):
        return "Results", 0
    if _has(t, "earnings call", "conference call", "con call", "concall",
            "transcript", "analyst meet", "investor meet", "earnings conference"):
        return "Concall", 0
    if _has(t, "investor presentation", "earnings presentation"):
        return "Presentation", 0
    if _has(t, "credit rating", "rating action", " rating "):
        if _has(t, "upgrade", "revised upward", "reaffirm with positive"):
            return "Rating Up", 1
        if _has(t, "downgrade", "revised downward", "negative outlook"):
            return "Rating Down", -1
        return "Rating", 0
    if _has(t, "buy back", "buyback", "buy-back"):
        return "Buyback", 1
    if _has(t, "bonus issue", "bonus share"):
        return "Bonus", 1
    if _has(t, "stock split", "sub-division", "sub division", "subdivision of"):
        return "Split", 1
    if _has(t, "dividend"):
        return "Dividend", 1
    if _has(t, "order", "contract", "letter of intent", "work order", "awarded",
             "bags ", "secures ", "wins ", "won ", "bagged", "purchase order"):
        if _has(t, "order of ", "penalty", "demand order", "assessment order",
                "show cause", "court order", "tribunal", "adjudicat"):
            pass  # legal "order" — fall through to litigation below
        else:
            return "Order Win", 1
    if _has(t, "acquisition", "acquire", "amalgamation", "merger", "scheme of arrangement",
             "stake in", "joint venture", " jv "):
        return "M&A", 1
    if _has(t, "qip", "qualified institutional", "preferential issue", "preferential allotment",
             "fund rais", "raising of fund", "rights issue", "issue of equity",
             "issue of warrant", "convertible"):
        return "Fundraise", 0
    if _has(t, "expansion", "capex", "new plant", "capacity", "commission", "greenfield",
             "brownfield", "commercial production"):
        return "Expansion", 1
    if _has(t, "pledge", "encumbrance", "invocation of", "revocation of pledge"):
        return "Pledge", -1
    if _has(t, "resignation", "resigns", "cessation", "stepping down", "demise of"):
        return "Resignation", -1
    if _has(t, "appointment", "appoint", "re-appointment", "induction of"):
        return "Appointment", 0
    if _has(t, "insolvency", "nclt", "ibc", "liquidation", "winding up", "moratorium"):
        return "Insolvency", -1
    if _has(t, "penalty", "demand order", "gst demand", "income tax", "show cause",
             "sebi order", "adjudicat", "fraud", "default in payment", "litigation",
             "tribunal", "search and seizure", "qualified opinion"):
        return "Litigation", -1
    if _has(t, "newspaper publication", "trading window", "clarification",
             "press release", "schedule of", "intimation", "disclosure under"):
        return "Update", 0
    return "Disclosure", 0


def classify_purpose(purpose: str | None, detail: str | None) -> str:
    t = f"{purpose or ''} {detail or ''}".lower()
    if _has(t, "result", "financial statement"):
        return "Results"
    if _has(t, "buy back", "buyback"):
        return "Buyback"
    if _has(t, "bonus"):
        return "Bonus"
    if _has(t, "split", "sub-division", "sub division"):
        return "Split"
    if _has(t, "dividend"):
        return "Dividend"
    if _has(t, "fund rais", "qip", "preferential", "raising of fund", "issue of",
             "rights issue", "warrant"):
        return "Fundraise"
    if _has(t, "amalgamation", "merger", "arrangement", "acquisition"):
        return "M&A"
    return "Board Meeting"


# ----------------------------------------------------------------------------
# XBRL parsing — pull current-quarter + year-ago Revenue / PBT / PAT / Income
# from an Ind-AS results filing. Values are absolute rupees -> convert to ₹ Cr.
# ----------------------------------------------------------------------------
_METRICS = {
    "revenue": "RevenueFromOperations",
    "pbt": "ProfitBeforeTax",
    "pat": "ProfitLossForPeriod",
    "income": "Income",
}


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_results_xbrl(xml: str | None) -> dict | None:
    """Return {revenue, pbt, pat, income, revenue_yoy, pat_yoy} in ₹ Cr, or None.

    A quarterly Ind-AS XBRL carries the current 3-month period and the year-ago
    3-month period (plus YTD/segment contexts we ignore). We pick the no-segment
    duration context ending latest as "current", and the one ~1 year earlier as
    the YoY base, then read each metric under those two contexts."""
    if not xml or "<" not in xml:
        return None
    try:
        root = ET.fromstring(xml.encode("utf-8", "replace") if isinstance(xml, str) else xml)
    except ET.ParseError:
        return None

    # 1. Index contexts: id -> (start, end, has_dimension).
    ctx: dict[str, tuple] = {}
    for el in root.iter():
        if _local(el.tag) != "context":
            continue
        cid = el.get("id")
        if not cid:
            continue
        start = end = None
        has_dim = False
        for sub in el.iter():
            ln = _local(sub.tag)
            txt = (sub.text or "").strip()
            if ln == "startDate":
                start = txt
            elif ln == "endDate":
                end = txt
            elif ln == "instant":
                start = end = txt
            elif ln in ("explicitMember", "typedMember"):
                has_dim = True
        ctx[cid] = (start, end, has_dim)

    def _days(s, e):
        try:
            return (dt.date.fromisoformat(e) - dt.date.fromisoformat(s)).days
        except (ValueError, TypeError):
            return None

    # 2. Quarter-length (~3 month), no-dimension duration contexts.
    quarters = []
    for cid, (s, e, d) in ctx.items():
        if d or not s or not e:
            continue
        nd = _days(s, e)
        if nd is not None and 80 <= nd <= 100:
            quarters.append((e, s, cid))
    if not quarters:
        return None
    quarters.sort(reverse=True)  # latest end first
    cur_end, cur_start, cur_id = quarters[0]

    # 3. Year-ago quarter: end ≈ current end minus 1 year.
    prior_id = None
    try:
        target_end = dt.date.fromisoformat(cur_end).replace(year=dt.date.fromisoformat(cur_end).year - 1)
        best = None
        for e, s, cid in quarters[1:]:
            try:
                gap = abs((dt.date.fromisoformat(e) - target_end).days)
            except ValueError:
                continue
            if gap <= 7 and (best is None or gap < best[0]):
                best = (gap, cid)
        if best:
            prior_id = best[1]
    except ValueError:
        pass

    # 4. Read facts: (metric, contextRef) -> value.
    facts: dict[tuple, float] = {}
    for el in root.iter():
        ln = _local(el.tag)
        for metric, tag in _METRICS.items():
            if ln == tag and el.get("contextRef") and (el.text or "").strip():
                try:
                    facts[(metric, el.get("contextRef"))] = float(el.text)
                except ValueError:
                    pass

    def cr(metric, cid):
        if not cid:
            return None
        v = facts.get((metric, cid))
        return round(v / 1e7, 2) if v is not None else None

    out = {m: cr(m, cur_id) for m in _METRICS}
    for m in ("revenue", "pat"):
        cur, prev = out[m], cr(m, prior_id)
        out[f"{m}_yoy"] = (round((cur - prev) / abs(prev) * 100, 1)
                           if cur is not None and prev not in (None, 0) else None)
    return out


# ----------------------------------------------------------------------------
# Orchestration
# ----------------------------------------------------------------------------
def _tracked_symbols(con) -> set[str]:
    try:
        rows = con.execute("SELECT DISTINCT symbol FROM delivery_daily").fetchall()
        return {r[0] for r in rows if r[0]}
    except Exception:  # noqa: BLE001
        return set()


def refresh(con, client, ann_days: int = 21, res_days: int = 800, xbrl_limit: int = 240) -> dict:
    """Ingest announcements, the forward calendar, and results (with XBRL numbers)
    into SQLite. Returns a small summary dict. Best-effort throughout — a failed
    feed just contributes zero rows.

    Two decoupled concerns:
      * Event *timing* (upcoming board meetings, just-filed results, concalls) is
        read from the live calendar + announcements feeds, which are current.
      * The *financial snapshot* (revenue/PBT/PAT + YoY) is the latest available
        quarterly filing per symbol. NSE's structured results feed lags the live
        season, so we don't impose a tight recency window — we take each symbol's
        most-recent filing (real numbers, possibly a quarter or two old) and parse
        its XBRL. The "results just happened" verdict comes from the announcements
        timing + price reaction, not from this snapshot's age. res_days is a wide
        safety bound only. YoY is computed inside each filing's XBRL."""
    today = dt.date.today()
    summary = {"announcements": 0, "calendar": 0, "results": 0, "xbrl": 0}

    # --- Announcements: a rolling recent window across the whole universe. -----
    frm = (today - dt.timedelta(days=ann_days)).strftime("%d-%m-%Y")
    to = today.strftime("%d-%m-%Y")
    raw = client.corp_announcements(frm, to) or client.corp_announcements()
    ann_rows = []
    for a in raw:
        sym = (a.get("symbol") or "").strip()
        if not sym:
            continue
        head = a.get("desc")
        detail = a.get("attchmntText")
        cat, pol = classify_announcement(head, detail)
        ann_rows.append({
            "seq_id": str(a.get("seq_id") or a.get("dt") or f"{sym}-{a.get('an_dt')}"),
            "symbol": sym,
            "company": a.get("sm_name"),
            "industry": a.get("smIndustry"),
            "an_dt": _iso_ts(a.get("an_dt") or a.get("sort_date")),
            "headline": head,
            "detail": detail,
            "category": cat,
            "polarity": pol,
            "attachment": a.get("attchmntFile"),
            "has_xbrl": 1 if a.get("hasXbrl") else 0,
        })
    summary["announcements"] = store.store_corp_announcements(con, ann_rows)

    # --- Forward calendar: upcoming board meetings. ---------------------------
    cal_rows = []
    for e in client.event_calendar() or []:
        sym = (e.get("symbol") or "").strip()
        ev = _iso(e.get("date"))
        if not sym or not ev:
            continue
        cal_rows.append({
            "symbol": sym,
            "company": e.get("company"),
            "event_date": ev,
            "purpose": e.get("purpose"),
            "detail": e.get("bm_desc"),
            "kind": classify_purpose(e.get("purpose"), e.get("bm_desc")),
        })
    summary["calendar"] = store.store_corp_calendar(con, cal_rows)

    # --- Quarterly results: latest filing per symbol + best-effort XBRL. ------
    tracked = _tracked_symbols(con)
    cutoff = today - dt.timedelta(days=res_days)
    # Keep the most-recent filing per symbol; prefer Consolidated on a tie-date.
    best: dict[str, tuple] = {}
    for r in client.fin_results() or []:
        sym = (r.get("symbol") or "").strip()
        if not sym or (tracked and sym not in tracked):
            continue
        bcast = _parse_dt(r.get("broadCastDate") or r.get("filingDate"))
        if not bcast or bcast.date() < cutoff:
            continue
        cons = 1 if (r.get("consolidated") or "").lower().startswith("consol") else 0
        rank = (bcast, cons)  # newer wins; consolidated breaks ties
        if sym not in best or rank > best[sym][0]:
            best[sym] = (rank, bcast, r)
    recent = sorted(([b, r] for (_, b, r) in best.values()), key=lambda x: x[0], reverse=True)

    res_rows = []
    fetched = 0
    for bcast, r in recent:
        nums = {}
        xbrl_url = r.get("xbrl")
        is_real_xbrl = bool(xbrl_url) and xbrl_url.rstrip("/").rsplit("/", 1)[-1] not in ("", "-")
        if is_real_xbrl and fetched < xbrl_limit:
            parsed = parse_results_xbrl(client.get_text(xbrl_url))
            fetched += 1
            if parsed:
                nums = parsed
                summary["xbrl"] += 1
        res_rows.append({
            "symbol": r.get("symbol"),
            "company": r.get("companyName"),
            "period_end": _iso(r.get("toDate")),
            "period_start": _iso(r.get("fromDate")),
            "quarter": r.get("relatingTo"),
            "fy": r.get("financialYear"),
            "consolidated": r.get("consolidated") or "Non-Consolidated",
            "audited": r.get("audited"),
            "broadcast_date": bcast.isoformat(timespec="seconds"),
            "xbrl_url": xbrl_url if is_real_xbrl else None,
            "revenue": nums.get("revenue"),
            "pbt": nums.get("pbt"),
            "pat": nums.get("pat"),
            "income": nums.get("income"),
            "revenue_yoy": nums.get("revenue_yoy"),
            "pat_yoy": nums.get("pat_yoy"),
        })
    summary["results"] = store.store_corp_results(con, res_rows)

    # --- PDF triggers: read recent event filings' attachments, best-effort. ---
    summary["pdf"] = refresh_pdf_triggers(con, client)

    con.commit()
    print(f"  corp: {summary['announcements']} announcements, {summary['calendar']} calendar, "
          f"{summary['results']} results ({summary['xbrl']} with XBRL numbers), "
          f"{summary['pdf']} PDF triggers")
    return summary


def refresh_pdf_triggers(con, client, limit: int = 160, days: int = 21) -> int:
    """Fetch + lexicon-scan the PDF attachment of each recent event-category
    announcement we haven't read yet, and cache the trigger read keyed by URL.

    Bounded and best-effort: at most `limit` new PDFs per run (the cache means
    each document is read once, ever), only high-signal categories, only the
    last `days`. A scanned (image-only) PDF is marked done with sentiment NULL so
    it isn't re-fetched. Any failure contributes zero and never breaks the run."""
    if corp_pdf is None:
        return 0
    done = store.pdf_analysed_urls(con)
    cut = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    cats = "(" + ",".join("?" * len(_EVENT_CATS)) + ")"
    rows = _rows(
        con,
        f"SELECT DISTINCT attachment FROM corp_announcements "
        f"WHERE an_dt >= ? AND category IN {cats} "
        f"AND attachment LIKE '%.pdf' ORDER BY an_dt DESC",
        (cut, *sorted(_EVENT_CATS)),
    )
    todo = [r["attachment"] for r in rows if r["attachment"] and r["attachment"] not in done]
    out = []
    for url in todo[:limit]:
        try:
            res = corp_pdf.analyze_url(client, url)
        except Exception:  # noqa: BLE001
            res = None
        if res is None:
            continue  # fetch failed — leave unmarked so a later run retries
        out.append({
            "attachment": url,
            "sentiment": res.get("sentiment"),
            "score": res.get("score"),
            "n_pos": res.get("n_pos"),
            "n_neg": res.get("n_neg"),
            "has_text": 1 if res.get("has_text") else 0,
            "n_pages": res.get("n_pages"),
            "ok": 1,
            "triggers": json.dumps(res.get("triggers") or []),
            "excerpt": res.get("excerpt") or "",
        })
    return store.store_corp_pdf(con, out)


# ----------------------------------------------------------------------------
# Payload scoring — turn the ingested facts + the per-stock price/flow entry
# into a pre-event "setup", a labelled model lean, and a post-event "verdict".
# Everything here is a transparent weighted blend of explainable inputs that
# already live on the screener entry (smart-money score, model composite,
# delivery, OI posture, trailing returns). Nothing is advice — it is a
# structured read of accumulation before an event and reaction after one.
# ----------------------------------------------------------------------------

# Categories that constitute a real, market-moving event (vs. routine filing).
_EVENT_CATS = {
    "Results", "Concall", "Presentation", "Order Win", "M&A", "Buyback",
    "Bonus", "Split", "Dividend", "Rating Up", "Rating Down", "Fundraise",
    "Expansion", "Pledge", "Insolvency", "Litigation", "Resignation",
}


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _oi_tilt(label: str | None) -> float:
    """Directional nudge (-1..+1) from the F&O open-interest read."""
    return {
        "Long Buildup": 1.0, "Short Covering": 0.5,
        "Short Buildup": -1.0, "Long Unwinding": -0.5,
    }.get(label or "", 0.0)


def _setup_label(v: float) -> str:
    if v >= 70:
        return "Strong setup"
    if v >= 55:
        return "Constructive"
    if v >= 40:
        return "Neutral"
    return "Weak setup"


def setup_score(e: dict) -> tuple[float | None, str | None]:
    """0-100 pre-event accumulation quality from the per-stock entry `e`.

    Blends the smart-money score, the cross-sectional model composite and its
    20-day up-probability, plus the trend score, then tilts for delivery
    conviction and F&O posture. Auto-renormalises over whatever is present."""
    # Each input lives on its own native scale, so normalise to 0-100 first:
    #   score        already 0-100 (smart-money score)
    #   composite    a cross-sectional z-score (~N(0, 0.6))  -> 50 + 25·z
    #   up_prob_20d  already a 0-100 probability percentage
    #   trend_score  a signed -100..+100 directional score   -> 50 + ½·t
    parts, wts = [], []
    if e.get("score") is not None:
        parts.append(_clamp(e["score"])); wts.append(0.35)
    if e.get("composite") is not None:
        parts.append(_clamp(50.0 + 25.0 * e["composite"])); wts.append(0.25)
    if e.get("up_prob_20d") is not None:
        parts.append(_clamp(e["up_prob_20d"])); wts.append(0.20)
    if e.get("trend_score") is not None:
        parts.append(_clamp(50.0 + 0.5 * e["trend_score"])); wts.append(0.20)
    if not parts:
        return None, None
    base = sum(p * w for p, w in zip(parts, wts)) / sum(wts)
    # Conviction tilt: delivery surge + OI posture, ±~8 points total.
    tilt = 0.0
    ds = e.get("deliv_surge")
    if ds is not None:
        tilt += max(-1.0, min(1.0, (ds - 1.0) / 0.5)) * 4.0
    tilt += _oi_tilt(e.get("oi_label")) * 4.0
    val = round(_clamp(base + tilt), 1)
    return val, _setup_label(val)


def model_lean(e: dict, setup: float | None) -> tuple[float | None, str | None]:
    """A labelled, model-derived lean for an event-driven move — explicitly an
    estimate, not a prediction or advice. Anchors on the 20-day up-probability
    and nudges toward the setup quality."""
    p = e.get("up_prob_20d")  # already a 0-100 probability percentage
    if p is None and setup is None:
        return None, None
    if p is None:
        prob = setup
    elif setup is not None:
        prob = 0.65 * p + 0.35 * setup
    else:
        prob = p
    prob = round(_clamp(prob))
    if prob >= 62:
        lbl = "Leans positive"
    elif prob >= 45:
        lbl = "Balanced"
    else:
        lbl = "Leans cautious"
    return prob, lbl


def verdict(e: dict, fin: dict | None) -> dict | None:
    """Post-event read: financial delta (where XBRL numbers parsed) + a market-
    reaction proxy (smart-money score + 1-month return). We don't have intraday
    event windows, so reaction is read from how the tape currently sits."""
    reasons: list[str] = []
    pos = neg = 0
    if fin:
        py, ry = fin.get("pat_yoy"), fin.get("revenue_yoy")
        if py is not None:
            if py >= 15:
                pos += 2; reasons.append(f"PAT +{py:.0f}% YoY")
            elif py <= -15:
                neg += 2; reasons.append(f"PAT {py:.0f}% YoY")
            else:
                reasons.append(f"PAT {py:+.0f}% YoY")
        if ry is not None:
            if ry >= 12:
                pos += 1; reasons.append(f"Rev +{ry:.0f}% YoY")
            elif ry <= -10:
                neg += 1; reasons.append(f"Rev {ry:.0f}% YoY")
    sc = e.get("score")
    if sc is not None:
        if sc >= 65:
            pos += 1; reasons.append("strong accumulation")
        elif sc <= 35:
            neg += 1
    r1 = e.get("ret_1m")
    if r1 is not None:
        if r1 >= 8:
            pos += 1; reasons.append(f"+{r1:.0f}% 1M")
        elif r1 <= -8:
            neg += 1; reasons.append(f"{r1:.0f}% 1M")
    net = pos - neg
    if net >= 3:
        lbl = "Delivered strong"
    elif net >= 1:
        lbl = "Positive"
    elif net <= -2:
        lbl = "Disappointed"
    elif pos or neg:
        lbl = "Mixed"
    else:
        return None
    return {"label": lbl, "net": net, "reasons": reasons[:4]}


# --- view projectors (compact JSON for the web app) -------------------------
def _event_view(c: dict) -> dict:
    return {"date": c.get("event_date"), "purpose": c.get("purpose"),
            "kind": c.get("kind"), "detail": c.get("detail")}


def _fin_view(r: dict) -> dict:
    return {"period_end": r.get("period_end"), "quarter": r.get("quarter"),
            "fy": r.get("fy"), "consolidated": r.get("consolidated"),
            "revenue": r.get("revenue"), "pbt": r.get("pbt"), "pat": r.get("pat"),
            "income": r.get("income"), "revenue_yoy": r.get("revenue_yoy"),
            "pat_yoy": r.get("pat_yoy"), "broadcast_date": r.get("broadcast_date")}


def _ann_view(a: dict, pdf_by_url: dict | None = None) -> dict:
    v = {"date": a.get("an_dt"), "category": a.get("category"),
         "polarity": a.get("polarity"), "headline": a.get("headline"),
         "attachment": a.get("attachment")}
    p = (pdf_by_url or {}).get(a.get("attachment"))
    if p:
        v["pdf"] = p  # {sentiment, score, triggers:[{label,polarity,phrase,snippet}], excerpt}
    return v


def _flag_view(s: dict, last: dict | None = None) -> dict:
    vd = s.get("verdict")
    return {"symbol": s["symbol"], "company": s["company"], "sector": s["sector"],
            "setup": s["setup"], "setup_label": s["setup_label"],
            "lean_prob": s["lean_prob"], "lean_label": s["lean_label"],
            "verdict": vd["label"] if vd else None,
            "verdict_reasons": vd["reasons"] if vd else [],
            "last_category": last["category"] if last else None,
            "last_headline": last["headline"] if last else None,
            "last_polarity": last["polarity"] if last else None,
            "last_date": last["date"] if last else None,
            "next_event": s.get("next_event")}


def _days_until(iso: str | None, today: dt.date) -> int | None:
    try:
        return (dt.date.fromisoformat(iso) - today).days
    except (ValueError, TypeError):
        return None


def _rows(con, sql: str, args: tuple = ()) -> list[dict]:
    try:
        return [dict(r) for r in con.execute(sql, args).fetchall()]
    except Exception:  # noqa: BLE001
        return []


def build_payload(con, by_symbol: dict, today: dt.date | None = None) -> tuple[dict, dict]:
    """Assemble the "Earnings & Events" payload + per-symbol summaries.

    Reads the three corp tables, joins each row to its live price/flow entry in
    `by_symbol` (symbol -> enriched screener entry), and produces:
      * a forward `calendar` strip + a `recommend` list (upcoming events ranked
        by setup quality),
      * dashboard `flags` (strong setups with an event near, recent strong /
        weak verdicts),
      * a `recent_events` feed, and
      * `summaries[sym]` — the per-stock Management & Financial block the detail
        page renders (next event, verdict, financial snapshot, timeline).
    Returns (payload, summaries). Tolerant of missing tables (returns empties)."""
    today = today or dt.date.today()
    today_iso = today.isoformat()
    recent_cut = (today - dt.timedelta(days=30)).isoformat()

    # Latest results row per symbol: prefer the one with parsed numbers, then
    # consolidated, then newest broadcast.
    fin_by_sym: dict[str, tuple] = {}
    for r in _rows(con, "SELECT * FROM corp_results ORDER BY broadcast_date DESC"):
        sym = r["symbol"]
        rank = (1 if r.get("pat") is not None else 0,
                1 if str(r.get("consolidated") or "").lower().startswith("consol") else 0,
                r.get("broadcast_date") or "")
        cur = fin_by_sym.get(sym)
        if cur is None or rank > cur[0]:
            fin_by_sym[sym] = (rank, r)
    fin_by_sym = {s: v[1] for s, v in fin_by_sym.items()}

    cal = _rows(con,
                "SELECT * FROM corp_calendar WHERE event_date >= ? ORDER BY event_date ASC",
                (today_iso,))
    anns = _rows(con,
                 "SELECT * FROM corp_announcements WHERE an_dt >= ? ORDER BY an_dt DESC",
                 (recent_cut,))

    # PDF-trigger reads, keyed by attachment URL. Keep only documents that
    # actually yielded at least one trigger (skip scanned/empty/neutral-blank).
    pdf_by_url: dict[str, dict] = {}
    for r in _rows(con, "SELECT * FROM corp_pdf_analysis WHERE ok = 1"):
        try:
            trg = json.loads(r.get("triggers") or "[]")
        except (ValueError, TypeError):
            trg = []
        if not trg:
            continue
        pdf_by_url[r["attachment"]] = {
            "sentiment": r.get("sentiment"), "score": r.get("score"),
            "n_pos": r.get("n_pos"), "n_neg": r.get("n_neg"),
            "triggers": trg, "excerpt": r.get("excerpt") or "",
        }

    # --- per-symbol summaries (only for symbols we have a live entry for) -----
    syms = set(fin_by_sym) | {c["symbol"] for c in cal} | {a["symbol"] for a in anns}
    summaries: dict[str, dict] = {}
    for sym in syms:
        e = by_symbol.get(sym)
        if not e:
            continue
        fin = fin_by_sym.get(sym)
        sset, slabel = setup_score(e)
        prob, plabel = model_lean(e, sset)
        nxt = next((c for c in cal if c["symbol"] == sym), None)
        ev = [a for a in anns if a["symbol"] == sym and a["category"] in _EVENT_CATS]
        vd = verdict(e, fin) if (ev or fin) else None
        timeline = [_ann_view(a, pdf_by_url) for a in ev[:10]]
        # Most-recent filing whose PDF yielded a trigger read — the headline
        # "what the document actually says" signal for this name.
        pdf_read = next((t["pdf"] for t in timeline if t.get("pdf")), None)
        summaries[sym] = {
            "symbol": sym,
            "company": e.get("company") or (fin or {}).get("company"),
            "sector": e.get("sector"),
            "close": e.get("close"),
            "pct_change": e.get("pct_change"),
            "setup": sset, "setup_label": slabel,
            "lean_prob": prob, "lean_label": plabel,
            "next_event": _event_view(nxt) if nxt else None,
            "verdict": vd,
            "financials": _fin_view(fin) if fin else None,
            "timeline": timeline,
            "pdf": pdf_read,
        }

    # --- recommendation list: upcoming events ranked by setup quality ---------
    seen: dict[str, dict] = {}
    for c in cal:
        s = summaries.get(c["symbol"])
        if not s or s["setup"] is None or c["symbol"] in seen:
            continue
        seen[c["symbol"]] = {
            **_event_view(c), "symbol": c["symbol"],
            "company": s["company"], "sector": s["sector"],
            "setup": s["setup"], "setup_label": s["setup_label"],
            "lean_prob": s["lean_prob"], "lean_label": s["lean_label"],
            "days_until": _days_until(c["event_date"], today),
        }
    recommend = sorted(seen.values(), key=lambda x: x["setup"], reverse=True)
    calendar_strip = sorted(
        seen.values(), key=lambda x: (x["days_until"] if x["days_until"] is not None else 999,
                                      -x["setup"]))

    # --- dashboard flags ------------------------------------------------------
    strong_setup = [u for u in recommend if u["setup"] >= 65][:20]
    recent_strong, recent_weak = [], []
    for s in summaries.values():
        last = s["timeline"][0] if s["timeline"] else None
        if not last:
            continue
        vd = s.get("verdict")
        good = vd and vd["label"] in ("Delivered strong", "Positive")
        bad = (vd and vd["label"] == "Disappointed") or last["polarity"] < 0
        if good and last["polarity"] >= 0:
            recent_strong.append(_flag_view(s, last))
        elif bad:
            recent_weak.append(_flag_view(s, last))
    recent_strong.sort(key=lambda x: x["setup"] or 0, reverse=True)
    recent_weak.sort(key=lambda x: x["setup"] or 0)

    payload = {
        "updated": dt.datetime.now().isoformat(timespec="seconds"),
        "stats": {
            "calendar": len(cal),
            "announcements_30d": len(anns),
            "results": len(fin_by_sym),
            "covered": len(summaries),
        },
        "calendar": calendar_strip[:60],
        "recommend": recommend[:40],
        "flags": {
            "upcoming_strong": strong_setup,
            "recent_strong": recent_strong[:20],
            "recent_weak": recent_weak[:20],
        },
        "recent_events": [
            {**_ann_view(a, pdf_by_url), "symbol": a["symbol"], "company": a.get("company")}
            for a in anns if a["category"] in _EVENT_CATS
        ][:60],
    }
    return payload, summaries


if __name__ == "__main__":  # manual: python corp.py
    from nse_client import NSEClient
    _con = store.connect()
    refresh(_con, NSEClient())
    _con.close()
