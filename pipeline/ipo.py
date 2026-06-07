"""IPO Radar — recently listed stocks, scored on transparent post-listing behaviour.

Two parts:
  1. fetch_and_store(): pull NSE's public-past-issues list (issue price + listing
     date per symbol) into the ipo_issues table.
  2. build_ipo_payload(): join those issues to our delivery_daily EOD history and
     compute, per recent listing, how it has behaved since debut — return vs issue
     price, post-listing momentum, delivery accumulation (real demat demand), and
     liquidity — then rank the cohort with a cross-sectional "IPO Strength" score.

This is a quantitative observation of order flow and price behaviour, NOT a buy
recommendation and NOT investment advice. Newly listed stocks are thinly traded
and exceptionally volatile; the score measures *what has already happened*, not a
forecast of future returns.
"""
from __future__ import annotations

import datetime as dt

import numpy as np

import mathx

PAST_ISSUES_URL = "https://www.nseindia.com/api/public-past-issues"
UPCOMING_URL = "https://www.nseindia.com/api/all-upcoming-issues?category=ipo"
CURRENT_URL = "https://www.nseindia.com/api/ipo-current-issue"

# How far back a listing can be and still count as "recent" for the radar.
WINDOW_DAYS = 365
# Need at least this many EOD sessions to compute behaviour metrics.
MIN_SESSIONS = 4


def _board(security_type: str | None) -> str:
    st = (security_type or "").upper()
    if st == "EQ":
        return "Mainboard"
    if st in ("SME", "BE", "SM", "ST"):
        return "SME"
    return "Other"


def _parse_date(s: str | None):
    if not s:
        return None
    s = s.strip()
    for fmt in ("%d-%b-%Y", "%d-%B-%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s.title() if "%b" in fmt or "%B" in fmt else s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_price(s) -> float | None:
    if s is None:
        return None
    try:
        return float(str(s).strip())
    except ValueError:
        return None


def fetch_and_store(con, client=None) -> int:
    """Fetch NSE past IPO issues and upsert into ipo_issues. Returns row count."""
    if client is None:
        from nse_client import NSEClient
        client = NSEClient()
    try:
        rows = client.get_json(PAST_ISSUES_URL)
    except Exception as e:  # noqa: BLE001
        print(f"  ! ipo past-issues fetch failed: {e}")
        return 0
    if not isinstance(rows, list):
        return 0

    now = dt.datetime.now().isoformat(timespec="seconds")
    payload = []
    for r in rows:
        sym = (r.get("symbol") or "").strip()
        if not sym:
            continue
        ld = _parse_date(r.get("listingDate"))
        payload.append([
            sym, r.get("companyName") or r.get("company"),
            r.get("securityType"), _board(r.get("securityType")),
            _parse_price(r.get("issuePrice")), r.get("priceRange"),
            ld.isoformat() if ld else None,
            (_parse_date(r.get("ipoStartDate")) or "") and _parse_date(r.get("ipoStartDate")).isoformat(),
            (_parse_date(r.get("ipoEndDate")) or "") and _parse_date(r.get("ipoEndDate")).isoformat(),
            now,
        ])
    con.executemany(
        """INSERT OR REPLACE INTO ipo_issues
           (symbol, company, security_type, board, issue_price, price_range,
            listing_date, ipo_start, ipo_end, fetched_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""", payload)
    con.commit()
    print(f"  + ipo_issues: stored {len(payload)} past issues")
    return len(payload)


def _f(x):
    try:
        return float(str(x).strip())
    except (TypeError, ValueError):
        return None


def fetch_upcoming(con, client=None) -> int:
    """Fetch open + upcoming IPOs and their live subscription multiple. The table
    is fully replaced each run (the open set is small and changes daily)."""
    if client is None:
        from nse_client import NSEClient
        client = NSEClient()
    try:
        upcoming = client.get_json(UPCOMING_URL)
    except Exception as e:  # noqa: BLE001
        print(f"  ! ipo upcoming fetch failed: {e}")
        upcoming = []
    sub = {}
    try:
        for r in client.get_json(CURRENT_URL):
            if r.get("category") in (None, "Total"):
                sub[r.get("symbol")] = r
    except Exception as e:  # noqa: BLE001
        print(f"  ! ipo current fetch failed: {e}")

    rows = {}
    for r in (upcoming or []):
        sym = (r.get("symbol") or "").strip()
        if sym:
            rows[sym] = r
    for sym, r in sub.items():  # current-issue also carries active rows
        rows.setdefault(sym, r)

    now = dt.datetime.now().isoformat(timespec="seconds")
    payload = []
    for sym, r in rows.items():
        s = sub.get(sym, {})
        payload.append([
            sym, r.get("companyName"), r.get("series"), _board(r.get("series")),
            r.get("issuePrice"), r.get("issueSize"),
            (_parse_date(r.get("issueStartDate")) or None) and _parse_date(r.get("issueStartDate")).isoformat(),
            (_parse_date(r.get("issueEndDate")) or None) and _parse_date(r.get("issueEndDate")).isoformat(),
            r.get("status"), _f(s.get("noOfTime")),
            _f(s.get("noOfSharesOffered")), _f(s.get("noOfsharesBid")), now,
        ])
    con.execute("DELETE FROM ipo_upcoming")
    if payload:
        con.executemany(
            """INSERT OR REPLACE INTO ipo_upcoming
               (symbol, company, series, board, price_range, issue_size,
                issue_start, issue_end, status, sub_times, shares_offered,
                shares_bid, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", payload)
    con.commit()
    print(f"  + ipo_upcoming: stored {len(payload)} open/upcoming issues")
    return len(payload)


def _upcoming_payload(con, date: str) -> list[dict]:
    rows = con.execute("SELECT * FROM ipo_upcoming").fetchall()
    asof = dt.date.fromisoformat(date)
    out = []
    for r in rows:
        end = dt.date.fromisoformat(r["issue_end"]) if r["issue_end"] else None
        start = dt.date.fromisoformat(r["issue_start"]) if r["issue_start"] else None
        # phase relative to the latest session date in our data
        if start and asof < start:
            phase = "Upcoming"
        elif end and asof > end:
            phase = "Closed"
        else:
            phase = "Open"
        sub = r["sub_times"]
        out.append({
            "symbol": r["symbol"], "company": r["company"], "board": r["board"],
            "price_range": r["price_range"], "issue_size": r["issue_size"],
            "issue_start": r["issue_start"], "issue_end": r["issue_end"],
            "status": r["status"], "phase": phase,
            "sub_times": round(sub, 2) if sub is not None else None,
            "sub_label": (None if sub is None else
                          "Oversubscribed" if sub >= 1 else "Undersubscribed"),
            "days_to_close": (end - asof).days if end else None,
        })
    # open first, then upcoming, then closed; within, by subscription desc
    order = {"Open": 0, "Upcoming": 1, "Closed": 2}
    out.sort(key=lambda e: (order.get(e["phase"], 3), -(e["sub_times"] or 0)))
    return out


def _series(con, symbol: str) -> list[dict]:
    rows = con.execute(
        """SELECT date, close, high, deliv_pct, volume, turnover_lacs
           FROM delivery_daily WHERE symbol = ? ORDER BY date""", (symbol,)).fetchall()
    return [dict(r) for r in rows]


def _pct(a, b):
    return None if not b else (a - b) / b * 100.0


def build_ipo_payload(con, date: str, sec_map: dict, screener_entries: dict | None = None,
                      window_days: int = WINDOW_DAYS) -> dict | None:
    """Score recently listed stocks on post-listing behaviour. Returns None if the
    ipo_issues table is empty (fetch hasn't run yet) — analyze then omits the key."""
    issues = con.execute(
        "SELECT * FROM ipo_issues WHERE listing_date IS NOT NULL").fetchall()
    if not issues:
        return None

    asof = dt.date.fromisoformat(date)
    cutoff = asof - dt.timedelta(days=window_days)
    screener_entries = screener_entries or {}

    raw = []  # per-IPO metric dicts, pre cross-sectional scoring
    for iss in issues:
        ld = dt.date.fromisoformat(iss["listing_date"])
        if ld < cutoff or ld > asof:
            continue
        sym = iss["symbol"]
        s = _series(con, sym)
        if len(s) < MIN_SESSIONS:
            continue

        closes = [r["close"] for r in s if r["close"] is not None]
        highs = [r["high"] for r in s if r["high"] is not None] or closes
        delivs = [r["deliv_pct"] for r in s]
        vols = [r["volume"] for r in s if r["volume"] is not None]
        turns = [(r["turnover_lacs"] or 0) / 100.0 for r in s]
        if len(closes) < MIN_SESSIONS:
            continue

        issue_px = iss["issue_price"]
        listing_close = closes[0]
        cur = closes[-1]
        peak = max(highs)

        n = len(closes)
        k = min(20, n - 1)
        mom = _pct(cur, closes[-1 - k]) if k >= 1 else None

        deliv_clean = [d for d in delivs if d is not None]
        deliv_recent = float(np.mean(deliv_clean[-10:])) if deliv_clean else None
        mk = mathx.mann_kendall(delivs) if len([d for d in delivs if d is not None]) >= 8 else None
        deliv_trend_z = mk["z"] if mk else 0.0

        vol_recent = float(np.mean(vols[-5:])) if vols else None
        vol_all = float(np.mean(vols)) if vols else None
        vol_ratio = (vol_recent / vol_all) if (vol_recent and vol_all) else None
        avg_turn = float(np.mean(turns)) if turns else 0.0

        sc = screener_entries.get(sym, {})
        raw.append({
            "symbol": sym,
            "company": iss["company"],
            "sector": sec_map.get(sym) or sc.get("sector"),
            "board": iss["board"],
            "listing_date": iss["listing_date"],
            "days_listed": (asof - ld).days,
            "sessions": n,
            "issue_price": issue_px,
            "price_range": iss["price_range"],
            "close": cur,
            "listing_close": listing_close,
            "ret_issue": _pct(cur, issue_px) if issue_px else None,
            "listing_gain": _pct(listing_close, issue_px) if issue_px else None,
            "post_listing": _pct(cur, listing_close),
            "from_high": _pct(cur, peak),
            "mom_20": mom,
            "deliv_recent": round(deliv_recent, 1) if deliv_recent is not None else None,
            "deliv_trend_z": round(deliv_trend_z, 2),
            "vol_ratio": round(vol_ratio, 2) if vol_ratio else None,
            "avg_turnover_cr": round(avg_turn, 2),
            "score": sc.get("score"),
            "signal": sc.get("signal"),
            "up_prob_20d": sc.get("up_prob_20d"),
            "composite": sc.get("composite"),
            "trend_label": sc.get("trend_label"),
            # compact close series (vs issue price) for the sparkline
            "series": [{"d": r["date"], "c": r["close"]} for r in s if r["close"] is not None][-60:],
        })

    if not raw:
        return None

    # --- cross-sectional IPO Strength score within the cohort ---
    def col(key):
        return {e["symbol"]: e.get(key) for e in raw}

    z_post = mathx.cross_z(col("post_listing"))
    z_mom = mathx.cross_z(col("mom_20"))
    z_dlv_lvl = mathx.cross_z(col("deliv_recent"))
    z_dlv_trd = mathx.cross_z(col("deliv_trend_z"))
    z_liq = mathx.cross_z({s: (np.log1p(v) if v else None)
                           for s, v in col("avg_turnover_cr").items()})
    # trend quality: model composite where present, else fall back to smart-money score
    trend_raw = {e["symbol"]: (e["composite"] if e.get("composite") is not None
                               else ((e["score"] - 50) / 25 if e.get("score") is not None else None))
                 for e in raw}
    z_trend = mathx.cross_z(trend_raw)

    W = {"post": 0.28, "mom": 0.22, "dlv": 0.25, "trend": 0.15, "liq": 0.10}
    composite = {}
    for e in raw:
        s = e["symbol"]
        dlv = 0.6 * z_dlv_lvl.get(s, 0.0) + 0.4 * z_dlv_trd.get(s, 0.0)
        composite[s] = (W["post"] * z_post.get(s, 0.0)
                        + W["mom"] * z_mom.get(s, 0.0)
                        + W["dlv"] * dlv
                        + W["trend"] * z_trend.get(s, 0.0)
                        + W["liq"] * z_liq.get(s, 0.0))

    strength = mathx.percentile_rank(composite)  # 0-100 within cohort
    # per-factor 0-100 percentiles for transparent UI bars
    f_post = mathx.percentile_rank(col("post_listing"))
    f_mom = mathx.percentile_rank(col("mom_20"))
    f_dlv = mathx.percentile_rank({s: 0.6 * z_dlv_lvl.get(s, 0.0) + 0.4 * z_dlv_trd.get(s, 0.0)
                                   for s in composite})
    f_liq = mathx.percentile_rank(col("avg_turnover_cr"))

    def label(p):
        if p is None:
            return "Unrated"
        if p >= 80:
            return "Strong Momentum"
        if p >= 60:
            return "Building"
        if p >= 40:
            return "Mixed"
        if p >= 20:
            return "Soft"
        return "Weak"

    for e in raw:
        s = e["symbol"]
        e["strength"] = strength.get(s)
        e["strength_label"] = label(strength.get(s))
        e["composite_z"] = round(composite.get(s, 0.0), 3)
        e["factors"] = {
            "momentum": f_mom.get(s),
            "post_listing": f_post.get(s),
            "delivery": f_dlv.get(s),
            "liquidity": f_liq.get(s),
        }

    raw.sort(key=lambda e: (e["strength"] if e["strength"] is not None else -1), reverse=True)

    # --- cohort summary ---
    rets = [e["ret_issue"] for e in raw if e["ret_issue"] is not None]
    above = [r for r in rets if r > 0]
    with_ret = [e for e in raw if e["ret_issue"] is not None]
    best = max(with_ret, key=lambda e: e["ret_issue"], default=None)
    worst = min(with_ret, key=lambda e: e["ret_issue"], default=None)
    mainboard = [e for e in raw if e["board"] == "Mainboard"]

    summary = {
        "count": len(raw),
        "mainboard": len(mainboard),
        "sme": sum(1 for e in raw if e["board"] == "SME"),
        "above_issue": len(above),
        "above_issue_pct": round(len(above) / len(rets) * 100, 1) if rets else None,
        "median_ret": round(float(np.median(rets)), 1) if rets else None,
        "best": {"symbol": best["symbol"], "ret": round(best["ret_issue"], 1)} if best else None,
        "worst": {"symbol": worst["symbol"], "ret": round(worst["ret_issue"], 1)} if worst else None,
    }

    return {
        "as_of": date,
        "window_days": window_days,
        "summary": summary,
        "upcoming": _upcoming_payload(con, date),
        "items": raw,
        "weights": W,
        "method": ("Recent listings (last 12 months) joined to NSE end-of-day delivery "
                   "history. IPO Strength is a cross-sectional percentile blending post-"
                   "listing momentum, recent momentum, delivery accumulation (Mann-Kendall "
                   "trend + level), relative trend quality and liquidity — a measure of "
                   "realized behaviour, not a forecast."),
    }


if __name__ == "__main__":
    import store
    con = store.connect()
    fetch_and_store(con)
    fetch_upcoming(con)
    con.close()
    print("done")
