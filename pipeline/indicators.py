"""Pure-Python technical indicators. No numpy/pandas dependency.

All functions take a list of floats (oldest -> newest) and return either a
scalar (latest value) or a list aligned to the input. None-safe where noted.
"""
from __future__ import annotations

import math


def _clean(series):
    return [x for x in series if x is not None]


def sma(series, n):
    s = _clean(series)
    if len(s) < n:
        return None
    return sum(s[-n:]) / n


def ema_series(series, n):
    s = _clean(series)
    if len(s) < n:
        return []
    k = 2 / (n + 1)
    out = [sum(s[:n]) / n]  # seed with SMA
    for x in s[n:]:
        out.append(x * k + out[-1] * (1 - k))
    return out


def ema(series, n):
    e = ema_series(series, n)
    return e[-1] if e else None


def rsi(closes, n=14):
    s = _clean(closes)
    if len(s) < n + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(s)):
        d = s[i] - s[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    # Wilder's smoothing
    avg_g = sum(gains[:n]) / n
    avg_l = sum(losses[:n]) / n
    for i in range(n, len(gains)):
        avg_g = (avg_g * (n - 1) + gains[i]) / n
        avg_l = (avg_l * (n - 1) + losses[i]) / n
    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return 100 - (100 / (1 + rs))


def macd(closes, fast=12, slow=26, signal=9):
    """Returns (macd_line, signal_line, histogram) latest values, or Nones."""
    s = _clean(closes)
    if len(s) < slow + signal:
        return None, None, None
    ef = ema_series(s, fast)
    es = ema_series(s, slow)
    # align tails
    m = min(len(ef), len(es))
    macd_line = [ef[-m + i] - es[-m + i] for i in range(m)]
    sig = ema_series(macd_line, signal)
    if not sig:
        return None, None, None
    return macd_line[-1], sig[-1], macd_line[-1] - sig[-1]


def linreg(values):
    """Least-squares fit over index 0..n-1. Returns dict with slope, intercept,
    r2, and slope_pct (slope as % of mean value per step). None-safe input."""
    s = _clean(values)
    n = len(s)
    if n < 3:
        return None
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(s) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((xs[i] - mx) * (s[i] - my) for i in range(n))
    if sxx == 0:
        return None
    slope = sxy / sxx
    intercept = my - slope * mx
    # r^2
    ss_tot = sum((y - my) ** 2 for y in s)
    ss_res = sum((s[i] - (slope * xs[i] + intercept)) ** 2 for i in range(n))
    r2 = 1 - ss_res / ss_tot if ss_tot else 0.0
    slope_pct = (slope / my * 100) if my else 0.0
    return {"slope": slope, "intercept": intercept, "r2": max(0.0, r2),
            "slope_pct": slope_pct, "n": n,
            "line": [slope * x + intercept for x in xs]}


def pct_position(value, low, high):
    """Where `value` sits in [low, high] as 0..100. None-safe."""
    if value is None or low is None or high is None or high <= low:
        return None
    return max(0.0, min(100.0, (value - low) / (high - low) * 100))
