"""Compute money-flow signals from the SQLite store and emit JSON for the web app.

The scoring is intentionally transparent (no black-box ML): each component is a
real, explainable market signal, combined into a 0-100 "smart-money score".
Components auto-renormalize when history or F&O data is missing.
"""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

import flows
import forecast
import indices_membership
import intel
import ipo
import knn
import model
import movers
import mongo
import sectors
import store
import strategy

# ETFs, gold/silver funds, G-Secs and index trackers trade on series EQ but
# aren't "stocks" — exclude them from headline lists (kept in the full screener).
_NON_STOCK = re.compile(
    r"(ETF|BEES|GOLD|SILVER|LIQUID|GSEC|NIFTY|SENSEX|MON100|MOM\d|MAFANG|CASE$|^SDL|^GS\d)",
    re.I)


def _is_stock(sym: str) -> bool:
    return not _NON_STOCK.search(sym or "")

ROOT = Path(__file__).resolve().parent
WEB_DATA = ROOT.parent / "web" / "data"
PROCESSED = ROOT / "data" / "processed"

MIN_TURNOVER_LACS = 500.0  # ignore illiquid names (< ~5 cr turnover)
ROLLING_DAYS = 20


def _clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def _avg(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


# Trailing % return over `sessions` trading days, from a per-symbol series
# (oldest -> newest, as load_histories emits). None if the history is too short.
def _trailing_return(series, sessions):
    if not series or len(series) <= sessions:
        return None
    last = series[-1].get("close")
    past = series[-1 - sessions].get("close")
    if last is None or not past:
        return None
    return round((last - past) / past * 100, 1)


# Performance-band buckets for trailing returns. Gainers run +5/10/25/50/75/100%
# with an open-ended ">100%" top band; losers mirror it down to a "worse than
# −75%" tail. Each band carries its full count plus the strongest members so the
# UI can show "who's up 25–50% over the last 3 months" at a glance.
_GAIN_EDGES = [5, 10, 25, 50, 75, 100]   # last band is open-ended (100%+)
_LOSS_EDGES = [-5, -10, -25, -50, -75]   # last band is open-ended (≤ −75%)


def _band_member(e, key):
    return {
        "symbol": e["symbol"], "company": e.get("company"), "sector": e.get("sector"),
        "close": e.get("close"), "ret": e.get(key), "pct_change": e.get("pct_change"),
    }


def _bands_for(rows, key, top=15):
    gain = [{"lo": _GAIN_EDGES[i],
             "hi": _GAIN_EDGES[i + 1] if i + 1 < len(_GAIN_EDGES) else None,
             "items": []} for i in range(len(_GAIN_EDGES))]
    loss = [{"hi": _LOSS_EDGES[i],
             "lo": _LOSS_EDGES[i + 1] if i + 1 < len(_LOSS_EDGES) else None,
             "items": []} for i in range(len(_LOSS_EDGES))]
    up = down = total = 0
    for e in rows:
        r = e.get(key)
        if r is None:
            continue
        total += 1
        if r >= _GAIN_EDGES[0]:
            up += 1
            for b in gain:
                if r >= b["lo"] and (b["hi"] is None or r < b["hi"]):
                    b["items"].append(_band_member(e, key))
                    break
        elif r <= _LOSS_EDGES[0]:
            down += 1
            for b in loss:
                if r <= b["hi"] and (b["lo"] is None or r > b["lo"]):
                    b["items"].append(_band_member(e, key))
                    break
    for b in gain:
        b["items"].sort(key=lambda x: x["ret"], reverse=True)
        b["count"] = len(b["items"]); b["items"] = b["items"][:top]
    for b in loss:
        b["items"].sort(key=lambda x: x["ret"])
        b["count"] = len(b["items"]); b["items"] = b["items"][:top]
    return {"gainers": gain, "losers": loss, "up": up, "down": down, "total": total}


def build_return_bands(rows):
    """Trailing-return performance bands at 1-month (~21 sessions) and 3-month
    (~63 sessions) windows, split into gainers and losers."""
    return {"1m": _bands_for(rows, "ret_1m"), "3m": _bands_for(rows, "ret_3m")}


def latest_date(con) -> str | None:
    row = con.execute("SELECT MAX(date) d FROM delivery_daily").fetchone()
    return row["d"] if row else None


def available_dates(con) -> list[str]:
    return [r["date"] for r in con.execute(
        "SELECT DISTINCT date FROM delivery_daily ORDER BY date")]


def rolling_baselines(con, date: str) -> dict[str, dict]:
    """Per-symbol average volume & delivery qty over the prior ROLLING_DAYS."""
    rows = con.execute(
        """SELECT symbol, AVG(volume) av, AVG(deliv_qty) ad, COUNT(*) n
           FROM delivery_daily
           WHERE date < ? AND date >= ?
           GROUP BY symbol""",
        (date, _lookback_start(con, date))).fetchall()
    return {r["symbol"]: {"av": r["av"], "ad": r["ad"], "n": r["n"]} for r in rows}


def _lookback_start(con, date):
    dates = [r["date"] for r in con.execute(
        "SELECT DISTINCT date FROM delivery_daily WHERE date < ? ORDER BY date DESC LIMIT ?",
        (date, ROLLING_DAYS))]
    return dates[-1] if dates else date


def load_histories(con, symbols: set) -> dict[str, list]:
    """Per-symbol time series (oldest->newest) with OI merged in. Shared by the
    forecast engine and the stock-detail file emitter."""
    hist: dict[str, list] = {}
    for r in con.execute(
        """SELECT date, symbol, close, pct_change, deliv_pct, volume, turnover_lacs
           FROM delivery_daily ORDER BY symbol, date"""):
        if r["symbol"] not in symbols:
            continue
        hist.setdefault(r["symbol"], []).append({
            "date": r["date"], "close": r["close"], "pct": r["pct_change"],
            "deliv": r["deliv_pct"], "volume": r["volume"],
            "turnover_cr": round((r["turnover_lacs"] or 0) / 100, 2)})
    for r in con.execute(
        """SELECT date, symbol, SUM(oi) oi, SUM(oi_change) oic
           FROM fo_oi_daily GROUP BY date, symbol"""):
        if r["symbol"] not in hist:
            continue
        for row in hist[r["symbol"]]:
            if row["date"] == r["date"]:
                row["oi"] = r["oi"]
                row["oi_change"] = r["oic"]
                break
    return hist


def load_wk52(con) -> dict[str, dict]:
    return {r["symbol"]: {"high": r["wk_high"], "low": r["wk_low"]}
            for r in con.execute("SELECT symbol, wk_high, wk_low FROM wk52")}


def load_shareholding(con) -> dict[str, list[dict]]:
    """Symbol -> newest-first list of quarterly shareholding rows. Empty if the
    table doesn't exist yet (old DBs / before the first backfill)."""
    out: dict[str, list[dict]] = {}
    try:
        cur = con.execute(
            "SELECT date, symbol, promoter_pct, fii_pct, dii_pct, public_pct, total_shares "
            "FROM shareholding_quarterly ORDER BY symbol, date DESC")
    except Exception:  # noqa: BLE001 — table may not exist
        return out
    for r in cur:
        out.setdefault(r["symbol"], []).append(dict(r))
    return out


# The four categories shown in the per-stock shareholding panel, in display order.
_SHP_CATS = (("promoter", "Promoters", "promoter_pct"),
             ("fii", "FII / FPI", "fii_pct"),
             ("dii", "DII", "dii_pct"),
             ("public", "Public", "public_pct"))


def build_shareholding_block(rows: list[dict], close: float | None) -> dict | None:
    """Latest quarter vs the prior one: per-category holding-% change and an
    estimated ₹ flow (Δ% × total shares × price). `rows` is newest-first."""
    if not rows or rows[0].get("fii_pct") is None and rows[0].get("dii_pct") is None:
        return None
    latest, prev = rows[0], (rows[1] if len(rows) > 1 else None)
    shares = latest.get("total_shares") or (prev.get("total_shares") if prev else None)
    cats = []
    for key, label, col in _SHP_CATS:
        pct = latest.get(col)
        prev_pct = prev.get(col) if prev else None
        delta = round(pct - prev_pct, 2) if pct is not None and prev_pct is not None else None
        est_cr = None
        if delta is not None and shares and close:
            est_cr = round(delta / 100.0 * shares * close / 1e7, 1)
        cats.append({"key": key, "label": label, "pct": pct,
                     "prev_pct": prev_pct, "delta_pp": delta, "est_cr": est_cr})
    # Oldest-first trend for charting (cap at 8 quarters / ~2yr). Only quarters
    # with a real FII/DII split — older filings lack it and report full-public
    # (not retail-only), which would distort the lines.
    split = [r for r in rows[:8] if r.get("fii_pct") is not None]
    trend = [{"date": r["date"], "promoter": r.get("promoter_pct"), "fii": r.get("fii_pct"),
              "dii": r.get("dii_pct"), "public": r.get("public_pct")}
             for r in reversed(split)]
    return {"asof": latest["date"], "prev": prev["date"] if prev else None,
            "total_shares": shares, "categories": cats, "trend": trend}


def load_bse_sectors(con) -> dict[str, str]:
    """Symbol -> macro sector from BSE's ComHeader enrichment. Fills sectors for
    symbols outside NSE's Nifty-500-only map. Empty if the table doesn't exist."""
    out: dict[str, str] = {}
    try:
        cur = con.execute("SELECT symbol, sector FROM bse_sectors WHERE sector IS NOT NULL")
    except Exception:  # noqa: BLE001 — table may not exist on old DBs
        return out
    for r in cur:
        out[r["symbol"]] = r["sector"]
    return out


def load_marketcap(con) -> dict[str, dict]:
    """Symbol -> {mktcap_cr, mktcap_ff_cr, scripcode}, from BSE's scrip master
    joined by ISIN. Empty if the table doesn't exist yet (pre-first-fetch)."""
    out: dict[str, dict] = {}
    try:
        cur = con.execute(
            "SELECT symbol, scripcode, mktcap_cr, mktcap_ff_cr FROM bse_scrips")
    except Exception:  # noqa: BLE001 — table may not exist on old DBs
        return out
    for r in cur:
        out[r["symbol"]] = {"mktcap_cr": r["mktcap_cr"],
                            "mktcap_ff_cr": r["mktcap_ff_cr"],
                            "scripcode": r["scripcode"]}
    return out


# SEBI-style size buckets by full market cap (₹ Cr). Used as a market-cap-based
# size label that complements the index-membership cap_tier (which only covers
# index members). Thresholds approximate the large/mid/small/micro split.
def marketcap_tier(mktcap_cr: float | None) -> str | None:
    if not mktcap_cr:
        return None
    if mktcap_cr >= 50_000:
        return "Mega"
    if mktcap_cr >= 20_000:
        return "Large"
    if mktcap_cr >= 5_000:
        return "Mid"
    if mktcap_cr >= 500:
        return "Small"
    return "Micro"


def load_names(con) -> dict[str, str]:
    """Symbol -> company name. Equity master is the primary source; IPO issues
    and bulk/block deal security names backfill anything the master misses."""
    names: dict[str, str] = {}
    for sql in (
        "SELECT symbol, company FROM ipo_issues WHERE company IS NOT NULL",
        "SELECT symbol, security AS company FROM bulk_deals WHERE security IS NOT NULL",
        "SELECT symbol, security AS company FROM block_deals WHERE security IS NOT NULL",
        "SELECT symbol, company FROM securities WHERE company IS NOT NULL",
    ):
        try:
            for r in con.execute(sql):
                if r["company"]:
                    names[r["symbol"]] = r["company"]  # later sources win (master last)
        except Exception:  # noqa: BLE001 — table may not exist on old DBs
            pass
    return names


def load_indices(con) -> list[dict]:
    row = con.execute('SELECT MAX(date) d FROM indices_daily').fetchone()
    if not row or not row["d"]:
        return []
    return [dict(r) for r in con.execute(
        'SELECT * FROM indices_daily WHERE date = ?', (row["d"],))]


# Headline index tiles for the dashboard hero. Nifty 50 + India VIX come from
# NSE's own allIndices feed; Sensex is appended at download time (Yahoo ^BSESN).
HEADLINE_INDICES = [
    ("NIFTY 50", "Nifty 50", 2, False),
    ("SENSEX", "Sensex", 2, False),
    ("INDIA VIX", "India VIX", 2, True),  # invert: a rising VIX is risk-off
]


def headline_indices(idx_rows: list[dict]) -> list[dict]:
    """Pick the three headline quotes (value + % change) for the dashboard hero."""
    by = {(r.get("index") or "").upper(): r for r in idx_rows}
    out = []
    for key, label, dec, invert in HEADLINE_INDICES:
        r = by.get(key)
        if r and r.get("last") is not None:
            last = r["last"]
            pct = r.get("pct")
            # Prefer an exchange-supplied exact point move (e.g. BSE's `change`);
            # otherwise derive it: prev = last / (1 + pct/100); change = last - prev.
            change = r.get("change")
            if change is None and pct is not None and (100 + pct) != 0:
                change = round(last - last / (1 + pct / 100), 2)
            out.append({
                "label": label, "last": last, "pct": pct, "change": change,
                "decimals": dec, "invert": invert,
            })
    return out


def session_turnover(con, date: str | None) -> float | None:
    """Total EQ/BE turnover (₹ Cr) for one session — used for prev-day deltas."""
    if not date:
        return None
    row = con.execute(
        """SELECT SUM(turnover_lacs) t FROM delivery_daily
           WHERE date = ? AND series IN ('EQ','BE')""", (date,)).fetchone()
    return round((row["t"] or 0) / 100, 1) if row and row["t"] else None


def fo_signals(con, date: str) -> dict[str, dict]:
    """Aggregate futures OI per underlying and classify the buildup."""
    rows = con.execute(
        """SELECT symbol, expiry, close, prev_close, oi, oi_change
           FROM fo_oi_daily WHERE date = ?""", (date,)).fetchall()
    by_sym: dict[str, dict] = {}
    near: dict[str, str] = {}  # nearest expiry per symbol
    for r in rows:
        s = r["symbol"]
        d = by_sym.setdefault(s, {"oi": 0, "oi_change": 0, "near_pct": None})
        if r["oi"]:
            d["oi"] += r["oi"]
        if r["oi_change"]:
            d["oi_change"] += r["oi_change"]
        # Use the nearest expiry contract for the price-direction read.
        if r["expiry"] and (s not in near or r["expiry"] < near[s]):
            near[s] = r["expiry"]
            if r["prev_close"] and r["close"]:
                d["near_pct"] = (r["close"] - r["prev_close"]) / r["prev_close"] * 100

    out = {}
    for s, d in by_sym.items():
        pct = d["near_pct"]
        oic = d["oi_change"]
        if pct is None or oic == 0:
            label, score = "neutral", 50
        else:
            up = pct > 0
            oi_up = oic > 0
            if up and oi_up:
                label, score = "long_buildup", 100
            elif not up and oi_up:
                label, score = "short_buildup", 0
            elif up and not oi_up:
                label, score = "short_covering", 70
            else:
                label, score = "long_unwinding", 30
        out[s] = {"oi": d["oi"], "oi_change": oic, "label": label, "score": score}
    return out


def deal_net(con, date: str, table: str, sessions: int = 5) -> dict[str, dict]:
    """Net institutional buying per symbol over the last N sessions of deals."""
    recent = [r["date"] for r in con.execute(
        f"SELECT DISTINCT date FROM {table} WHERE date <= ? ORDER BY date DESC LIMIT ?",
        (date, sessions))]
    if not recent:
        return {}
    qmarks = ",".join("?" * len(recent))
    rows = con.execute(
        f"""SELECT symbol, side, qty, price, client, date FROM {table}
            WHERE date IN ({qmarks})""", recent).fetchall()
    agg: dict[str, dict] = {}
    for r in rows:
        if not r["qty"] or not r["price"]:
            continue
        val = r["qty"] * r["price"]
        d = agg.setdefault(r["symbol"], {"net": 0.0, "buys": [], "sells": []})
        if r["side"] == "BUY":
            d["net"] += val
            d["buys"].append({"client": r["client"], "value": val, "date": r["date"]})
        elif r["side"] == "SELL":
            d["net"] -= val
            d["sells"].append({"client": r["client"], "value": val, "date": r["date"]})
    return agg


def fiidii_history(con) -> list[dict]:
    rows = con.execute(
        "SELECT date, category, net FROM fiidii_daily ORDER BY date").fetchall()
    by_date: dict[str, dict] = {}
    for r in rows:
        d = by_date.setdefault(r["date"], {"date": r["date"], "fii": None, "dii": None})
        cat = (r["category"] or "").upper()
        if "FII" in cat or "FPI" in cat:
            d["fii"] = r["net"]
        elif "DII" in cat:
            d["dii"] = r["net"]
    return list(by_date.values())


def build_money_flow(screener: list[dict]) -> dict:
    """Delivery-backed money flow: delivered turnover (turnover x deliv%) signed by
    the day's price direction — up = money IN (accumulation), down = OUT. Two
    universes for the dashboard toggle so the user can choose the lens:

      * "liquid" (default, trustworthy): only names with turnover >= MIN_TURNOVER_LACS.
      * "all": every traded stock that moved, however thin.

    Each carries aggregate totals + counts + the top-12 inflow/outflow names, so the
    client just renders (no need to ship the full 2600-row universe)."""
    def variant(rows: list[dict]) -> dict:
        flows = []
        for e in rows:
            pct = e.get("pct_change")
            turn = e.get("turnover_cr")
            if pct in (None, 0) or turn is None:
                continue
            dp = e.get("deliv_pct")
            delivered = turn * (dp / 100) if dp is not None else turn
            if delivered <= 0:
                continue
            flows.append({
                "symbol": e["symbol"], "company": e.get("company"),
                "sector": e.get("sector"), "pct_change": pct,
                "deliv_pct": dp, "delivBacked": dp is not None,
                "vol_surge": e.get("vol_surge"),
                "flowCr": round(delivered * (1 if pct > 0 else -1), 2),
            })
        inflow = sorted((f for f in flows if f["flowCr"] > 0), key=lambda x: -x["flowCr"])
        outflow = sorted((f for f in flows if f["flowCr"] < 0), key=lambda x: x["flowCr"])
        in_total = round(sum(f["flowCr"] for f in inflow), 1)
        out_total = round(sum(f["flowCr"] for f in outflow), 1)  # negative
        denom = in_total + abs(out_total)
        return {
            "in_total": in_total, "out_total": out_total,
            "net": round(in_total + out_total, 1),
            "in_count": len(inflow), "out_count": len(outflow),
            "balance": round(in_total / denom * 100) if denom else 0,
            "top_in": inflow[:12], "top_out": outflow[:12],
        }
    # Both lenses keep the non-stock exclusion (ETFs / rights / etc. were never
    # part of this view); the toggle only flips the *liquidity* floor.
    stocks = [e for e in screener if _is_stock(e["symbol"])]
    return {
        "liquid": variant([e for e in stocks if e.get("liquid")]),
        "all": variant(stocks),
    }


def _vol_spark(series, n=12):
    """Last n volumes scaled to 0..100 (by window max) for a compact sparkline."""
    vols = [h.get("volume") for h in (series or []) if h.get("volume")]
    vols = vols[-n:]
    if len(vols) < 2:
        return None
    mx = max(vols) or 1
    return [round(v / mx * 100) for v in vols]


def build_tooltips(headline, histories) -> dict:
    """Compact per-symbol meta for the rich hover-card. One shared map keyed by
    symbol, so symbol links anywhere in the app can show price/52W/indices/volume
    without duplicating the fields into every list payload."""
    out = {}
    for e in headline:
        sym = e["symbol"]
        out[sym] = {
            "symbol": sym,
            "company": e.get("company"),
            "sector": e.get("sector"),
            "close": e.get("close"),
            "pct_change": e.get("pct_change"),
            "cap_tier": e.get("cap_tier"),
            "mktcap_cr": e.get("mktcap_cr"),
            "size_tier": e.get("size_tier"),
            "indices": e.get("indices") or [],
            "wk_high": e.get("wk_high"),
            "wk_low": e.get("wk_low"),
            "wk52_pos": e.get("wk52_pos"),
            "deliv_pct": e.get("deliv_pct"),
            "vol_surge": e.get("vol_surge"),
            "turnover_cr": e.get("turnover_cr"),
            "score": e.get("score"),
            "signal": e.get("signal"),
            "vol_spark": _vol_spark(histories.get(sym)),
        }
    return out


def _signal_label(score, pct):
    if score >= 75:
        return "Strong Accumulation"
    if score >= 60:
        return "Accumulation"
    if score <= 30 and (pct or 0) < 0:
        return "Distribution"
    return "Neutral"


def build(con) -> dict:
    date = latest_date(con)
    if not date:
        raise RuntimeError("No delivery data in DB. Run download + ingest first.")

    sec_map = sectors.load_map()
    # BSE ComHeader fallback for names outside NSE's Nifty-500 sector map.
    # setdefault → NSE's mapping always wins where it exists.
    for _sym, _sec in load_bse_sectors(con).items():
        sec_map.setdefault(_sym, _sec)
    names = load_names(con)
    mktcap = load_marketcap(con)
    membership = indices_membership.load_maps(con)
    mem_by_sym = membership["per_symbol"]
    baselines = rolling_baselines(con, date)
    fo = fo_signals(con, date)
    bulk = deal_net(con, date, "bulk_deals")
    block = deal_net(con, date, "block_deals")

    rows = con.execute(
        """SELECT symbol, close, prev_close, pct_change, volume, turnover_lacs,
                  deliv_qty, deliv_pct, series
           FROM delivery_daily WHERE date = ? AND series IN ('EQ','BE')""",
        (date,)).fetchall()

    screener = []
    adv = dec = unch = 0
    total_turnover_lacs = 0.0
    sector_agg: dict[str, dict] = {}

    for r in rows:
        sym = r["symbol"]
        pct = r["pct_change"]
        turn = r["turnover_lacs"] or 0
        total_turnover_lacs += turn
        if pct is not None:
            if pct > 0.05:
                adv += 1
            elif pct < -0.05:
                dec += 1
            else:
                unch += 1

        base = baselines.get(sym, {})
        avg_vol, avg_del = base.get("av"), base.get("ad")
        vol_surge = (r["volume"] / avg_vol) if (avg_vol and r["volume"]) else None
        del_surge = (r["deliv_qty"] / avg_del) if (avg_del and r["deliv_qty"]) else None

        # --- scoring components (each 0-100) with weights ---
        comps, weights = {}, {}
        if r["deliv_pct"] is not None:
            comps["delivery"] = _clamp(r["deliv_pct"]); weights["delivery"] = 0.30
        if del_surge is not None:
            comps["deliv_surge"] = _clamp((del_surge - 1) * 100); weights["deliv_surge"] = 0.20
        if vol_surge is not None:
            comps["vol_surge"] = _clamp((vol_surge - 1) * 100); weights["vol_surge"] = 0.15
        if pct is not None:
            comps["momentum"] = _clamp(50 + pct * 8); weights["momentum"] = 0.15
        if sym in fo:
            comps["oi"] = fo[sym]["score"]; weights["oi"] = 0.10
        inst_net = bulk.get(sym, {}).get("net", 0) + block.get(sym, {}).get("net", 0)
        if inst_net:
            comps["institutional"] = 100 if inst_net > 0 else 0
            weights["institutional"] = 0.10

        if weights:
            wsum = sum(weights.values())
            score = sum(comps[k] * weights[k] for k in comps) / wsum
        else:
            score = 0.0
        score = round(score, 1)

        liquid = turn >= MIN_TURNOVER_LACS
        mem = mem_by_sym.get(sym, {})
        mc = mktcap.get(sym, {})
        mc_full = mc.get("mktcap_cr")
        entry = {
            "symbol": sym,
            "company": names.get(sym),
            "sector": sec_map.get(sym) or bse_sec.get(sym),
            "close": r["close"],
            "pct_change": pct,
            "deliv_pct": r["deliv_pct"],
            "volume": r["volume"],
            "turnover_cr": round(turn / 100, 2),
            "vol_surge": round(vol_surge, 2) if vol_surge else None,
            "deliv_surge": round(del_surge, 2) if del_surge else None,
            "oi_label": fo.get(sym, {}).get("label"),
            "oi_change": fo.get(sym, {}).get("oi_change"),
            "inst_net_cr": round(inst_net / 1e7, 2) if inst_net else None,
            "score": score,
            "signal": _signal_label(score, pct),
            "liquid": liquid,
            # --- market cap (₹ Cr, BSE-sourced via ISIN) + size bucket ---
            "mktcap_cr": mc_full,
            "mktcap_ff_cr": mc.get("mktcap_ff_cr"),
            "size_tier": marketcap_tier(mc_full),
            # --- index membership + size class (for the rich hover-card) ---
            "cap_tier": mem.get("cap_tier"),
            "indices": mem.get("indices") or [],
        }
        screener.append(entry)

        # sector aggregation (turnover-weighted)
        sec = sec_map.get(sym) or bse_sec.get(sym)
        if sec and pct is not None:
            sa = sector_agg.setdefault(sec, {
                "sector": sec, "turnover_cr": 0.0, "w_pct": 0.0,
                "deliv": [], "adv": 0, "dec": 0, "count": 0})
            sa["turnover_cr"] += turn / 100
            sa["w_pct"] += (pct * turn)
            if r["deliv_pct"] is not None:
                sa["deliv"].append(r["deliv_pct"])
            sa["adv" if pct > 0 else "dec"] += 1
            sa["count"] += 1

    # finalize sectors
    sectors_out = []
    for sa in sector_agg.values():
        tw = sa["turnover_cr"] * 100 or 1
        sectors_out.append({
            "sector": sa["sector"],
            "turnover_cr": round(sa["turnover_cr"], 1),
            "avg_pct": round(sa["w_pct"] / tw, 2),
            "avg_deliv": round(_avg(sa["deliv"]) or 0, 1),
            "advances": sa["adv"], "declines": sa["dec"], "count": sa["count"],
        })
    sectors_out.sort(key=lambda s: s["avg_pct"], reverse=True)

    liquid_screener = [e for e in screener if e["liquid"]]
    liquid_screener.sort(key=lambda e: e["score"], reverse=True)
    # Headline lists exclude ETFs/G-Secs/index trackers.
    headline = [e for e in liquid_screener if _is_stock(e["symbol"])]

    # OI buildup buckets (liquid, in F&O)
    buckets = {"long_buildup": [], "short_buildup": [],
               "short_covering": [], "long_unwinding": []}
    for e in headline:
        lbl = e["oi_label"]
        if lbl in buckets:
            buckets[lbl].append({
                "symbol": e["symbol"], "company": e.get("company"),
                "pct_change": e["pct_change"],
                "oi_change": e["oi_change"], "close": e["close"],
                "sector": e["sector"]})
    for k in buckets:
        buckets[k] = buckets[k][:20]

    # notable institutional buys (named clients, last 5 sessions)
    notable = []
    for sym, d in {**{k: v for k, v in bulk.items()}}.items():
        for b in d["buys"]:
            notable.append({**b, "symbol": sym, "kind": "bulk"})
    for sym, d in block.items():
        for b in d["buys"]:
            notable.append({**b, "symbol": sym, "kind": "block"})
    notable.sort(key=lambda x: x["value"], reverse=True)
    notable = notable[:25]
    for n in notable:
        n["value_cr"] = round(n.pop("value") / 1e7, 2)
        n["company"] = names.get(n["symbol"])

    # --- trend forecast (3-month technical + flow trendlines) ---
    histories = load_histories(con, {e["symbol"] for e in headline})
    wk = load_wk52(con)
    idx_rows = load_indices(con)
    forecasts: dict[str, dict] = {}
    for e in headline:
        sym = e["symbol"]
        f = forecast.forecast_symbol(
            histories.get(sym, []), wk.get(sym, {}).get("high"), wk.get(sym, {}).get("low"))
        if not f:
            continue
        forecasts[sym] = f
        # merge compact summary into the screener/headline entry
        for k in ("trend_score", "trend_label", "confidence", "rsi",
                  "sma20", "sma50", "slope20_pct", "trend_r2", "wk52_pos"):
            e[k] = f[k]
        # actual 52-week high/low levels (for display alongside the position)
        e["wk_high"] = wk.get(sym, {}).get("high")
        e["wk_low"] = wk.get(sym, {}).get("low")

    # 52W-high drawdown + trailing returns for every headline stock (runs for all,
    # not just the forecasted ones, so the screener filters/bands stay complete).
    for e in headline:
        sym = e["symbol"]
        w = wk.get(sym, {})
        if e.get("wk_high") is None:
            e["wk_high"] = w.get("high")
            e["wk_low"] = w.get("low")
        hi, close = e.get("wk_high"), e.get("close")
        # Signed % vs the 52-week high: 0 = at the high, negative = below it.
        e["from_high"] = round((close - hi) / hi * 100, 1) if (hi and close) else None
        series = histories.get(sym, [])
        e["ret_1m"] = _trailing_return(series, 21)
        e["ret_3m"] = _trailing_return(series, 63)

    rated = [e for e in headline if "trend_score" in e]
    uptrends = sorted(
        [e for e in rated if e["trend_label"] in ("Uptrend", "Strong Uptrend")],
        key=lambda e: (e["trend_score"], e["confidence"]), reverse=True)
    downtrends = sorted(
        [e for e in rated if e["trend_label"] in ("Downtrend", "Strong Downtrend")],
        key=lambda e: (e["trend_score"], -e["confidence"]))
    regime = forecast.market_regime(idx_rows) if idx_rows else None
    index_sectors = forecast.sector_trends(idx_rows) if idx_rows else []

    # --- advanced cross-sectional model (relative ranking + probabilities) ---
    feats = {}
    for e in headline:
        s = e["symbol"]
        feats[s] = model.extract_features(
            histories.get(s, []), wk.get(s, {}).get("high"), wk.get(s, {}).get("low"))
    feats = {s: f for s, f in feats.items() if f}
    mscores = model.score_universe(feats)
    MODEL_KEYS = ("composite", "factor_momentum", "factor_trend", "factor_flow",
                  "up_prob_5d", "up_prob_20d", "vol_20", "mdd_60")
    for e in headline:
        ms = mscores.get(e["symbol"])
        if ms:
            for k in MODEL_KEYS:
                e[k] = ms[k]
    model_picks = sorted([e for e in headline if "composite" in e],
                         key=lambda e: e["composite"], reverse=True)
    model_pans = sorted([e for e in headline if "composite" in e],
                        key=lambda e: e["composite"])
    backtest = model.backtest(histories, wk, horizon=20, step=10)

    # --- KNN multibagger finder (analog model: >10% move within ~1 month) ---
    multibaggers = knn.build_multibaggers(
        histories, wk, feats, {e["symbol"]: e for e in headline})
    if multibaggers.get("ok"):
        mb_probs = multibaggers.get("probs", {})
        for e in headline:
            p = mb_probs.get(e["symbol"])
            if p is not None:
                e["mb_prob"] = p

    fh = fiidii_history(con)
    fii_latest = next((x for x in reversed(fh)), None)

    # --- multi-timeframe FII/DII flows + asset-class / sector destination ---
    flow_data = flows.build_flows(con, date, sec_map)

    # --- 3-6 month intelligence (accumulation, rotation, regime, divergence) ---
    intel_data = intel.build_intel(con, date, sec_map, names)

    # --- Strategy Lab: regime gauge, risk metrics, factor scores, technical
    # signals, walk-forward backtests (descriptive analytics, not advice) ---
    strategy_data = strategy.build_strategy(
        date, histories, headline, feats, idx_rows, fii_latest)

    # --- IPO Radar: recently listed stocks scored on post-listing behaviour ---
    ipo_data = ipo.build_ipo_payload(
        con, date, sec_map, {e["symbol"]: e for e in screener})

    # --- market movers (gainers/losers, streaks, 1y) + market-pulse board ---
    market_dict = {
        "advances": adv, "declines": dec, "unchanged": unch,
        "total_turnover_cr": round(total_turnover_lacs / 100, 1),
        "stocks": len(screener),
    }
    movers_data = movers.build_movers(con, headline)
    pulse_data = movers.build_pulse(
        con, date, headline, screener, sectors_out, idx_rows, market_dict, names,
        by_symbol={e["symbol"]: e for e in screener},
        index_members=membership["index_members"])

    # Compact per-symbol meta for the rich hover-card (shared lookup map).
    tooltips = build_tooltips(headline, histories)

    _all_dates = available_dates(con)
    _prev_date = _all_dates[-2] if len(_all_dates) >= 2 else None
    data = {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "date": date,
        "dates": _all_dates,
        "market": {
            "advances": adv, "declines": dec, "unchanged": unch,
            "total_turnover_cr": round(total_turnover_lacs / 100, 1),
            "total_turnover_cr_prev": session_turnover(con, _prev_date),
            "stocks": len(screener),
        },
        "headline_indices": headline_indices(idx_rows),
        "regime": regime,
        "index_sectors": index_sectors,
        "fiidii": {"latest": fii_latest, "history": fh},
        "flows": flow_data,
        "intel": intel_data,
        "strategy": strategy_data,
        "ipo": ipo_data,
        "movers": movers_data,
        "pulse": pulse_data,
        "tooltips": tooltips,
        "sectors": sectors_out,
        "top_accumulation": headline[:40],
        "oi_buildup": buckets,
        "notable_deals": notable,
        "forecast": {
            "uptrends": uptrends[:40],
            "downtrends": downtrends[:40],
            "rated": len(rated),
        },
        "model": {
            "universe": len(mscores),
            "weights": {"momentum": model.W_MOM, "trend": model.W_TREND, "flow": model.W_FLOW},
            "backtest": backtest,
            "top_picks": model_picks[:40],
            "top_pans": model_pans[:40],
        },
        "multibaggers": multibaggers,
        "money_flow": build_money_flow(screener),
        "return_bands": build_return_bands(headline),
        "screener": headline,
    }
    # carried for emit_histories, popped before serialization
    data["_histories"] = histories
    data["_forecasts"] = forecasts
    return data


def emit_histories(con, screener, histories, forecasts):
    """Per-symbol time series for the stock detail pages (one small file each).

    Reuses the histories already loaded by build() (with OI merged) and embeds
    each symbol's forecast — trendline + indicators — so the detail chart can
    overlay the regression line and surface the directional read."""
    out_dir = WEB_DATA / "stocks"
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {e["symbol"]: e for e in screener}
    shp = load_shareholding(con)
    docs = []
    for sym in meta:
        series = histories.get(sym)
        if not series:
            continue
        f = forecasts.get(sym)
        m = meta.get(sym)
        doc = {"symbol": sym, "meta": m, "history": series,
               "forecast": f, "trendline": f.get("trendline") if f else None,
               "shareholding": build_shareholding_block(shp.get(sym, []), (m or {}).get("close"))}
        docs.append(doc)
        (out_dir / f"{sym}.json").write_text(json.dumps(doc, separators=(",", ":")))
    return docs


def run():
    con = store.connect()
    data = build(con)
    histories = data.pop("_histories")
    forecasts = data.pop("_forecasts")
    stock_docs = emit_histories(con, data["screener"], histories, forecasts)
    con.close()
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "latest.json").write_text(json.dumps(data, separators=(",", ":")))
    (PROCESSED / f"{data['date']}.json").write_text(json.dumps(data, separators=(",", ":")))
    mongo.push(data, stock_docs)  # cloud sync; no-op if MONGODB_URI unset
    print(f"Analyzed {data['date']}: {data['market']['stocks']} stocks, "
          f"{len(data['sectors'])} sectors, "
          f"top score {data['top_accumulation'][0]['score'] if data['top_accumulation'] else 'n/a'}")
    return data


if __name__ == "__main__":
    run()
