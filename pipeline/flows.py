"""FII/DII money-flow aggregation across timeframes.

Two complementary lenses on foreign + domestic institutional money:

  1. NSE FII/DII cash-market net (₹ Cr) — the headline daily buy/sell that the
     market watches. We roll it up into Day / Week / Month / Quarter / Year
     buckets and build cumulative series so you can see the persistent trend,
     not just the daily noise.

  2. NSDL FPI by instrument (Equity / Debt / Hybrid) — *where* foreign money is
     actually going (asset-class destination), which the cash figure hides.

Plus a delivery-based read of which *sectors* are absorbing the most delivered
(real, taken-to-demat) money lately — a proxy for institutional concentration,
since the cash FII/DII number isn't published per-sector.

Pure Python, calendar-based bucketing. Every number traces to a stored row.
"""
from __future__ import annotations

import datetime as dt


def _d(s: str) -> dt.date:
    return dt.date.fromisoformat(s)


def fii_dii_series(con) -> list[dict]:
    """Daily FII & DII cash net (₹ Cr), oldest->newest, with cumulative totals."""
    by_date: dict[str, dict] = {}
    for r in con.execute(
            "SELECT date, category, buy, sell, net FROM fiidii_daily ORDER BY date"):
        d = by_date.setdefault(r["date"], {"date": r["date"], "fii": None, "dii": None})
        cat = (r["category"] or "").upper()
        if "FII" in cat or "FPI" in cat:
            d["fii"] = r["net"]
        elif "DII" in cat:
            d["dii"] = r["net"]
    series = sorted(by_date.values(), key=lambda x: x["date"])
    fc = dc = 0.0
    for row in series:
        fc += row["fii"] or 0.0
        dc += row["dii"] or 0.0
        row["fii_cum"] = round(fc, 1)
        row["dii_cum"] = round(dc, 1)
    return series


# --- calendar bucketing -----------------------------------------------------

def _period_key(d: dt.date, gran: str) -> str:
    if gran == "day":
        return d.isoformat()
    if gran == "week":
        iso = d.isocalendar()  # (year, week, weekday)
        return f"{iso[0]}-W{iso[1]:02d}"
    if gran == "month":
        return f"{d.year}-{d.month:02d}"
    if gran == "quarter":
        return f"{d.year}-Q{(d.month - 1) // 3 + 1}"
    if gran == "year":
        return str(d.year)
    raise ValueError(gran)


def aggregate(series: list[dict], gran: str) -> list[dict]:
    """Sum daily FII/DII net into calendar buckets, oldest->newest, cumulative."""
    buckets: dict[str, dict] = {}
    for row in series:
        key = _period_key(_d(row["date"]), gran)
        b = buckets.setdefault(key, {"period": key, "fii": 0.0, "dii": 0.0,
                                     "sessions": 0, "start": row["date"], "end": row["date"]})
        b["fii"] += row["fii"] or 0.0
        b["dii"] += row["dii"] or 0.0
        b["sessions"] += 1
        b["end"] = row["date"]
    out = sorted(buckets.values(), key=lambda x: x["start"])
    fc = dc = 0.0
    for b in out:
        b["fii"] = round(b["fii"], 1)
        b["dii"] = round(b["dii"], 1)
        b["net"] = round(b["fii"] + b["dii"], 1)
        fc += b["fii"]
        dc += b["dii"]
        b["fii_cum"] = round(fc, 1)
        b["dii_cum"] = round(dc, 1)
    return out


def timeframes(series: list[dict]) -> dict[str, list]:
    """All five timeframe rollups. Day keeps the full daily series."""
    day = [{"period": r["date"], "fii": r["fii"] or 0.0, "dii": r["dii"] or 0.0,
            "net": round((r["fii"] or 0.0) + (r["dii"] or 0.0), 1),
            "fii_cum": r["fii_cum"], "dii_cum": r["dii_cum"], "sessions": 1,
            "start": r["date"], "end": r["date"]} for r in series]
    return {
        "day": day[-60:],
        "week": aggregate(series, "week")[-52:],
        "month": aggregate(series, "month")[-24:],
        "quarter": aggregate(series, "quarter")[-12:],
        "year": aggregate(series, "year"),
    }


# --- NSDL asset-class destination ------------------------------------------

def nsdl_destination(con) -> dict | None:
    """FPI net by instrument over time + the latest snapshot. Shows whether
    foreign money is rotating into Equity vs Debt vs Hybrid."""
    rows = con.execute(
        "SELECT date, instrument, net, net_usd FROM fpi_nsdl_daily ORDER BY date"
    ).fetchall()
    if not rows:
        return None
    latest_date = rows[-1]["date"]
    series: dict[str, list] = {}
    for r in rows:
        series.setdefault(r["instrument"], []).append(
            {"date": r["date"], "net": r["net"]})
    latest = [{"instrument": r["instrument"], "net": r["net"], "net_usd": r["net_usd"]}
              for r in rows if r["date"] == latest_date]
    return {"date": latest_date, "latest": latest, "series": series}


# --- FII derivatives (F&O positioning, 1-year date-addressed NSE history) ----

_DERIV_CATS = ["Index Futures", "Stock Futures", "Index Options", "Stock Options"]


def fii_deriv_flows(con) -> dict | None:
    """FII F&O flows: per-category net (buy−sell, ₹ Cr) daily + monthly rollup,
    plus the latest open-interest snapshot (where FII is positioned). Index- and
    stock-futures net is the classic FII directional gauge; OI shows conviction."""
    rows = con.execute(
        "SELECT date, instrument, net, oi_amt, oi_contracts FROM fii_deriv_daily ORDER BY date"
    ).fetchall()
    if not rows:
        return None
    by_date: dict[str, dict] = {}
    monthly: dict[str, dict] = {}
    for r in rows:
        d = by_date.setdefault(r["date"], {"date": r["date"]})
        d[r["instrument"]] = r["net"]
        mk = r["date"][:7]
        m = monthly.setdefault(mk, {"period": mk, **{c: 0.0 for c in _DERIV_CATS}})
        if r["instrument"] in m:
            m[r["instrument"]] += r["net"] or 0.0
    series = sorted(by_date.values(), key=lambda x: x["date"])
    mser = sorted(monthly.values(), key=lambda x: x["period"])
    for m in mser:
        for c in _DERIV_CATS:
            m[c] = round(m[c], 1)
    latest_date = series[-1]["date"]
    latest = [{"instrument": r["instrument"], "net": r["net"],
               "oi_amt": r["oi_amt"], "oi_contracts": r["oi_contracts"]}
              for r in rows if r["date"] == latest_date]
    return {"date": latest_date, "latest": latest,
            "series": series[-90:], "monthly": mser[-13:]}


# --- reconciled NSDL track (official, multi-year) ---------------------------

def _bucket_fpi(rows: list[dict], gran: str) -> dict[str, dict]:
    """Sum daily reconciled FPI net into calendar buckets keyed by period."""
    out: dict[str, dict] = {}
    for r in rows:
        key = _period_key(_d(r["date"]), gran)
        b = out.setdefault(key, {"period": key, "fii": 0.0, "sessions": 0})
        b["fii"] += r["net"] or 0.0
        b["sessions"] += 1
    return out


def reconciled_flows(con) -> dict | None:
    """NSDL-confirmed cash flows (reconciled, official) — the counterpart to the
    provisional same-day FII/DII. FII = daily NSDL FPI (₹ Cr), summed into Month/
    Quarter/Year buckets; DII = NSE's monthly Total-DII history (back to 2021).
    Both are paired per month so the long-horizon trend is real, not interpolated.
    The daily lens keeps FPI only (DII isn't published daily at this reconciliation)."""
    fpi = [{"date": r["date"], "net": r["net"]} for r in con.execute(
        "SELECT date, net FROM cat_fpi_daily ORDER BY date")]
    dii_m = {r["month"]: r["net"] for r in con.execute(
        "SELECT month, net FROM cat_dii_monthly")}
    if not fpi and not dii_m:
        return None

    def build(gran: str, dii_key) -> list[dict]:
        fb = _bucket_fpi(fpi, gran)
        keys = sorted(set(fb) | {dii_key(m) for m in dii_m})
        out, fc, dc = [], 0.0, 0.0
        for k in keys:
            fii = round(fb.get(k, {}).get("fii", 0.0), 1)
            dii = round(sum(v for m, v in dii_m.items() if dii_key(m) == k and v is not None), 1)
            fc += fii
            dc += dii
            out.append({"period": k, "fii": fii, "dii": dii,
                        "net": round(fii + dii, 1), "fii_cum": round(fc, 1),
                        "dii_cum": round(dc, 1),
                        "sessions": fb.get(k, {}).get("sessions", 0)})
        return out

    month = build("month", lambda m: m)
    quarter = build("quarter", lambda m: f"{m[:4]}-Q{(int(m[5:7]) - 1) // 3 + 1}")
    year = build("year", lambda m: m[:4])
    day = [{"period": r["date"], "fii": round(r["net"], 1)} for r in fpi][-90:]
    return {
        "fpi_date": fpi[-1]["date"] if fpi else None,
        "dii_month": max(dii_m) if dii_m else None,
        "timeframes": {"day": day, "month": month[-36:],
                       "quarter": quarter[-16:], "year": year},
    }


# --- sector destination (delivery-money concentration) ----------------------

def sector_destination(con, date: str, sec_map: dict, sessions: int = 5) -> list[dict]:
    """Where delivered money concentrated over the last N sessions: per-sector
    delivered turnover (turnover × delivery%), a proxy for real institutional
    accumulation since the cash FII/DII figure isn't published per-sector."""
    recent = [r["date"] for r in con.execute(
        "SELECT DISTINCT date FROM delivery_daily WHERE date <= ? ORDER BY date DESC LIMIT ?",
        (date, sessions))]
    if not recent:
        return []
    qmarks = ",".join("?" * len(recent))
    rows = con.execute(
        f"""SELECT symbol, turnover_lacs, deliv_pct, pct_change
            FROM delivery_daily WHERE date IN ({qmarks})
            AND series IN ('EQ','BE')""", recent).fetchall()
    agg: dict[str, dict] = {}
    for r in rows:
        sec = sec_map.get(r["symbol"])
        if not sec or r["turnover_lacs"] is None:
            continue
        deliv_frac = (r["deliv_pct"] or 0) / 100.0
        deliv_cr = r["turnover_lacs"] / 100.0 * deliv_frac
        a = agg.setdefault(sec, {"sector": sec, "deliv_cr": 0.0,
                                 "turnover_cr": 0.0, "w_pct": 0.0})
        a["deliv_cr"] += deliv_cr
        a["turnover_cr"] += r["turnover_lacs"] / 100.0
        if r["pct_change"] is not None:
            a["w_pct"] += r["pct_change"] * r["turnover_lacs"]
    out = []
    for a in agg.values():
        tw = a["turnover_cr"] * 100 or 1
        out.append({
            "sector": a["sector"],
            "deliv_cr": round(a["deliv_cr"], 1),
            "turnover_cr": round(a["turnover_cr"], 1),
            "avg_pct": round(a["w_pct"] / tw, 2),
        })
    out.sort(key=lambda x: x["deliv_cr"], reverse=True)
    return out


# --- top-level assembly -----------------------------------------------------

def _window_net(series: list[dict], days: int) -> dict:
    """FII/DII net summed over the last `days` sessions. `full` is False when the
    provisional history is too short to fill the window (so the UI can flag that a
    longer window is really just the full available span, not a true Q/Y figure)."""
    tail = series[-days:]
    fii = round(sum(r["fii"] or 0.0 for r in tail), 1)
    dii = round(sum(r["dii"] or 0.0 for r in tail), 1)
    return {"fii": fii, "dii": dii, "net": round(fii + dii, 1),
            "sessions": len(tail), "want": days, "full": len(tail) >= days}


def build_flows(con, date: str, sec_map: dict) -> dict:
    """Assemble the full flows payload for the web app's Flows page."""
    series = fii_dii_series(con)
    tf = timeframes(series)
    summary = {
        "1d": _window_net(series, 1),
        "1w": _window_net(series, 5),
        "1m": _window_net(series, 21),
        "1q": _window_net(series, 63),
        "1y": _window_net(series, 252),
    }
    latest = series[-1] if series else None
    return {
        "date": date,
        "latest": latest,
        "summary": summary,
        "timeframes": tf,
        "nsdl": nsdl_destination(con),
        "fii_deriv": fii_deriv_flows(con),
        "reconciled": reconciled_flows(con),
        "sector_destination": sector_destination(con, date, sec_map),
    }
