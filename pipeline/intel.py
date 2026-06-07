"""3-6 month intelligence engine — model-based.

Synthesizes NSE's deepest reports (delivery_daily, fo_oi_daily, fii_deriv_daily,
cat_fpi_daily / cat_dii_monthly) over a trailing ~6-month window into four
quantitative lenses. The maths is deliberately transparent — real statistics,
no black box:

  1. sustained_accumulation — a cross-sectional multi-factor model. Per stock we
     fit the delivery-% path with OLS (slope, R², t-stat), a robust Theil-Sen
     slope, and a non-parametric Mann-Kendall trend test; add a robust (MAD)
     z-score of the recent delivery level, a delivered-value surge, and an
     accumulation/distribution flow (delivered value signed by daily return).
     Each factor is winsorized + z-scored ACROSS the universe, blended, volatility-
     penalized, and turned into a 0-100 conviction percentile + a logistic
     up-probability — the way real quant factor models rank a cross-section.
  2. sector_rotation — a Relative Rotation Graph (JdK RRG). Each sector's share of
     delivered value is EWMA-smoothed, standardized into an RS-Ratio, and its rate
     of change into RS-Momentum, placing sectors in Leading / Weakening / Lagging /
     Improving quadrants with moving tails.
  3. institutional_regime — an Institutional Pressure Index: reconciled FII cash,
     DII, and FII index-futures nets, each z-scored against their own history and
     blended, with a rolling FII-DII correlation and a regime label.
  4. divergence — Spearman price/delivery correlation plus significance-gated
     trend tests: quiet accumulation (price soft, delivery significantly rising)
     vs weak rallies (price up, delivery significantly thinning).

Everything is an observation of order flow, not a recommendation.
"""
from __future__ import annotations

import math
import re

import numpy as np

import mathx

WINDOW = 126   # ~6 months of trading sessions
RECENT = 21    # ~1 month
MIN_TURN_LACS = 2000.0  # liquidity floor: >= ~20 Cr/day avg turnover

_NON_STOCK = re.compile(
    r"(ETF|BEES|GOLD|SILVER|LIQUID|GSEC|NIFTY|SENSEX|MON100|MOM\d|MAFANG|CASE$|^SDL|^GS\d)",
    re.I)


def _is_stock(sym: str) -> bool:
    return not _NON_STOCK.search(sym or "")


def _window_dates(con) -> list[str]:
    ds = [r["date"] for r in con.execute(
        "SELECT DISTINCT date FROM delivery_daily ORDER BY date DESC LIMIT ?", (WINDOW,))]
    return sorted(ds)


# ---------------------------------------------------------------- per-stock model

def _liquid_symbols(con, dates: list[str]) -> list[str]:
    qs = ",".join("?" * len(dates))
    rows = con.execute(
        f"""SELECT symbol FROM delivery_daily
            WHERE date IN ({qs}) AND series IN ('EQ','BE')
            GROUP BY symbol
            HAVING AVG(turnover_lacs) >= ? AND COUNT(*) >= ?""",
        [*dates, MIN_TURN_LACS, WINDOW * 0.7]).fetchall()
    return [r["symbol"] for r in rows if _is_stock(r["symbol"])]


def _series(con, symbols: list[str], dates: list[str]) -> dict[str, dict]:
    """Per-symbol aligned arrays over the window: delivery %, close, delivered ₹Cr."""
    qs_d = ",".join("?" * len(dates))
    qs_s = ",".join("?" * len(symbols))
    rows = con.execute(
        f"""SELECT symbol, date, close, deliv_pct,
                   turnover_lacs * deliv_pct / 100.0 / 100.0 AS dvcr
            FROM delivery_daily
            WHERE date IN ({qs_d}) AND symbol IN ({qs_s}) AND series IN ('EQ','BE')
            ORDER BY symbol, date""", [*dates, *symbols]).fetchall()
    out: dict[str, dict] = {}
    for r in rows:
        s = out.setdefault(r["symbol"], {"d": [], "c": [], "dv": []})
        s["d"].append(r["deliv_pct"]); s["c"].append(r["close"]); s["dv"].append(r["dvcr"])
    return out


def _stock_metrics(sym: str, sec: str | None, s: dict) -> dict | None:
    # Keep only sessions where both delivery and close exist, so every array
    # stays index-aligned for the regressions and correlations below.
    triples = [(dd, cc, vv if vv is not None else 0.0)
               for dd, cc, vv in zip(s["d"], s["c"], s["dv"])
               if dd is not None and cc is not None]
    if len(triples) < WINDOW * 0.7:
        return None
    d = np.asarray([t[0] for t in triples], dtype=float)
    c = np.asarray([t[1] for t in triples], dtype=float)
    dv = np.asarray([t[2] for t in triples], dtype=float)

    ols = mathx.ols_trend(d) or {}
    mk = mathx.mann_kendall(d) or {}
    ts = mathx.theil_sen(d)
    rec, base = d[-RECENT:], d[:-RECENT]
    rec_dv, base_dv = dv[-RECENT:], dv[:-RECENT]
    rec_dlv, base_dlv = float(rec.mean()), float(base.mean())
    dv_surge = float(rec_dv.mean() / base_dv.mean()) if base_dv.mean() else None

    # accumulation/distribution flow: delivered value signed by daily return,
    # cumulated, then its OLS slope normalized to "net accumulation months".
    rets = np.zeros_like(c)
    rets[1:] = np.sign(np.diff(c))
    adl = np.cumsum(rets * dv[:c.size])
    adl_ols = mathx.ols_trend(adl)
    adl_norm = (adl_ols["slope"] / (dv.mean() or 1.0) * RECENT) if adl_ols else 0.0

    price_chg = float((c[-1] / c[0] - 1) * 100) if c[0] else None
    dret = np.diff(c) / c[:-1]
    vol = float(np.std(dret, ddof=1) * 100) if dret.size > 2 else None
    px_dlv_corr = mathx.spearman(c, d[:c.size])

    return {
        "symbol": sym, "sector": sec, "close": round(float(c[-1]), 2),
        "price_chg": round(price_chg, 1) if price_chg is not None else None,
        "rec_dlv": round(rec_dlv, 1), "base_dlv": round(base_dlv, 1),
        "dlv_delta": round(rec_dlv - base_dlv, 1),
        "slope_pm": round(ols.get("slope", 0.0) * RECENT, 2),   # pp / month
        "ts_slope_pm": round((ts or 0.0) * RECENT, 2),
        "r2": round(ols.get("r2", 0.0), 2), "t": round(ols.get("t", 0.0), 1),
        "mk_tau": round(mk.get("tau", 0.0), 2), "mk_z": round(mk.get("z", 0.0), 1),
        "mk_p": round(mk.get("p", 1.0), 3),
        "rec_z": round(mathx.robust_z(rec_dlv, base), 1),
        "dv_ratio": round(dv_surge, 2) if dv_surge else None,
        "adl": round(float(adl_norm), 2),
        "vol": round(vol, 2) if vol is not None else None,
        "px_dlv_corr": round(px_dlv_corr, 2) if px_dlv_corr is not None else None,
        # raw values kept for cross-sectional standardization (popped before output)
        "_slope": ols.get("slope", 0.0), "_tau": mk.get("tau", 0.0),
        "_recz": mathx.robust_z(rec_dlv, base),
        "_money": math.log(dv_surge) if (dv_surge and dv_surge > 0) else 0.0,
        "_adl": float(adl_norm), "_vol": vol or 0.0,
    }


def _score_cross_section(metrics: list[dict]) -> None:
    """Winsorized cross-sectional z of each factor, blended into a conviction
    composite -> percentile (0-100) + logistic up-probability. Mutates in place."""
    zt = mathx.cross_z({m["symbol"]: m["_slope"] for m in metrics})
    zp = mathx.cross_z({m["symbol"]: m["_tau"] for m in metrics})
    zl = mathx.cross_z({m["symbol"]: m["_recz"] for m in metrics})
    zm = mathx.cross_z({m["symbol"]: m["_money"] for m in metrics})
    za = mathx.cross_z({m["symbol"]: m["_adl"] for m in metrics})
    zv = mathx.cross_z({m["symbol"]: m["_vol"] for m in metrics})
    comp = {}
    for m in metrics:
        s = m["symbol"]
        raw = (0.28 * zt.get(s, 0.0) + 0.22 * zp.get(s, 0.0) + 0.18 * zl.get(s, 0.0)
               + 0.18 * zm.get(s, 0.0) + 0.14 * za.get(s, 0.0))
        raw *= 1.0 / (1.0 + max(0.0, zv.get(s, 0.0)) * 0.30)  # volatility penalty
        comp[s] = raw
        m["composite"] = round(raw, 3)
        m["up_prob"] = round(mathx.logistic(raw) * 100, 1)
    pr = mathx.percentile_rank(comp)
    for m in metrics:
        m["conviction"] = pr.get(m["symbol"], 0.0)


# ---------------------------------------------------------------- lens 2: RRG

def _sector_rrg(con, sec_map: dict, dates: list[str]) -> dict:
    """JdK Relative Rotation Graph from sector delivered-value share."""
    qs = ",".join("?" * len(dates))
    rows = con.execute(
        f"""SELECT date, symbol, turnover_lacs * deliv_pct / 100.0 / 100.0 AS dv
            FROM delivery_daily WHERE date IN ({qs}) AND series IN ('EQ','BE')""",
        dates).fetchall()
    didx = {d: i for i, d in enumerate(dates)}
    n = len(dates)
    sec_dv: dict[str, np.ndarray] = {}
    total = np.zeros(n)
    for r in rows:
        sec = sec_map.get(r["symbol"])
        if not sec or not r["dv"]:
            continue
        sec_dv.setdefault(sec, np.zeros(n))[didx[r["date"]]] += r["dv"]
        total[didx[r["date"]]] += r["dv"]
    total[total == 0] = 1.0

    # keep liquid sectors only
    sectors = [s for s, arr in sec_dv.items() if arr.sum() / total.sum() > 0.005]
    lag = 10
    pts, series = [], []
    for sec in sectors:
        share = sec_dv[sec] / total * 100
        sm = mathx.ewma(share, halflife=10)
        mu, sd = sm.mean(), (sm.std(ddof=1) or 1.0)
        ratio_z = (sm - mu) / sd
        roc = np.zeros_like(sm)
        roc[lag:] = sm[lag:] - sm[:-lag]
        rmu, rsd = roc[lag:].mean(), (roc[lag:].std(ddof=1) or 1.0)
        mom_z = (roc - rmu) / rsd
        rs_ratio = 100 + 10 * ratio_z
        rs_mom = 100 + 10 * mom_z
        # moving tail: ~6 weekly samples
        idxs = list(range(n - 1, max(lag, n - 26) - 1, -5))[::-1]
        tail = [{"ratio": round(float(rs_ratio[i]), 1), "mom": round(float(rs_mom[i]), 1)}
                for i in idxs]
        rr, rm = float(rs_ratio[-1]), float(rs_mom[-1])
        quad = ("Leading" if rr >= 100 and rm >= 100 else
                "Weakening" if rr >= 100 and rm < 100 else
                "Improving" if rr < 100 and rm >= 100 else "Lagging")
        pts.append({"sector": sec, "rs_ratio": round(rr, 1), "rs_momentum": round(rm, 1),
                    "quadrant": quad, "share": round(float(share[-1]), 2),
                    "ratio_z": round(float(ratio_z[-1]), 2), "mom_z": round(float(mom_z[-1]), 2)})
        series.append({"sector": sec, "tail": tail})
    pts.sort(key=lambda p: (p["rs_ratio"] + p["rs_momentum"]), reverse=True)
    return {"points": pts, "tails": {s["sector"]: s["tail"] for s in series},
            "quadrants": {q: [p["sector"] for p in pts if p["quadrant"] == q]
                          for q in ("Leading", "Weakening", "Improving", "Lagging")}}


# ---------------------------------------------------------------- lens 3: regime

def _monthly(con, sql) -> dict[str, float]:
    return {r["m"]: (r["v"] or 0.0) for r in con.execute(sql)}


def _institutional_regime(con) -> dict:
    fii = _monthly(con, "SELECT substr(date,1,7) m, SUM(net) v FROM cat_fpi_daily GROUP BY m")
    dii = {r["month"]: (r["net"] or 0.0) for r in con.execute("SELECT month, net FROM cat_dii_monthly")}
    fut = _monthly(con, """SELECT substr(date,1,7) m, SUM(net) v FROM fii_deriv_daily
                           WHERE instrument='Index Futures' GROUP BY m""")

    def zlast(series: dict, month: str) -> float:
        hist = [series[m] for m in sorted(series) if m <= month]
        a = np.asarray(hist, dtype=float)
        if a.size < 4:
            return 0.0
        sd = a.std(ddof=1) or 1.0
        return float((a[-1] - a.mean()) / sd)

    months = sorted(set(fii) | set(dii) | set(fut))[-6:]
    W_F, W_D, W_U = 0.45, 0.35, 0.20
    series = []
    for m in months:
        zf, zd, zu = zlast(fii, m), zlast(dii, m), zlast(fut, m)
        ipi_raw = (W_F * zf + W_D * zd + W_U * zu) if (m in fii or m in dii) else None
        ipi = round(100 * math.tanh(ipi_raw / 1.5), 1) if ipi_raw is not None else None
        series.append({"month": m, "fii": round(fii.get(m, 0.0), 0),
                       "dii": round(dii.get(m, 0.0), 0), "ipi": ipi})

    # rolling FII-DII correlation over the last 12 shared months
    shared = sorted(set(fii) & set(dii))[-12:]
    corr = mathx.spearman([fii[m] for m in shared], [dii[m] for m in shared]) if len(shared) >= 8 else None

    fpi_3 = sum(fii.get(m, 0.0) for m in months[-3:])
    dii_3 = sum(dii.get(m, 0.0) for m in months[-3:])
    fut_3 = sum(fut.get(m, 0.0) for m in months[-3:])
    ipi_now = next((s["ipi"] for s in reversed(series) if s["ipi"] is not None), 0.0)

    if ipi_now >= 30:
        label = "Risk-on — institutions accumulating"
    elif ipi_now <= -30:
        label = "Risk-off — institutional de-risking"
    elif fpi_3 < 0 < dii_3:
        label = "DII-supported market"
    elif fpi_3 > 0 < dii_3 or (fpi_3 > 0 and dii_3 < 0):
        label = "FII-led, DII booking"
    else:
        label = "Mixed / range-bound flows"

    note = (f"Institutional Pressure Index at {ipi_now:+.0f} (−100…+100). "
            + ("Foreign cash is leaving while DII absorbs it — the tape is DII-held."
               if fpi_3 < 0 < dii_3 else
               "Both FII and DII are net buyers — broad demand." if fpi_3 > 0 and dii_3 > 0 else
               "Both FII and DII are net sellers — broad de-risking." if fpi_3 < 0 and dii_3 < 0 else
               "Foreign flows lead while domestics book profits."))
    if corr is not None and corr < -0.4:
        note += f" DII is strongly offsetting FII (rank corr {corr:+.2f})."
    deriv_note = None
    if fpi_3 < 0 and fut_3 > 0:
        deriv_note = "Cash/futures divergence: FII sells cash but is net-long index futures — positioning for a bounce."
    elif fpi_3 > 0 and fut_3 < 0:
        deriv_note = "FII buys cash yet net-short index futures — a hedged long stance."

    ld = con.execute("SELECT MAX(date) d FROM fii_deriv_daily").fetchone()["d"]
    positioning = [{"instrument": r["instrument"], "net": round(r["net"] or 0, 0),
                    "oi_amt": round(r["oi_amt"] or 0, 0)} for r in con.execute(
        "SELECT instrument, net, oi_amt FROM fii_deriv_daily WHERE date=? ORDER BY instrument", (ld,))]

    return {
        "series": series, "ipi_now": ipi_now, "as_of": ld, "positioning": positioning,
        "summary": {
            "label": label, "note": note, "deriv_note": deriv_note,
            "fii_cash_3mo": round(fpi_3, 0), "dii_3mo": round(dii_3, 0),
            "idx_fut_3mo": round(fut_3, 0), "fii_dii_corr": round(corr, 2) if corr is not None else None,
        },
    }


# ---------------------------------------------------------------- assembly

def _monthly_series(con, symbols: list[str], start: str) -> dict[str, list]:
    if not symbols:
        return {}
    qs = ",".join("?" * len(symbols))
    rows = con.execute(
        f"""SELECT symbol, substr(date,1,7) m, AVG(deliv_pct) d, AVG(close) c
            FROM delivery_daily WHERE symbol IN ({qs}) AND date >= ? AND series IN ('EQ','BE')
            GROUP BY symbol, m ORDER BY symbol, m""", [*symbols, start]).fetchall()
    out: dict[str, list] = {}
    for r in rows:
        out.setdefault(r["symbol"], []).append(
            {"m": r["m"], "deliv": round(r["d"] or 0, 1), "close": round(r["c"] or 0, 2)})
    return out


def _slim(m: dict) -> dict:
    return {k: v for k, v in m.items() if not k.startswith("_")}


def build_intel(con, date: str, sec_map: dict, names: dict | None = None) -> dict:
    names = names or {}
    dates = _window_dates(con)
    if len(dates) < 40:
        return {"window": {"sessions": len(dates)}, "universe": 0,
                "sustained_accumulation": [], "divergence": {"quiet": [], "weak": []},
                "sector_rotation": {"points": []}, "institutional_regime": {}}

    syms = _liquid_symbols(con, dates)
    series = _series(con, syms, dates)
    metrics = [m for sym in syms if (m := _stock_metrics(sym, sec_map.get(sym), series.get(sym, {}))) ]
    _score_cross_section(metrics)
    by_sym = {m["symbol"]: m for m in metrics}

    # Lens 1 — sustained accumulation: significant rising delivery (Mann-Kendall),
    # real value surge, firm-but-not-parabolic price; ranked by model conviction.
    accum = sorted(
        [m for m in metrics if m["mk_z"] >= 1.5 and m["slope_pm"] > 0
         and (m["dv_ratio"] or 0) >= 1.0 and m["price_chg"] is not None
         and -25 <= m["price_chg"] <= 100],
        key=lambda m: m["composite"], reverse=True)[:15]

    # Lens 4 — divergence, significance-gated.
    quiet = sorted(
        [m for m in metrics if m["price_chg"] is not None and -25 <= m["price_chg"] <= 8
         and m["mk_z"] >= 1.8 and m["rec_dlv"] >= 35],
        key=lambda m: (m["mk_z"], m["rec_z"]), reverse=True)[:12]
    weak = sorted(
        [m for m in metrics if m["price_chg"] is not None and m["price_chg"] >= 25
         and m["mk_z"] <= -1.0],
        key=lambda m: m["price_chg"], reverse=True)[:12]

    shown = sorted({m["symbol"] for m in (accum + quiet + weak)})
    ms = _monthly_series(con, shown, dates[0])
    for m in accum + quiet + weak:
        m["series"] = ms.get(m["symbol"], [])
        m["company"] = names.get(m["symbol"])

    return {
        "window": {"sessions": len(dates), "start": dates[0], "end": dates[-1],
                   "recent_sessions": RECENT},
        "universe": len(metrics),
        "method": ("Cross-sectional multi-factor model: OLS + Theil-Sen + Mann-Kendall "
                   "delivery-trend tests, robust (MAD) level z-score, delivered-value "
                   "surge and accumulation/distribution flow — winsorized, z-scored across "
                   "the universe, volatility-penalized, ranked to a conviction percentile."),
        "sustained_accumulation": [_slim(m) for m in accum],
        "divergence": {"quiet": [_slim(m) for m in quiet], "weak": [_slim(m) for m in weak]},
        "sector_rotation": _sector_rrg(con, sec_map, dates),
        "institutional_regime": _institutional_regime(con),
    }
