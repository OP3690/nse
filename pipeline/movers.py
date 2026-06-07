"""Market movers + market-pulse analytics, all derived from the EOD store.

Two payloads:
  movers — for the dashboard: today's top gainers/losers plus history-aware reads
           our raw NSE source can't give — 5-session winning/losing streaks and
           biggest 1-year gainers/losers with a consistency (up-day %) measure.
  pulse  — a full "Live Analysis" board: most active (value & volume), volume
           gainers, price-band hitters (circuit), new 52-week highs/lows, index
           performances, large deals and advances/declines / stocks traded.

Everything is a transparent computation over delivery_daily / indices_daily /
wk52 / bulk_deals / block_deals. Quantitative observation, not investment advice.
"""
from __future__ import annotations

import re

TOP_N = 15
PULSE_N = 20
STREAK_MIN = 3        # min consecutive sessions to count as a streak
STREAK_MIN_RET = 1.5  # min |%| over the streak — filters near-flat fund drift
YEAR_MIN_SESSIONS = 120
BAND_PCT = 4.5        # |move| at the day's extreme treated as a circuit hit

# Liquid funds / overnight ETFs drift up ~daily with negligible moves — they'd
# dominate streak and "consistency" lists without being real equity trends.
_DRIFT = re.compile(r"(LIQID|LIQUID|OVERNIGHT|LIQUIDBEES|GILT|GSEC|LIQUIDCASE)", re.I)
# Non-sector NIFTY series (dividend-point, total-return, strategy, debt) to keep
# the "Index Performances" board to genuine sector/thematic indices.
_IDX_JUNK = re.compile(
    r"(DIV POINT|DIVIDEND|TOTAL RET|\bTR\b|\bPR\b|USD|ARBITRAGE|HEDGE|AAA|SDL|"
    r"G-SEC|GSEC|\bGS\b|YR|BHARATBOND|1D RATE|LIQUID|REIT|INVIT)", re.I)


def _streak(pcts):
    """Length of the current consecutive run (same sign) ending at the last bar.
    Returns (direction, length): direction +1 up, -1 down, 0 flat/none."""
    if not pcts:
        return 0, 0
    last = pcts[-1]
    if last is None or last == 0:
        return 0, 0
    sign = 1 if last > 0 else -1
    n = 0
    for p in reversed(pcts):
        if p is None or p == 0 or (1 if p > 0 else -1) != sign:
            break
        n += 1
    return sign, n


def _load_series(con, symbols: set) -> dict[str, list]:
    """Per-symbol (date, close, pct) oldest->newest for the given symbols."""
    hist: dict[str, list] = {}
    for r in con.execute(
        """SELECT symbol, date, close, pct_change FROM delivery_daily
           WHERE series IN ('EQ','BE') ORDER BY symbol, date"""):
        if r["symbol"] not in symbols:
            continue
        hist.setdefault(r["symbol"], []).append(
            (r["date"], r["close"], r["pct_change"]))
    return hist


def _slim(e, extra=None):
    out = {
        "symbol": e["symbol"], "company": e.get("company"), "sector": e.get("sector"),
        "close": e.get("close"), "pct_change": e.get("pct_change"),
        "turnover_cr": e.get("turnover_cr"), "volume": e.get("volume"),
        "deliv_pct": e.get("deliv_pct"), "vol_surge": e.get("vol_surge"),
    }
    if extra:
        out.update(extra)
    return out


def build_movers(con, headline: list[dict]) -> dict:
    by_sym = {e["symbol"]: e for e in headline}
    series = _load_series(con, set(by_sym))

    # today's gainers / losers (liquid stock universe)
    ranked = [e for e in headline if e.get("pct_change") is not None]
    gainers = sorted(ranked, key=lambda e: e["pct_change"], reverse=True)[:TOP_N]
    losers = sorted(ranked, key=lambda e: e["pct_change"])[:TOP_N]

    # 5-session streaks + 1-year performance
    streak_up, streak_down, year = [], [], []
    for sym, s in series.items():
        if _DRIFT.search(sym):  # liquid funds / overnight ETFs aren't equity trends
            continue
        pcts = [p for (_, _, p) in s]
        closes = [c for (_, c, _) in s if c is not None]
        e = by_sym.get(sym, {})
        sign, n = _streak(pcts)
        if n >= STREAK_MIN and len(closes) >= n + 1:
            base = closes[-(n + 1)]
            ret = (closes[-1] - base) / base * 100 if base else None
            # a real streak must have moved meaningfully — filters near-flat drift
            if ret is not None and abs(ret) >= STREAK_MIN_RET:
                row = _slim(e, {"streak": n, "ret_streak": round(ret, 2)})
                (streak_up if sign > 0 else streak_down).append(row)

        if len(closes) >= YEAR_MIN_SESSIONS:
            w = closes[-250:]
            wp = [p for p in pcts[-250:] if p is not None]
            ret_1y = (w[-1] - w[0]) / w[0] * 100 if w[0] else None
            up_days = sum(1 for p in wp if p > 0)
            up_ratio = up_days / len(wp) * 100 if wp else None
            year.append(_slim(e, {
                "ret_1y": round(ret_1y, 1) if ret_1y is not None else None,
                "up_ratio": round(up_ratio, 1) if up_ratio is not None else None,
                "sessions": len(w)}))

    streak_up.sort(key=lambda r: (r["streak"], r["ret_streak"] or 0), reverse=True)
    streak_down.sort(key=lambda r: (r["streak"], -(r["ret_streak"] or 0)), reverse=True)
    yr = [r for r in year if r["ret_1y"] is not None]
    best_1y = sorted(yr, key=lambda r: r["ret_1y"], reverse=True)[:TOP_N]
    worst_1y = sorted(yr, key=lambda r: r["ret_1y"])[:TOP_N]
    # consistency: most up-day-heavy / down-day-heavy over the year
    yc = [r for r in year if r["up_ratio"] is not None and r["sessions"] >= 200]
    most_up = sorted(yc, key=lambda r: r["up_ratio"], reverse=True)[:TOP_N]
    most_down = sorted(yc, key=lambda r: r["up_ratio"])[:TOP_N]

    return {
        "gainers": [_slim(e) for e in gainers],
        "losers": [_slim(e) for e in losers],
        "streak_up": streak_up[:TOP_N],
        "streak_down": streak_down[:TOP_N],
        "best_1y": best_1y,
        "worst_1y": worst_1y,
        "consistent_up": most_up,
        "consistent_down": most_down,
    }


# ---- broad/sector index classification ----
_BROAD = {
    "NIFTY 50", "NIFTY NEXT 50", "NIFTY 100", "NIFTY 200", "NIFTY 500",
    "NIFTY MIDCAP 50", "NIFTY MIDCAP 100", "NIFTY MIDCAP 150",
    "NIFTY SMALLCAP 50", "NIFTY SMALLCAP 100", "NIFTY SMALLCAP 250",
    "NIFTY MIDSMALLCAP 400", "NIFTY LARGEMIDCAP 250", "NIFTY MICROCAP 250",
    "NIFTY TOTAL MARKET",
}


def _band_hitters(con, date: str, names: dict | None = None) -> dict:
    names = names or {}
    rows = con.execute(
        """SELECT symbol, open, high, low, close, pct_change, turnover_lacs
           FROM delivery_daily WHERE date = ? AND series IN ('EQ','BE')""",
        (date,)).fetchall()
    upper, lower = [], []
    for r in rows:
        o, h, l, c, p = r["open"], r["high"], r["low"], r["close"], r["pct_change"]
        if None in (h, l, c, p):
            continue
        locked = o is not None and o == h == l == c
        rec = {"symbol": r["symbol"], "company": names.get(r["symbol"]),
               "close": c, "pct_change": round(p, 2),
               "locked": bool(locked), "turnover_cr": round((r["turnover_lacs"] or 0) / 100, 2)}
        if p > 0 and (locked or (c == h and p >= BAND_PCT)):
            upper.append(rec)
        elif p < 0 and (locked or (c == l and p <= -BAND_PCT)):
            lower.append(rec)
    upper.sort(key=lambda r: r["pct_change"], reverse=True)
    lower.sort(key=lambda r: r["pct_change"])
    return {"upper": upper[:PULSE_N], "lower": lower[:PULSE_N],
            "upper_count": len(upper), "lower_count": len(lower)}


def _wk52(con, headline: list[dict]) -> dict:
    levels = {r["symbol"]: (r["wk_high"], r["wk_low"])
              for r in con.execute("SELECT symbol, wk_high, wk_low FROM wk52")}
    highs, lows = [], []
    for e in headline:
        lv = levels.get(e["symbol"])
        c = e.get("close")
        if not lv or c is None:
            continue
        wh, wl = lv
        if wh:
            d = (c - wh) / wh * 100
            if d >= -1.0:  # within 1% of (or above) the 52w high
                highs.append(_slim(e, {"wk_high": wh, "from_high": round(d, 2), "new": d >= 0}))
        if wl:
            d = (c - wl) / wl * 100
            if d <= 1.0:
                lows.append(_slim(e, {"wk_low": wl, "from_low": round(d, 2), "new": d <= 0}))
    highs.sort(key=lambda r: r["from_high"], reverse=True)
    lows.sort(key=lambda r: r["from_low"])
    return {"high": highs[:PULSE_N], "low": lows[:PULSE_N],
            "high_count": len(highs), "low_count": len(lows)}


# Published index display-name (as stored in indices_daily) -> our membership
# label (the indices we actually fetched constituents for). Lets the clickable
# Index Performances board expand into the real stocks behind each index.
_IDX_TO_MEMBER = {
    "NIFTY 50": "Nifty 50", "NIFTY NEXT 50": "Nifty Next 50",
    "NIFTY 100": "Nifty 100", "NIFTY 200": "Nifty 200", "NIFTY 500": "Nifty 500",
    "NIFTY MIDCAP 50": "Nifty Midcap 50", "NIFTY MIDCAP 150": "Nifty Midcap 150",
    "NIFTY SMLCAP 250": "Nifty Smallcap 250", "NIFTY MICROCAP250": "Nifty Microcap 250",
    "NIFTY BANK": "Nifty Bank", "NIFTY IT": "Nifty IT", "NIFTY AUTO": "Nifty Auto",
    "NIFTY PHARMA": "Nifty Pharma", "NIFTY HEALTHCARE": "Nifty Healthcare",
    "NIFTY FMCG": "Nifty FMCG", "NIFTY METAL": "Nifty Metal",
    "NIFTY REALTY": "Nifty Realty", "NIFTY MEDIA": "Nifty Media",
    "NIFTY ENERGY": "Nifty Energy", "NIFTY OIL AND GAS": "Nifty Oil & Gas",
    "NIFTY INFRA": "Nifty Infra", "NIFTY FIN SERVICE": "Nifty Fin Services",
    "NIFTY PSU BANK": "Nifty PSU Bank", "NIFTY PVT BANK": "Nifty Private Bank",
    "NIFTY CONSR DURBL": "Nifty Cons Durables",
}

# Per-index constituent payload caps (keep latest.json lean).
_IDX_STOCKS_CAP = 40


def _index_members(label, by_symbol, index_members):
    """Constituent summary for one index: breadth + the most significant members
    with their day performance. Returns None if we have no constituent list."""
    syms = index_members.get(label) if index_members else None
    if not syms:
        return None
    entries = [by_symbol[s] for s in syms if s in by_symbol]
    if not entries:
        return {"count": len(syms), "traded": 0, "advances": 0, "declines": 0,
                "avg_pct": None, "stocks": []}
    pcts = [e["pct_change"] for e in entries if e.get("pct_change") is not None]
    adv = sum(1 for p in pcts if p > 0)
    dec = sum(1 for p in pcts if p < 0)
    avg = round(sum(pcts) / len(pcts), 2) if pcts else None
    # Most significant by turnover; client can re-sort. Keep fields compact.
    ranked = sorted(entries, key=lambda e: e.get("turnover_cr") or 0, reverse=True)
    stocks = [{
        "symbol": e["symbol"], "company": e.get("company"), "sector": e.get("sector"),
        "close": e.get("close"), "pct_change": e.get("pct_change"),
        "turnover_cr": e.get("turnover_cr"), "deliv_pct": e.get("deliv_pct"),
        "vol_surge": e.get("vol_surge"), "score": e.get("score"),
        "signal": e.get("signal"), "oi_label": e.get("oi_label"),
    } for e in ranked[:_IDX_STOCKS_CAP]]
    return {"count": len(syms), "traded": len(entries),
            "advances": adv, "declines": dec, "avg_pct": avg, "stocks": stocks}


def _indices(indices_rows: list[dict], by_symbol=None, index_members=None) -> dict:
    broad, sector = [], []
    vix = None
    for r in indices_rows:
        name = (r.get("index") or "").strip()
        rec = {"index": name, "last": r.get("last"), "pct": r.get("pct"),
               "pchg30d": r.get("pchg30d"), "pchg365d": r.get("pchg365d")}
        label = _IDX_TO_MEMBER.get(name)
        if label and by_symbol is not None:
            mem = _index_members(label, by_symbol, index_members)
            if mem:
                rec["members"] = mem
        if name == "INDIA VIX":
            vix = rec
        elif name in _BROAD:
            broad.append(rec)
        elif name.startswith("NIFTY") and not _IDX_JUNK.search(name):
            sector.append(rec)
    broad.sort(key=lambda r: (r["pct"] is None, -(r["pct"] or 0)))
    sector.sort(key=lambda r: (r["pct"] is None, -(r["pct"] or 0)))
    return {"broad": broad, "sector": sector, "vix": vix}


def _large_deals(con) -> list[dict]:
    out = []
    for table, kind in (("bulk_deals", "bulk"), ("block_deals", "block")):
        d = con.execute(f"SELECT MAX(date) m FROM {table}").fetchone()
        if not d or not d["m"]:
            continue
        for r in con.execute(
            f"""SELECT date, symbol, client, side, qty, price, security FROM {table}
                WHERE date = ?""", (d["m"],)):
            if not r["qty"] or not r["price"]:
                continue
            out.append({
                "date": r["date"], "symbol": r["symbol"], "company": r["security"],
                "client": r["client"], "side": r["side"], "qty": r["qty"], "price": r["price"],
                "value_cr": round(r["qty"] * r["price"] / 1e7, 2), "kind": kind})
    out.sort(key=lambda r: r["value_cr"], reverse=True)
    return out[:PULSE_N]


def build_pulse(con, date, headline, screener, sectors_out, indices_rows, market,
                names=None, by_symbol=None, index_members=None) -> dict:
    most_active_val = sorted([e for e in headline if e.get("turnover_cr")],
                             key=lambda e: e["turnover_cr"], reverse=True)[:PULSE_N]
    most_active_vol = sorted([e for e in headline if e.get("volume")],
                             key=lambda e: e["volume"], reverse=True)[:PULSE_N]
    vol_gainers = sorted([e for e in headline if e.get("vol_surge")],
                         key=lambda e: e["vol_surge"], reverse=True)[:PULSE_N]

    sec_sorted = sorted(sectors_out, key=lambda s: s["avg_pct"], reverse=True)
    return {
        "most_active_value": [_slim(e) for e in most_active_val],
        "most_active_volume": [_slim(e) for e in most_active_vol],
        "volume_gainers": [_slim(e) for e in vol_gainers],
        "band_hitters": _band_hitters(con, date, names),
        "wk52": _wk52(con, headline),
        "indices": _indices(indices_rows, by_symbol, index_members),
        "large_deals": _large_deals(con),
        "breadth": {
            "advances": market["advances"], "declines": market["declines"],
            "unchanged": market["unchanged"],
            "total_turnover_cr": market["total_turnover_cr"],
            "stocks": market["stocks"],
            "sectors_up": sum(1 for s in sectors_out if s["avg_pct"] > 0),
            "sectors_down": sum(1 for s in sectors_out if s["avg_pct"] < 0),
            "top_sectors": sec_sorted[:6],
            "bottom_sectors": sec_sorted[-6:][::-1],
        },
    }
