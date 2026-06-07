"""Statistical toolkit for the intelligence engine.

Small, explainable wrappers around numpy/scipy — every function returns plain
numbers so the signals stay transparent. Used by intel.py for trend tests,
robust estimators, and cross-sectional factor standardization.
"""
from __future__ import annotations

import numpy as np
from scipy import stats


def _clean(y) -> np.ndarray:
    a = np.asarray([v for v in y if v is not None], dtype=float)
    return a[np.isfinite(a)]


# ---- time-series trend statistics (series oldest -> newest) ----

def ols_trend(y) -> dict | None:
    """Least-squares trend of y vs evenly-spaced time. slope is per-step."""
    a = _clean(y)
    if a.size < 4:
        return None
    x = np.arange(a.size, dtype=float)
    r = stats.linregress(x, a)
    t = (r.slope / r.stderr) if r.stderr else 0.0
    return {"slope": float(r.slope), "r2": float(r.rvalue ** 2),
            "t": float(t), "p": float(r.pvalue), "n": int(a.size)}


def theil_sen(y) -> float | None:
    """Median-of-pairwise-slopes — robust to outliers and spikes."""
    a = _clean(y)
    if a.size < 4:
        return None
    x = np.arange(a.size, dtype=float)
    return float(stats.theilslopes(a, x)[0])


def mann_kendall(y) -> dict | None:
    """Non-parametric monotonic-trend test. Returns Kendall tau, the normalized
    z-statistic (sign + significance of the trend) and its two-sided p-value.
    Tie-corrected variance. Robust where OLS is fooled by curvature/outliers."""
    a = _clean(y)
    n = a.size
    if n < 8:
        return None
    s = 0.0
    for k in range(n - 1):
        s += np.sum(np.sign(a[k + 1:] - a[k]))
    _, counts = np.unique(a, return_counts=True)
    var = (n * (n - 1) * (2 * n + 5)
           - np.sum(counts * (counts - 1) * (2 * counts + 5))) / 18.0
    if var <= 0:
        return {"tau": 0.0, "z": 0.0, "p": 1.0, "s": float(s)}
    if s > 0:
        z = (s - 1) / np.sqrt(var)
    elif s < 0:
        z = (s + 1) / np.sqrt(var)
    else:
        z = 0.0
    tau = s / (0.5 * n * (n - 1))
    p = 2 * (1 - stats.norm.cdf(abs(z)))
    return {"tau": float(tau), "z": float(z), "p": float(p), "s": float(s)}


def robust_z(value: float, sample) -> float:
    """How many MADs `value` sits above the sample's median (outlier-robust z)."""
    a = _clean(sample)
    if a.size < 4 or value is None:
        return 0.0
    med = np.median(a)
    mad = np.median(np.abs(a - med))
    if mad == 0:
        sd = a.std(ddof=1)
        return float((value - med) / sd) if sd else 0.0
    return float((value - med) / (1.4826 * mad))


def spearman(a, b) -> float | None:
    """Rank correlation between two aligned series."""
    aa = np.asarray(a, dtype=float)
    bb = np.asarray(b, dtype=float)
    m = np.isfinite(aa) & np.isfinite(bb)
    if m.sum() < 8:
        return None
    rho = stats.spearmanr(aa[m], bb[m]).correlation
    return float(rho) if np.isfinite(rho) else None


def ewma(y, halflife: float) -> np.ndarray:
    """Exponentially-weighted moving average (halflife in steps)."""
    a = np.asarray(y, dtype=float)
    alpha = 1 - 0.5 ** (1.0 / halflife)
    out = np.empty_like(a)
    acc = a[0]
    for i, v in enumerate(a):
        acc = alpha * v + (1 - alpha) * acc
        out[i] = acc
    return out


def zscore_last(y) -> float:
    """Z-score of the most recent point vs the series' own history."""
    a = _clean(y)
    if a.size < 5:
        return 0.0
    sd = a.std(ddof=1)
    return float((a[-1] - a.mean()) / sd) if sd else 0.0


def logistic(x: float, k: float = 0.85) -> float:
    return 1.0 / (1.0 + np.exp(-k * x))


# ---- cross-sectional standardization (dict[key] -> value) ----

def winsorize(vals: np.ndarray, p: float = 0.02) -> np.ndarray:
    if vals.size < 5:
        return vals
    lo, hi = np.quantile(vals, [p, 1 - p])
    return np.clip(vals, lo, hi)


def cross_z(values: dict, p: float = 0.02) -> dict:
    """Winsorized z-score of each key's value across the universe. None-safe."""
    items = [(k, v) for k, v in values.items() if v is not None and np.isfinite(v)]
    if len(items) < 5:
        return {}
    keys = [k for k, _ in items]
    w = winsorize(np.asarray([v for _, v in items], dtype=float), p)
    m, sd = w.mean(), w.std(ddof=1)
    sd = sd or 1.0
    return {k: float((v - m) / sd) for k, v in zip(keys, w)}


def percentile_rank(values: dict) -> dict:
    """Map each key's value to its 0-100 percentile across the universe."""
    items = [(k, v) for k, v in values.items() if v is not None and np.isfinite(v)]
    if not items:
        return {}
    keys = [k for k, _ in items]
    arr = np.asarray([v for _, v in items], dtype=float)
    ranks = stats.rankdata(arr, method="average")
    pr = (ranks - 1) / max(1, len(arr) - 1) * 100
    return {k: float(round(v, 1)) for k, v in zip(keys, pr)}
