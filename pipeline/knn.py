"""KNN multibagger finder — k-nearest-neighbour analog model.

Goal: surface a handful of stocks whose *current* setup most resembles past
setups that went on to pop >10% within a month. It's an analog engine, not a
crystal ball — every prediction is grounded in real historical precedents that
are shown to the user.

Pipeline (pure Python, no numpy — every number is explainable):

  1. build_samples()  — walk each stock's history. At sampled past days, snapshot
     the same technical + smart-money feature vector model.py already computes,
     and LABEL it 1 if the stock's best close over the next ~21 sessions beat the
     entry by the target % (a "10% in a month" move), else 0.
  2. standardize()    — z-score each feature across the whole sample so distances
     are comparable (a 2% move in RSI shouldn't dwarf a 2-point move in return).
  3. knn_prob()       — for a query stock, find the K nearest historical analogs
     in standardized feature space; probability = distance-weighted share of those
     analogs that were hits.
  4. temporal holdout — fit on the older slice, score the newer slice, and report
     base-rate, precision@top-decile and lift so the edge is measured, not assumed.

The features deliberately include delivery-trend, OI-trend and volume-trend —
the "smart money flow" the rest of the app tracks — alongside price momentum and
trend quality.
"""
from __future__ import annotations

import math

import model

# Feature subset used for the analog distance. All are produced by
# model.extract_features() and are reasonably stationary across time.
FEATURES = [
    "ret_1m", "ret_3m", "mom_skip",          # momentum
    "trend_slope", "trend_r2", "dist_sma50",  # trend quality
    "rsi", "wk52_pos",                        # position
    "deliv_trend", "vol_trend", "oi_trend",   # smart-money flow
    "vol_20",                                 # risk
]

# Relative weight of each feature inside the distance metric. Flow + momentum
# matter most for a fast multibagger move; raw volatility least.
FEATURE_W = {
    "ret_1m": 1.0, "ret_3m": 1.2, "mom_skip": 1.0,
    "trend_slope": 1.1, "trend_r2": 0.8, "dist_sma50": 0.9,
    "rsi": 0.7, "wk52_pos": 1.0,
    "deliv_trend": 1.3, "vol_trend": 1.0, "oi_trend": 1.1,
    "vol_20": 0.5,
}

HORIZON = 21          # ~1 trading month forward
TARGET_PCT = 10.0     # "multibagger move" threshold for the month
MIN_WINDOW = 60       # need this many sessions before a setup is scoreable
SAMPLE_STEP = 6       # sample one setup every N sessions per stock (speed)
K = 50                # neighbours
MAX_SAMPLES = 16000   # hard cap on the neighbour pool (speed guard)


def _vectorize(f: dict | None):
    if not f:
        return None
    return [f.get(k) for k in FEATURES]


def _fwd_max_return(closes_after: list[float], c0: float) -> float | None:
    """Best close-to-close return over the forward window (the month's peak)."""
    xs = [c for c in closes_after if c is not None]
    if not xs or not c0:
        return None
    return (max(xs) / c0 - 1.0) * 100.0


def build_samples(histories: dict[str, list], wk: dict,
                  horizon=HORIZON, step=SAMPLE_STEP, target=TARGET_PCT) -> list[dict]:
    """Walk-forward labelled snapshots across the whole universe."""
    samples = []
    for sym, hs in histories.items():
        hs = [h for h in hs if h.get("close") is not None]
        n = len(hs)
        if n < MIN_WINDOW + horizon + 5:
            continue
        hi = wk.get(sym, {}).get("high")
        lo = wk.get(sym, {}).get("low")
        # sample setup days, leaving a forward window at the end
        for i in range(MIN_WINDOW, n - horizon, step):
            window = hs[:i + 1]
            f = model.extract_features(window, hi, lo)
            vec = _vectorize(f)
            if vec is None:
                continue
            c0 = hs[i].get("close")
            fwd = _fwd_max_return([h.get("close") for h in hs[i + 1:i + 1 + horizon]], c0)
            if fwd is None:
                continue
            samples.append({
                "sym": sym,
                "date": hs[i].get("date"),
                "vec": vec,
                "fwd": fwd,
                "label": 1 if fwd >= target else 0,
            })
    # cap the pool with an even stride so it stays representative
    if len(samples) > MAX_SAMPLES:
        stride = len(samples) / MAX_SAMPLES
        samples = [samples[int(j * stride)] for j in range(MAX_SAMPLES)]
    return samples


def standardize(samples: list[dict]):
    """Per-feature mean/std over the sample pool; returns (means, stds)."""
    nf = len(FEATURES)
    sums = [0.0] * nf
    cnts = [0] * nf
    for s in samples:
        for j, v in enumerate(s["vec"]):
            if v is not None:
                sums[j] += v
                cnts[j] += 1
    means = [sums[j] / cnts[j] if cnts[j] else 0.0 for j in range(nf)]
    sq = [0.0] * nf
    for s in samples:
        for j, v in enumerate(s["vec"]):
            if v is not None:
                sq[j] += (v - means[j]) ** 2
    stds = [math.sqrt(sq[j] / (cnts[j] - 1)) if cnts[j] > 1 else 1.0 for j in range(nf)]
    stds = [sd if sd > 1e-9 else 1.0 for sd in stds]
    return means, stds


def _std_vec(vec, means, stds):
    """Standardize a raw vector; missing values impute to the mean (=> 0)."""
    out = []
    wts = []
    for j, v in enumerate(vec):
        w = FEATURE_W[FEATURES[j]]
        if v is None:
            out.append(0.0)
            wts.append(w * 0.5)  # down-weight imputed dims
        else:
            out.append((v - means[j]) / stds[j])
            wts.append(w)
    return out, wts


def _prep_pool(samples, means, stds):
    pool = []
    for s in samples:
        sv, _ = _std_vec(s["vec"], means, stds)
        pool.append((sv, s))
    return pool


def knn_prob(qv, qw, pool, k=K):
    """Distance-weighted hit probability + neighbour stats for one query."""
    dists = []
    for sv, s in pool:
        d = 0.0
        for j in range(len(qv)):
            diff = qv[j] - sv[j]
            d += qw[j] * diff * diff
        dists.append((d, s))
    dists.sort(key=lambda t: t[0])
    near = dists[:k]
    if not near:
        return None
    num = den = 0.0
    ups = 0
    fwds = []
    for d, s in near:
        w = 1.0 / (1.0 + math.sqrt(d))   # closer analogs weigh more
        num += w * s["label"]
        den += w
        ups += s["label"]
        fwds.append(s["fwd"])
    prob = (num / den) if den else 0.0
    fwds.sort(reverse=True)
    return {
        "prob": prob,
        "neighbors_up": ups,
        "neighbors_total": len(near),
        "median_fwd": fwds[len(fwds) // 2],
        "near": near,
    }


def _validate(samples, means, stds, k=K):
    """Temporal holdout: fit on the older 80% of setups, score the newer 20%,
    measure base-rate, precision@top-decile and lift. Honest, no lookahead."""
    dated = sorted([s for s in samples if s["date"]], key=lambda s: s["date"])
    if len(dated) < 400:
        return None
    cut = int(len(dated) * 0.8)
    train, val = dated[:cut], dated[cut:]
    # subsample for speed
    if len(train) > 7000:
        st = len(train) / 7000
        train = [train[int(j * st)] for j in range(7000)]
    if len(val) > 700:
        st = len(val) / 700
        val = [val[int(j * st)] for j in range(700)]
    pool = _prep_pool(train, means, stds)
    scored = []
    for s in val:
        qv, qw = _std_vec(s["vec"], means, stds)
        r = knn_prob(qv, qw, pool, k=k)
        if r:
            scored.append((r["prob"], s["label"]))
    if len(scored) < 50:
        return None
    base = 100.0 * sum(l for _, l in scored) / len(scored)
    scored.sort(key=lambda t: t[0], reverse=True)
    topn = max(5, len(scored) // 10)
    top = scored[:topn]
    prec = 100.0 * sum(l for _, l in top) / len(top)
    return {
        "val_samples": len(scored),
        "base_rate": round(base, 1),
        "precision_top_decile": round(prec, 1),
        "lift": round(prec / base, 2) if base > 0 else None,
    }


def _reasons(sym, raw_feat: dict, screener: dict) -> list[str]:
    """Plain-English why-it-resembles-a-winner, from the stock's own numbers."""
    r = []
    f = raw_feat or {}
    sc = screener or {}
    if f.get("ret_3m") is not None and f["ret_3m"] > 8:
        r.append(f"Strong 3-month momentum (+{f['ret_3m']:.0f}%)")
    if f.get("deliv_trend") is not None and f["deliv_trend"] > 0.5:
        r.append("Rising delivery — real demat accumulation")
    if f.get("oi_trend") is not None and f["oi_trend"] > 5:
        r.append(f"Open interest building (+{f['oi_trend']:.0f}%)")
    if (f.get("trend_r2") or 0) > 0.5 and (f.get("trend_slope") or 0) > 0:
        r.append(f"Clean uptrend (R² {f['trend_r2']:.2f})")
    if f.get("wk52_pos") is not None and f["wk52_pos"] > 70:
        r.append(f"Near 52-week high ({f['wk52_pos']:.0f}% of range)")
    if f.get("vol_trend") is not None and f["vol_trend"] > 1:
        r.append("Volume expanding vs trend")
    if sc.get("score") is not None and sc["score"] >= 60:
        r.append(f"Smart-money score {sc['score']:.0f}")
    if sc.get("oi_label") in ("long_buildup", "short_covering"):
        r.append("Bullish F&O buildup")
    if f.get("rsi") is not None and 50 <= f["rsi"] <= 68:
        r.append(f"Healthy RSI ({f['rsi']:.0f})")
    return r[:4] or ["Setup statistically resembles past pre-breakout names"]


def build_multibaggers(histories: dict[str, list], wk: dict,
                       current_feats: dict[str, dict], screener_by_sym: dict,
                       top_n=3, horizon=HORIZON, target=TARGET_PCT, k=K) -> dict:
    """Main entry. Returns the multibagger payload + a {symbol: prob%} map to
    stamp onto every screener row."""
    samples = build_samples(histories, wk, horizon=horizon, target=target)
    if len(samples) < 300:
        return {"ok": False, "reason": "insufficient history", "samples": len(samples)}

    means, stds = standardize(samples)
    base_rate = 100.0 * sum(s["label"] for s in samples) / len(samples)
    pool = _prep_pool(samples, means, stds)
    validation = _validate(samples, means, stds, k=k)

    # Score every current stock that has a feature vector.
    probs = {}
    scored = []
    for sym, f in current_feats.items():
        vec = _vectorize(f)
        if vec is None:
            continue
        qv, qw = _std_vec(vec, means, stds)
        r = knn_prob(qv, qw, pool, k=k)
        if not r:
            continue
        prob_pct = round(r["prob"] * 100, 1)
        probs[sym] = prob_pct
        sc = screener_by_sym.get(sym, {})
        scored.append({
            "symbol": sym,
            "prob": prob_pct,
            "lift": round(r["prob"] * 100 / base_rate, 2) if base_rate > 0 else None,
            "neighbors_up": r["neighbors_up"],
            "neighbors_total": r["neighbors_total"],
            "median_analog_move": round(r["median_fwd"], 1),
            "near": r["near"],
            "company": sc.get("company"),
            "sector": sc.get("sector"),
            "close": sc.get("close"),
            "score": sc.get("score"),
            "raw": f,
            "sc": sc,
        })

    # Pick top-N — must be liquid + enough analog support, ranked by probability.
    eligible = [s for s in scored
                if (s["sc"].get("liquid") and s["neighbors_total"] >= max(20, k // 2))]
    eligible.sort(key=lambda s: (s["prob"], s["lift"] or 0), reverse=True)

    picks = []
    for s in eligible[:top_n]:
        # nearest historical analogs that actually went on to pop
        analogs = []
        for d, samp in s["near"]:
            if samp["label"] == 1 and samp["sym"] != s["symbol"]:
                analogs.append({
                    "symbol": samp["sym"],
                    "date": samp["date"],
                    "move": round(samp["fwd"], 1),
                })
            if len(analogs) >= 3:
                break
        # confidence: blend probability, lift, neighbour agreement, validation edge
        agree = s["neighbors_up"] / s["neighbors_total"] if s["neighbors_total"] else 0
        edge = (validation["lift"] - 1) if (validation and validation.get("lift")) else 0
        conf = _clamp(38 + s["prob"] * 0.45 + agree * 25 + min(20, edge * 20))
        picks.append({
            "symbol": s["symbol"],
            "company": s["company"],
            "sector": s["sector"],
            "close": s["close"],
            "score": s["score"],
            "prob": s["prob"],
            "lift": s["lift"],
            "neighbors_up": s["neighbors_up"],
            "neighbors_total": s["neighbors_total"],
            "median_analog_move": s["median_analog_move"],
            "confidence": round(conf, 0),
            "reasons": _reasons(s["symbol"], s["raw"], s["sc"]),
            "analogs": analogs,
            "factors": {
                "momentum_3m": _r(s["raw"].get("ret_3m")),
                "deliv_trend": _r(s["raw"].get("deliv_trend")),
                "oi_trend": _r(s["raw"].get("oi_trend")),
                "trend_r2": _r(s["raw"].get("trend_r2"), 2),
                "wk52_pos": _r(s["raw"].get("wk52_pos")),
                "rsi": _r(s["raw"].get("rsi")),
            },
        })

    return {
        "ok": True,
        "horizon_days": horizon,
        "target_pct": target,
        "k": k,
        "samples": len(samples),
        "universe_scored": len(scored),
        "base_rate": round(base_rate, 1),
        "validation": validation,
        "picks": picks,
        "probs": probs,
    }


def _clamp(x, lo=0.0, hi=99.0):
    return max(lo, min(hi, x))


def _r(x, nd=1):
    return round(x, nd) if x is not None else None
