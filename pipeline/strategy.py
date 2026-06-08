"""Strategy Lab: quant risk metrics, factor scores, technical trading signals,
a market-regime gauge, and walk-forward strategy backtests.

Everything is derived from the shared per-symbol price/delivery histories that
analyze.build() already loads (no extra DB reads), plus the headline screener
entries (which already carry forecast + model fields) and the latest FII/DII +
VIX prints. Pure numpy; descriptive analytics only — NOT investment advice.

Returns one compact JSON-serializable dict consumed by the /strategy page.
"""
from __future__ import annotations

import math
import warnings

import numpy as np

import indicators as ind
import mathx

TRADING_DAYS = 252
RF_ANNUAL = 0.07  # ~7% Indian risk-free (G-sec) used for Sharpe/Sortino


# --------------------------------------------------------------------------- #
# Aligned price matrix + market proxy
# --------------------------------------------------------------------------- #

def _aligned(histories: dict[str, list], symbols: list[str], min_obs=60):
    """Build a [n_dates x n_syms] close matrix (NaN where missing) on a common
    date axis. Only symbols with >= min_obs observations are kept."""
    syms = [s for s in symbols
            if sum(1 for h in histories.get(s, []) if h.get("close") is not None) >= min_obs]
    dates = sorted({h["date"] for s in syms for h in histories.get(s, [])})
    didx = {d: i for i, d in enumerate(dates)}
    C = np.full((len(dates), len(syms)), np.nan)
    for j, s in enumerate(syms):
        for h in histories[s]:
            c = h.get("close")
            if c is not None:
                C[didx[h["date"]], j] = c
    return dates, syms, C


def _daily_returns(C):
    R = np.full_like(C, np.nan)
    if C.shape[0] > 1:
        R[1:] = C[1:] / C[:-1] - 1.0
    return R


# --------------------------------------------------------------------------- #
# Per-stock risk metrics
# --------------------------------------------------------------------------- #

def _risk_metrics(C, R, mkt):
    """Annualized return/vol, Sharpe, Sortino, beta vs the market proxy, and
    full-window max drawdown for every column. Returns list aligned to columns."""
    n = C.shape[1]
    out = [None] * n
    mkt_finite = np.isfinite(mkt)
    mkt_var = float(mkt[mkt_finite].var()) if mkt_finite.sum() > 2 else 0.0
    for j in range(n):
        rj = R[:, j]
        m = np.isfinite(rj)
        r = rj[m]
        if r.size < 40:
            continue
        mean_d = float(r.mean())
        sd_d = float(r.std(ddof=1)) if r.size > 1 else 0.0
        ann_ret = mean_d * TRADING_DAYS * 100
        ann_vol = sd_d * math.sqrt(TRADING_DAYS) * 100
        downside = r[r < 0]
        dd = (math.sqrt(float((downside ** 2).mean())) * math.sqrt(TRADING_DAYS)
              if downside.size else 0.0)
        sharpe = ((ann_ret / 100 - RF_ANNUAL) / (ann_vol / 100)) if ann_vol else None
        sortino = ((ann_ret / 100 - RF_ANNUAL) / dd) if dd else None
        # beta vs market over overlapping finite points
        both = m & mkt_finite
        beta = None
        if both.sum() > 40 and mkt_var > 0:
            cov = float(np.cov(rj[both], mkt[both])[0, 1])
            beta = cov / mkt_var
        # max drawdown over the full close window
        cj = C[:, j]
        cj = cj[np.isfinite(cj)]
        mdd = 0.0
        if cj.size > 2:
            peak = cj[0]
            for x in cj:
                peak = max(peak, x)
                mdd = min(mdd, x / peak - 1.0)
        out[j] = {
            "ann_ret": round(ann_ret, 1),
            "ann_vol": round(ann_vol, 1),
            "sharpe": round(sharpe, 2) if sharpe is not None else None,
            "sortino": round(sortino, 2) if sortino is not None else None,
            "beta": round(beta, 2) if beta is not None else None,
            "mdd": round(mdd * 100, 1),
        }
    return out


# --------------------------------------------------------------------------- #
# Technical trading signals (current state of each stock)
# --------------------------------------------------------------------------- #

def _technical_signals(histories, meta, syms):
    """Classify each stock into the classic setups it currently triggers."""
    groups = {
        "golden_cross": {"label": "Golden Cross", "tone": "up",
                         "desc": "50-DMA crossed above the 200-DMA in the last ~15 sessions — a long-term trend turn.",
                         "items": []},
        "death_cross": {"label": "Death Cross", "tone": "down",
                        "desc": "50-DMA crossed below the 200-DMA in the last ~15 sessions — a long-term trend break.",
                        "items": []},
        "macd_bull": {"label": "MACD Bullish Cross", "tone": "up",
                      "desc": "MACD histogram flipped positive in the last ~5 sessions — momentum turning up.",
                      "items": []},
        "rsi_oversold": {"label": "RSI Oversold (<30)", "tone": "accent",
                         "desc": "14-day RSI below 30 — stretched to the downside, watch for mean reversion.",
                         "items": []},
        "rsi_overbought": {"label": "RSI Overbought (>70)", "tone": "amber",
                           "desc": "14-day RSI above 70 — strong but extended; momentum can persist or snap back.",
                           "items": []},
        "bollinger_breakout": {"label": "Bollinger Breakout", "tone": "up",
                               "desc": "Close pushed above the upper 20-day Bollinger band (2σ) — volatility expansion to the upside.",
                               "items": []},
        "high_breakout": {"label": "52-Week-High Breakout", "tone": "up",
                          "desc": "Trading within 2% of the 52-week high — leadership / breakout zone.",
                          "items": []},
        "vol_dryup": {"label": "Volume Dry-Up", "tone": "muted",
                      "desc": "Volume under 55% of its 20-day average in a tight range — supply exhaustion often precedes a move.",
                      "items": []},
    }

    def push(key, sym, detail):
        m = meta.get(sym, {})
        groups[key]["items"].append({
            "symbol": sym, "company": m.get("company"), "sector": m.get("sector"),
            "close": m.get("close"), "detail": detail,
        })

    for s in syms:
        hist = histories.get(s, [])
        closes = [h.get("close") for h in hist]
        clean = [c for c in closes if c is not None]
        if len(clean) < 30:
            continue
        vols = [h.get("volume") for h in hist]
        last = clean[-1]
        m = meta.get(s, {})

        sma50_now = ind.sma(clean, 50)
        sma200_now = ind.sma(clean, 200)
        # cross detection: compare SMA relationship now vs ~15 sessions ago
        if sma50_now is not None and sma200_now is not None and len(clean) >= 215:
            prev = clean[:-15]
            sma50_p = ind.sma(prev, 50)
            sma200_p = ind.sma(prev, 200)
            if sma50_p is not None and sma200_p is not None:
                if sma50_p <= sma200_p and sma50_now > sma200_now:
                    push("golden_cross", s, f"50/200-DMA ₹{sma50_now:.0f} / ₹{sma200_now:.0f}")
                elif sma50_p >= sma200_p and sma50_now < sma200_now:
                    push("death_cross", s, f"50/200-DMA ₹{sma50_now:.0f} / ₹{sma200_now:.0f}")

        # MACD bullish cross (histogram flipped positive recently)
        _, _, h_now = ind.macd(clean)
        if h_now is not None and len(clean) >= 40:
            _, _, h_prev = ind.macd(clean[:-4])
            if h_prev is not None and h_prev <= 0 < h_now:
                push("macd_bull", s, f"MACD hist {h_now:+.2f}")

        # RSI extremes
        r = ind.rsi(clean, 14)
        if r is not None:
            if r < 30:
                push("rsi_oversold", s, f"RSI {r:.0f}")
            elif r > 70:
                push("rsi_overbought", s, f"RSI {r:.0f}")

        # Bollinger band (20, 2σ) breakout
        if len(clean) >= 20:
            win = np.asarray(clean[-20:], dtype=float)
            mu, sd = win.mean(), win.std(ddof=1)
            if sd > 0 and last > mu + 2 * sd:
                push("bollinger_breakout", s, f"+{(last - mu) / sd:.1f}σ")

        # 52-week-high breakout (use carried from_high if present)
        fh = m.get("from_high")
        if fh is None:
            hi = max(clean[-250:]) if len(clean) >= 5 else None
            fh = (last - hi) / hi * 100 if hi else None
        if fh is not None and fh >= -2:
            push("high_breakout", s, f"{fh:+.1f}% vs high")

        # Volume dry-up: latest volume well below 20-day average
        vclean = [v for v in vols if v is not None]
        if len(vclean) >= 21 and vclean[-1] is not None:
            avg20 = sum(vclean[-21:-1]) / 20
            if avg20 > 0 and vclean[-1] < 0.55 * avg20:
                push("vol_dryup", s, f"{vclean[-1] / avg20:.2f}× avg vol")

    # rank each group's items: breakout/momentum by score, sort sensibly
    order = ["high_breakout", "golden_cross", "macd_bull", "bollinger_breakout",
             "rsi_oversold", "vol_dryup", "rsi_overbought", "death_cross"]
    out = []
    for key in order:
        g = groups[key]
        items = g["items"]
        # sort by smart-money score desc when available
        items.sort(key=lambda x: (meta.get(x["symbol"], {}).get("score") or 0), reverse=True)
        out.append({
            "key": key, "label": g["label"], "tone": g["tone"], "desc": g["desc"],
            "count": len(items), "items": items[:18],
        })
    return out


# --------------------------------------------------------------------------- #
# Cross-sectional factor scores
# --------------------------------------------------------------------------- #

FACTOR_DEFS = [
    {"key": "momentum", "label": "Momentum",
     "desc": "12-1 trailing return (6-month return excluding the most recent month) — persistent trend, reversal-adjusted."},
    {"key": "lowvol", "label": "Low Volatility",
     "desc": "Inverse of annualized volatility — the low-risk anomaly: calmer stocks have historically earned better risk-adjusted returns."},
    {"key": "quality", "label": "Quality / Conviction",
     "desc": "Delivery-to-traded ratio — share of volume taken for real demat delivery rather than intraday churn."},
    {"key": "trend", "label": "Trend Strength",
     "desc": "Distance above the 200-DMA scaled by 60-day regression fit (R²) — how clean and established the uptrend is."},
]


def _robust_z(values: dict) -> dict:
    """Cross-sectional z-score that is robust in its *location/scale* (mean and
    std are estimated from winsorized data, so a handful of outliers can't drag
    them) but scores each name on its *raw* value. Unlike a fully winsorized
    z-score, this keeps genuine leaders distinct instead of flattening the whole
    top tail onto one clipped boundary — important for an ordered leaderboard."""
    items = [(k, v) for k, v in values.items() if v is not None and np.isfinite(v)]
    if len(items) < 5:
        return {}
    arr = np.asarray([v for _, v in items], dtype=float)
    w = mathx.winsorize(arr, 0.02)
    m = float(w.mean())
    sd = float(w.std(ddof=1)) or 1.0
    return {k: float((v - m) / sd) for k, v in items}


def _factor_scores(meta, feats, syms, risk_by_sym):
    """Cross-sectional factor z-scores (robust location/scale), a blended quant
    score, and per-factor leaderboards."""
    mom, lowvol, quality, trend = {}, {}, {}, {}
    for s in syms:
        m = meta.get(s, {})
        f = feats.get(s, {})
        # 12-1 momentum (6m return excluding the most recent month)
        if f.get("mom_skip") is not None:
            mom[s] = f["mom_skip"]
        elif m.get("ret_3m") is not None:
            mom[s] = m["ret_3m"]
        rv = risk_by_sym.get(s, {}).get("ann_vol")
        if rv:
            lowvol[s] = -rv
        if m.get("deliv_pct") is not None:
            quality[s] = m["deliv_pct"]
        d200 = f.get("dist_sma200")
        r2 = f.get("trend_r2")
        if d200 is not None:
            trend[s] = d200 * (0.5 + (r2 or 0.0))

    zmom = _robust_z(mom)
    zlow = _robust_z(lowvol)
    zqual = _robust_z(quality)
    ztr = _robust_z(trend)

    def leaders(zmap, raw, display_val):
        pr = mathx.percentile_rank(raw)
        rows = sorted(zmap.items(), key=lambda kv: kv[1], reverse=True)[:12]
        out = []
        for s, z in rows:
            m = meta.get(s, {})
            out.append({"symbol": s, "company": m.get("company"), "sector": m.get("sector"),
                        "z": round(z, 2), "pctile": pr.get(s), "val": display_val.get(s)})
        return out

    leaders_by_factor = {
        "momentum": leaders(zmom, mom, mom),
        "lowvol": leaders(zlow, lowvol, {k: round(-v, 1) for k, v in lowvol.items()}),
        "quality": leaders(zqual, quality, quality),
        "trend": leaders(ztr, trend, {k: round(v, 1) for k, v in trend.items()}),
    }

    # blended quant score = equal-weight mean of available factor z's
    composite = []
    for s in syms:
        zs = [z.get(s) for z in (zmom, zlow, zqual, ztr) if z.get(s) is not None]
        if len(zs) < 3:
            continue
        rk = risk_by_sym.get(s, {})
        m = meta.get(s, {})
        composite.append({
            "symbol": s, "company": m.get("company"), "sector": m.get("sector"),
            "quant": round(sum(zs) / len(zs), 2),
            "momentum": round(zmom.get(s), 2) if zmom.get(s) is not None else None,
            "lowvol": round(zlow.get(s), 2) if zlow.get(s) is not None else None,
            "quality": round(zqual.get(s), 2) if zqual.get(s) is not None else None,
            "trend": round(ztr.get(s), 2) if ztr.get(s) is not None else None,
            "sharpe": rk.get("sharpe"), "beta": rk.get("beta"), "ann_vol": rk.get("ann_vol"),
        })
    composite.sort(key=lambda x: x["quant"], reverse=True)
    return {"definitions": FACTOR_DEFS, "leaders": leaders_by_factor,
            "composite": composite[:30]}


# --------------------------------------------------------------------------- #
# Walk-forward strategy backtests
# --------------------------------------------------------------------------- #

def _mom_metric(C, t):
    lb = 63
    if t - lb < 0:
        return np.full(C.shape[1], np.nan)
    return C[t] / C[t - lb] - 1.0


def _lowvol_metric(C, t):
    lb = 60
    a = max(0, t - lb)
    w = C[a:t + 1]
    if w.shape[0] < 10:
        return np.full(C.shape[1], np.nan)
    r = w[1:] / w[:-1] - 1.0
    with np.errstate(invalid="ignore"):
        vol = np.nanstd(r, axis=0)
    return -vol  # lower vol ranks higher


def _hi52_metric(C, t):
    a = max(0, t - 250)
    w = C[a:t + 1]
    if w.shape[0] < 20:
        return np.full(C.shape[1], np.nan)
    with np.errstate(invalid="ignore"):
        mx = np.nanmax(w, axis=0)
    return C[t] / mx  # closeness to high (<=1)


def _one_backtest(dates, C, metric_fn, rebal=21, top_frac=0.2):
    n_dates = C.shape[0]
    start = 65  # need ~3m lookback for momentum
    eq_s, eq_b = 1.0, 1.0
    curve = [{"t": dates[start], "s": 1.0, "b": 1.0}]
    period_s, period_b, wins, periods = [], [], 0, 0
    for t in range(start, n_dates - 1, rebal):
        t2 = min(t + rebal, n_dates - 1)
        metric = metric_fn(C, t)
        fwd = C[t2] / C[t] - 1.0
        valid = np.isfinite(metric) & np.isfinite(fwd)
        vidx = np.where(valid)[0]
        if vidx.size < 30:
            continue
        vals = metric[vidx]
        k = max(5, int(vidx.size * top_frac))
        top = vidx[np.argsort(vals)][-k:]  # highest-metric names
        s_ret = float(np.nanmean(fwd[top]))
        b_ret = float(np.nanmean(fwd[vidx]))
        if not (math.isfinite(s_ret) and math.isfinite(b_ret)):
            continue
        base_s, base_b = eq_s, eq_b
        # mark the basket to market every session inside the holding window so the
        # equity curve is smooth (daily) rather than a coarse rebalance-point line
        for u in range(t + 1, t2 + 1):
            with np.errstate(invalid="ignore"):
                s_u = np.nanmean(C[u, top] / C[t, top] - 1.0)
                b_u = np.nanmean(C[u, vidx] / C[t, vidx] - 1.0)
            s_u = s_u if math.isfinite(s_u) else 0.0
            b_u = b_u if math.isfinite(b_u) else 0.0
            curve.append({"t": dates[u], "s": round(base_s * (1 + s_u), 4),
                          "b": round(base_b * (1 + b_u), 4)})
        eq_s = base_s * (1 + s_ret)
        eq_b = base_b * (1 + b_ret)
        period_s.append(s_ret)
        period_b.append(b_ret)
        wins += 1 if s_ret > b_ret else 0
        periods += 1
    if periods < 4:
        return None
    ps = np.asarray(period_s)
    years = periods * rebal / TRADING_DAYS
    ann_factor = TRADING_DAYS / rebal
    final_s, final_b = eq_s, eq_b
    cagr = final_s ** (1 / years) - 1 if years > 0 and final_s > 0 else None
    vol = float(ps.std(ddof=1)) * math.sqrt(ann_factor) if ps.size > 1 else 0.0
    mean_p = float(ps.mean())
    sharpe = ((mean_p * ann_factor - RF_ANNUAL) / vol) if vol else None
    # max drawdown off the daily equity curve
    peak, mdd = 1.0, 0.0
    for p in curve:
        peak = max(peak, p["s"])
        mdd = min(mdd, p["s"] / peak - 1.0)
    return {
        "periods": periods, "years": round(years, 2), "rebal_days": rebal,
        "top_frac": top_frac,
        "final_mult": round(final_s, 2), "bench_mult": round(final_b, 2),
        "cagr": round(cagr * 100, 1) if cagr is not None else None,
        "bench_cagr": round((final_b ** (1 / years) - 1) * 100, 1) if years > 0 and final_b > 0 else None,
        "ann_vol": round(vol * 100, 1),
        "sharpe": round(sharpe, 2) if sharpe is not None else None,
        "max_dd": round(mdd * 100, 1),
        "win_rate": round(100 * wins / periods, 0),
        "curve": curve,
    }


def _backtests(dates, C):
    specs = [
        ("momentum", "Cross-Sectional Momentum",
         "Each month, hold the top quintile by trailing 3-month return; equal-weight, rebalanced every ~21 sessions.",
         _mom_metric),
        ("lowvol", "Low-Volatility",
         "Each month, hold the calmest quintile by 60-day realized volatility — the low-risk anomaly.",
         _lowvol_metric),
        ("hi52", "52-Week-High Leaders",
         "Each month, hold the quintile trading closest to its 52-week high — relative-strength leadership.",
         _hi52_metric),
    ]
    out = []
    for key, label, desc, fn in specs:
        bt = _one_backtest(dates, C, fn)
        if bt:
            bt.update({"key": key, "label": label, "desc": desc})
            out.append(bt)
    return out


# --------------------------------------------------------------------------- #
# Market-regime gauge
# --------------------------------------------------------------------------- #

def _sub(value, lo, hi):
    """Linear-map value in [lo,hi] -> [0,100], clamped. lo may exceed hi to invert."""
    if value is None:
        return None
    if lo == hi:
        return 50.0
    t = (value - lo) / (hi - lo)
    return float(max(0.0, min(100.0, t * 100)))


def _market_regime(C, meta, syms, market, fiidii_latest, vix):
    last = C[-1]
    above50 = above200 = denom = 0
    for j, s in enumerate(syms):
        c = last[j]
        if not np.isfinite(c):
            continue
        col = C[:, j]
        col = col[np.isfinite(col)]
        if col.size < 50:
            continue
        denom += 1
        if col.size >= 50 and c > col[-50:].mean():
            above50 += 1
        if col.size >= 200 and c > col[-200:].mean():
            above200 += 1
    pct50 = 100 * above50 / denom if denom else None
    pct200 = 100 * above200 / denom if denom else None

    adv = sum(1 for s in syms if (meta.get(s, {}).get("pct_change") or 0) > 0.05)
    dec = sum(1 for s in syms if (meta.get(s, {}).get("pct_change") or 0) < -0.05)
    breadth = 100 * adv / (adv + dec) if (adv + dec) else None

    rsis = [meta.get(s, {}).get("rsi") for s in syms if meta.get(s, {}).get("rsi") is not None]
    med_rsi = float(np.median(rsis)) if rsis else None
    fhs = [meta.get(s, {}).get("from_high") for s in syms if meta.get(s, {}).get("from_high") is not None]
    med_fh = float(np.median(fhs)) if fhs else None

    fii_net = (fiidii_latest or {}).get("fii")

    comps = [
        {"key": "breadth", "label": "Daily breadth", "raw": breadth,
         "score": _sub(breadth, 30, 70), "fmt": (f"{breadth:.0f}% advancing" if breadth is not None else "—")},
        {"key": "above200", "label": "Above 200-DMA", "raw": pct200,
         "score": _sub(pct200, 25, 70), "fmt": (f"{pct200:.0f}% of universe" if pct200 is not None else "—")},
        {"key": "above50", "label": "Above 50-DMA", "raw": pct50,
         "score": _sub(pct50, 25, 70), "fmt": (f"{pct50:.0f}% of universe" if pct50 is not None else "—")},
        {"key": "vix", "label": "Volatility (India VIX)", "raw": vix,
         "score": _sub(vix, 22, 11), "fmt": (f"{vix:.1f}" if vix is not None else "—")},
        {"key": "fii", "label": "FII net flow", "raw": fii_net,
         "score": _sub(math.tanh((fii_net or 0) / 4000), -1, 1) if fii_net is not None else None,
         "fmt": (f"{'+' if (fii_net or 0) >= 0 else '−'}₹{abs(fii_net):,.0f} Cr" if fii_net is not None else "—")},
        {"key": "drawdown", "label": "Median drawdown from high", "raw": med_fh,
         "score": _sub(med_fh, -35, -8), "fmt": (f"{med_fh:.0f}% from high" if med_fh is not None else "—")},
        {"key": "rsi", "label": "Median RSI", "raw": med_rsi,
         "score": _sub(med_rsi, 38, 62), "fmt": (f"{med_rsi:.0f}" if med_rsi is not None else "—")},
    ]
    scores = [c["score"] for c in comps if c["score"] is not None]
    overall = float(np.mean(scores)) if scores else 50.0
    if overall >= 65:
        label, tone = "Risk-On", "up"
    elif overall >= 52:
        label, tone = "Constructive", "up"
    elif overall >= 42:
        label, tone = "Neutral", "amber"
    elif overall >= 30:
        label, tone = "Cautious", "amber"
    else:
        label, tone = "Risk-Off", "down"
    for c in comps:
        sc = c["score"]
        c["tone"] = "muted" if sc is None else ("up" if sc >= 60 else "down" if sc <= 40 else "amber")
        c["score"] = round(sc, 0) if sc is not None else None
    return {"score": round(overall, 0), "label": label, "tone": tone, "components": comps}


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #

def build_strategy(date, histories, headline, feats, idx_rows, fiidii_latest) -> dict:
    meta = {e["symbol"]: e for e in headline}
    symbols = list(meta.keys())
    dates, syms, C = _aligned(histories, symbols, min_obs=60)
    if len(dates) < 80 or len(syms) < 30:
        return {"ok": False, "reason": "insufficient history"}

    R = _daily_returns(C)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        mkt = np.nanmean(R, axis=1)  # equal-weight market-proxy daily return

    risk_list = _risk_metrics(C, R, mkt)
    risk_by_sym = {syms[j]: risk_list[j] for j in range(len(syms)) if risk_list[j]}

    # Risk leaderboards + a full sortable table (cap to keep payload lean)
    risk_rows = []
    for s, rk in risk_by_sym.items():
        m = meta.get(s, {})
        risk_rows.append({
            "symbol": s, "company": m.get("company"), "sector": m.get("sector"),
            "close": m.get("close"), "score": m.get("score"),
            "ann_ret": rk["ann_ret"], "ann_vol": rk["ann_vol"], "sharpe": rk["sharpe"],
            "sortino": rk["sortino"], "beta": rk["beta"], "mdd": rk["mdd"],
        })
    has_sharpe = [r for r in risk_rows if r["sharpe"] is not None]
    has_beta = [r for r in risk_rows if r["beta"] is not None]
    leaders = {
        "best_sharpe": sorted(has_sharpe, key=lambda r: r["sharpe"], reverse=True)[:10],
        "lowest_vol": sorted(risk_rows, key=lambda r: r["ann_vol"])[:10],
        "lowest_beta": sorted(has_beta, key=lambda r: r["beta"])[:10],
        "highest_beta": sorted(has_beta, key=lambda r: r["beta"], reverse=True)[:10],
    }
    # table: most liquid / highest-score names first
    risk_rows.sort(key=lambda r: (r["score"] or 0), reverse=True)

    # lean point-cloud for the risk/return scatter — the most liquid ~280 names
    # with finite vol & return, carrying only what the chart needs
    scatter = []
    for r in risk_rows:
        if r["ann_vol"] is None or r["ann_ret"] is None:
            continue
        scatter.append({
            "symbol": r["symbol"], "sector": r["sector"], "score": r["score"],
            "ann_ret": round(r["ann_ret"], 1), "ann_vol": round(r["ann_vol"], 1),
            "sharpe": None if r["sharpe"] is None else round(r["sharpe"], 2),
            "beta": None if r["beta"] is None else round(r["beta"], 2),
        })
        if len(scatter) >= 280:
            break

    vix = None
    for r in (idx_rows or []):
        if (r.get("index") or "").upper() == "INDIA VIX":
            vix = r.get("last")
            break

    with warnings.catch_warnings():
        # empty/all-NaN slices are expected for thin windows; counts stay valid
        warnings.simplefilter("ignore", RuntimeWarning)
        regime = _market_regime(C, meta, syms, mkt, fiidii_latest, vix)
        backtests = _backtests(dates, C)

    return {
        "ok": True,
        "as_of": date,
        "universe": len(syms),
        "history_days": len(dates),
        "regime": regime,
        "backtests": backtests,
        "factors": _factor_scores(meta, feats, syms, risk_by_sym),
        "signals": _technical_signals(histories, meta, syms),
        "risk": {"leaders": leaders, "rows": risk_rows[:60], "scatter": scatter},
    }
