"""Advanced cross-sectional trend model.

Where forecast.py scores each stock in isolation, this scores every stock
*relative to the whole universe* on the same day — the way real quant factor
models work. Pipeline:

  1. extract_features()  — raw technical/flow features per stock.
  2. score_universe()    — winsorize + z-score each feature ACROSS all stocks,
                           combine into momentum / trend / flow factors, blend
                           into a composite, then squash to an up-probability
                           with a logistic function.
  3. backtest()          — walk history, rank stocks by the same composite each
                           day, and measure how often the top decile actually
                           outperformed over the next H days (hit-rate + a rank
                           information-coefficient). Makes the "prediction"
                           measurable instead of hand-wavy.

Pure Python, no numpy. Every number is explainable.
"""
from __future__ import annotations

import math

import indicators as ind

# Composite factor weights (sum ~1). Momentum dominates — it's the most robust
# cross-sectional anomaly — but trend-quality and order-flow refine it.
W_MOM, W_TREND, W_FLOW = 0.45, 0.35, 0.20

# Logistic steepness mapping composite z-score -> probability. Calibrated so a
# composite of +1.5 sd ~= 75% and -1.5 sd ~= 25%; backtest can refine it.
LOGISTIC_K = 0.85


def _ret(closes, lookback):
    s = [c for c in closes if c is not None]
    if len(s) <= lookback or s[-lookback - 1] in (None, 0):
        return None
    return (s[-1] / s[-lookback - 1] - 1) * 100


def _realized_vol(closes, n=20):
    s = [c for c in closes if c is not None]
    if len(s) < n + 1:
        return None
    rets = [(s[i] / s[i - 1] - 1) for i in range(len(s) - n, len(s)) if s[i - 1]]
    if len(rets) < 2:
        return None
    m = sum(rets) / len(rets)
    var = sum((r - m) ** 2 for r in rets) / (len(rets) - 1)
    return math.sqrt(var) * 100  # daily % vol


def _max_drawdown(closes, n=60):
    s = [c for c in closes if c is not None][-n:]
    if len(s) < 3:
        return None
    peak, mdd = s[0], 0.0
    for x in s:
        peak = max(peak, x)
        mdd = min(mdd, x / peak - 1)
    return mdd * 100  # negative %


def extract_features(history: list[dict], wk_high=None, wk_low=None) -> dict | None:
    """Raw (un-normalized) features for one stock. None if too little history."""
    closes = [h.get("close") for h in history]
    if len([c for c in closes if c is not None]) < 30:
        return None
    delivs = [h.get("deliv") for h in history]
    vols = [h.get("volume") for h in history]
    ois = [h.get("oi") for h in history]
    last = closes[-1]

    sma50 = ind.sma(closes, 50)
    sma200 = ind.sma(closes, 200)
    rsi = ind.rsi(closes, 14)
    _, _, macd_h = ind.macd(closes)
    reg60 = ind.linreg(closes[-60:])
    dreg = ind.linreg([d for d in delivs[-20:]])
    vreg = ind.linreg([v for v in vols[-20:]])
    oi_first = next((x for x in ois if x is not None), None)
    oi_last = next((x for x in reversed(ois) if x is not None), None)

    f = {
        "ret_1m": _ret(closes, 21),
        "ret_3m": _ret(closes, 63),
        "ret_6m": _ret(closes, 126),
        # 12-1 momentum: 6m return excluding the most recent month (reversal).
        "mom_skip": (_ret(closes, 126) - _ret(closes, 21))
        if _ret(closes, 126) is not None and _ret(closes, 21) is not None else None,
        "vol_20": _realized_vol(closes, 20),
        "trend_slope": reg60["slope_pct"] if reg60 else None,
        "trend_r2": reg60["r2"] if reg60 else 0.0,
        "rsi": rsi,
        "macd_n": (macd_h / (abs(last) * 0.02 + 1e-9)) if macd_h is not None else None,
        "dist_sma50": ((last - sma50) / sma50 * 100) if (sma50 and last) else None,
        "dist_sma200": ((last - sma200) / sma200 * 100) if (sma200 and last) else None,
        "wk52_pos": ind.pct_position(last, wk_low, wk_high),
        "deliv_trend": dreg["slope_pct"] if dreg else None,
        "vol_trend": vreg["slope_pct"] if vreg else None,
        "oi_trend": ((oi_last - oi_first) / oi_first * 100)
        if (oi_first and oi_last) else None,
        "mdd_60": _max_drawdown(closes, 60),
        "last": last,
    }
    return f


# --- cross-sectional statistics (pure Python) ---

def _winsorize(vals, p=0.02):
    s = sorted(vals)
    n = len(s)
    if n < 5:
        return vals
    lo = s[max(0, int(n * p))]
    hi = s[min(n - 1, int(n * (1 - p)))]
    return [min(hi, max(lo, v)) for v in vals]


def _zscores(feature_map: dict[str, float]) -> dict[str, float]:
    """Winsorized z-scores for one feature across the universe. None-safe."""
    items = [(k, v) for k, v in feature_map.items() if v is not None]
    if len(items) < 5:
        return {}
    keys = [k for k, _ in items]
    vals = _winsorize([v for _, v in items])
    m = sum(vals) / len(vals)
    sd = math.sqrt(sum((v - m) ** 2 for v in vals) / (len(vals) - 1)) or 1.0
    return {k: (v - m) / sd for k, v in zip(keys, vals)}


def _z(zmaps, feat, sym):
    return zmaps.get(feat, {}).get(sym, 0.0)


def score_universe(features_by_symbol: dict[str, dict]) -> dict[str, dict]:
    """Cross-sectional scoring. Returns per-symbol dict with composite, factor
    breakdown, and up-probabilities for 5d and 20d horizons."""
    feats = {s: f for s, f in features_by_symbol.items() if f}
    if len(feats) < 10:
        return {}

    # Build a z-map per feature across the universe.
    fields = ["ret_3m", "ret_6m", "mom_skip", "macd_n", "trend_slope",
              "dist_sma50", "dist_sma200", "wk52_pos", "deliv_trend",
              "vol_trend", "oi_trend", "vol_20", "rsi"]
    zmaps = {fld: _zscores({s: f.get(fld) for s, f in feats.items()}) for fld in fields}

    out = {}
    for s, f in feats.items():
        momentum = (0.40 * _z(zmaps, "ret_3m", s)
                    + 0.30 * _z(zmaps, "mom_skip", s)
                    + 0.15 * _z(zmaps, "ret_6m", s)
                    + 0.15 * _z(zmaps, "macd_n", s))
        # Trend quality scaled by how clean the trend is (R²).
        r2 = f.get("trend_r2") or 0.0
        trend = (0.50 * _z(zmaps, "trend_slope", s)
                 + 0.25 * _z(zmaps, "dist_sma50", s)
                 + 0.25 * _z(zmaps, "wk52_pos", s)) * (0.5 + 0.5 * r2)
        flow = (0.45 * _z(zmaps, "deliv_trend", s)
                + 0.20 * _z(zmaps, "vol_trend", s)
                + 0.35 * _z(zmaps, "oi_trend", s))

        composite = W_MOM * momentum + W_TREND * trend + W_FLOW * flow
        # Volatility penalty: high realized vol shrinks conviction toward 0.
        vol_pen = 1.0 / (1.0 + max(0.0, _z(zmaps, "vol_20", s)) * 0.35)
        composite *= vol_pen

        p5 = 1.0 / (1.0 + math.exp(-LOGISTIC_K * composite))
        # 20d horizon leans more on trend than fast momentum.
        comp20 = 0.30 * momentum + 0.50 * trend + 0.20 * flow
        p20 = 1.0 / (1.0 + math.exp(-LOGISTIC_K * comp20 * vol_pen))

        out[s] = {
            "composite": round(composite, 3),
            "factor_momentum": round(momentum, 2),
            "factor_trend": round(trend, 2),
            "factor_flow": round(flow, 2),
            "up_prob_5d": round(p5 * 100, 1),
            "up_prob_20d": round(p20 * 100, 1),
            "vol_20": round(f["vol_20"], 2) if f.get("vol_20") is not None else None,
            "mdd_60": round(f["mdd_60"], 1) if f.get("mdd_60") is not None else None,
        }
    return out


# --- backtest: does the composite actually rank future returns? ---

def _spearman_ic(pairs):
    """Rank correlation between signal and forward return. pairs: (signal, fwd)."""
    n = len(pairs)
    if n < 8:
        return None

    def ranks(xs):
        order = sorted(range(n), key=lambda i: xs[i])
        r = [0] * n
        for rank, i in enumerate(order):
            r[i] = rank
        return r
    rs = ranks([p[0] for p in pairs])
    rf = ranks([p[1] for p in pairs])
    mrs = sum(rs) / n
    mrf = sum(rf) / n
    num = sum((rs[i] - mrs) * (rf[i] - mrf) for i in range(n))
    den = math.sqrt(sum((rs[i] - mrs) ** 2 for i in range(n))
                    * sum((rf[i] - mrf) ** 2 for i in range(n)))
    return num / den if den else None


def backtest(histories: dict[str, list], wk: dict, horizon=20, step=5,
             min_universe=30) -> dict:
    """Walk the shared history. On each sampled day, score the universe with the
    SAME composite used live, then measure forward H-day returns. Reports:
      - decile hit-rate: % of top-decile names that beat the universe median.
      - mean IC: average rank correlation of composite vs forward return.
      - calibration: realized up-rate within probability buckets.
    """
    # Align all symbols on a common date axis.
    dates = sorted({h["date"] for hs in histories.values() for h in hs})
    if len(dates) < horizon + 40:
        return {"ok": False, "reason": "insufficient history", "sessions": len(dates)}
    by_sym_date = {s: {h["date"]: h for h in hs} for s, hs in histories.items()}

    ics, top_hits, top_total = [], 0, 0
    buckets = {b: [0, 0] for b in range(5)}  # prob bucket -> [ups, total]
    sampled = 0
    # Leave a forward window at the end.
    for di in range(40, len(dates) - horizon, step):
        d = dates[di]
        dfwd = dates[di + horizon]
        # Build truncated histories up to day d and score the universe.
        feats = {}
        fwd = {}
        for s, dm in by_sym_date.items():
            if d not in dm or dfwd not in dm:
                continue
            hs = by_sym_date[s]
            window = [h for h in histories[s] if h["date"] <= d]
            f = extract_features(window, wk.get(s, {}).get("high"), wk.get(s, {}).get("low"))
            if not f:
                continue
            c0 = dm[d].get("close")
            c1 = dm[dfwd].get("close")
            if not c0 or not c1:
                continue
            feats[s] = f
            fwd[s] = (c1 / c0 - 1) * 100
        if len(feats) < min_universe:
            continue
        scored = score_universe(feats)
        if not scored:
            continue
        sampled += 1
        pairs = [(scored[s]["composite"], fwd[s]) for s in scored if s in fwd]
        ic = _spearman_ic(pairs)
        if ic is not None:
            ics.append(ic)
        # decile hit-rate
        med = sorted(fwd.values())[len(fwd) // 2]
        ranked = sorted(scored.items(), key=lambda kv: kv[1]["composite"], reverse=True)
        topn = max(1, len(ranked) // 10)
        for s, sc in ranked[:topn]:
            top_total += 1
            if fwd.get(s, -1e9) > med:
                top_hits += 1
        # calibration on 20d prob
        for s, sc in scored.items():
            if s not in fwd:
                continue
            b = min(4, int(sc["up_prob_20d"] / 20))
            buckets[b][1] += 1
            if fwd[s] > 0:
                buckets[b][0] += 1

    mean_ic = sum(ics) / len(ics) if ics else None
    calib = {f"{b*20}-{b*20+20}%": (round(100 * u / t, 1) if t else None)
             for b, (u, t) in buckets.items()}
    return {
        "ok": sampled > 0,
        "horizon_days": horizon,
        "sessions_sampled": sampled,
        "mean_ic": round(mean_ic, 3) if mean_ic is not None else None,
        "top_decile_hit_rate": round(100 * top_hits / top_total, 1) if top_total else None,
        "calibration": calib,
    }
