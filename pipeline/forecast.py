"""Trend-forecast engine.

Turns ~3 months of per-stock history into a directional-bias score in
[-100, +100] with a confidence and transparent reasons. This is trend/momentum
*continuation* probability — NOT a price prediction. Every input is an
explainable technical or order-flow signal.
"""
from __future__ import annotations

import indicators as ind

# Sector indices we surface for rotation (from the allIndices snapshot).
SECTOR_INDICES = {
    "NIFTY BANK", "NIFTY IT", "NIFTY AUTO", "NIFTY FMCG", "NIFTY PHARMA",
    "NIFTY METAL", "NIFTY REALTY", "NIFTY ENERGY", "NIFTY FIN SERVICE",
    "NIFTY MEDIA", "NIFTY PSU BANK", "NIFTY PVT BANK", "NIFTY HEALTHCARE INDEX",
    "NIFTY CONSUMER DURABLES", "NIFTY OIL & GAS", "NIFTY INFRA", "NIFTY COMMODITIES",
}


def _clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


def _label(score):
    if score >= 50:
        return "Strong Uptrend"
    if score >= 20:
        return "Uptrend"
    if score <= -50:
        return "Strong Downtrend"
    if score <= -20:
        return "Downtrend"
    return "Sideways"


def forecast_symbol(history: list[dict], wk_high=None, wk_low=None) -> dict | None:
    """history: oldest->newest rows with keys close, deliv, volume, oi."""
    closes = [h.get("close") for h in history]
    if len([c for c in closes if c is not None]) < 25:
        return None
    delivs = [h.get("deliv") for h in history]
    vols = [h.get("volume") for h in history]
    ois = [h.get("oi") for h in history]
    last = closes[-1]

    sma20 = ind.sma(closes, 20)
    sma50 = ind.sma(closes, 50)
    rsi = ind.rsi(closes, 14)
    _, _, macd_h = ind.macd(closes)
    reg20 = ind.linreg(closes[-20:])
    reg60 = ind.linreg(closes[-60:])
    dreg = ind.linreg(delivs[-20:])
    vreg = ind.linreg(vols[-20:])
    oi_first, oi_last = next((x for x in ois if x is not None), None), \
        next((x for x in reversed(ois) if x is not None), None)
    wk_pos = ind.pct_position(last, wk_low, wk_high)

    # --- signed sub-signals in [-1, 1] with weights ---
    parts = []  # (key, value, weight)
    bull, bear = [], []

    if reg20:
        v = _clamp(reg20["slope_pct"] * 8)
        parts.append(("trend20", v, 0.25))
        if v > 0.2:
            bull.append(f"Rising 20-day trend ({reg20['slope_pct']:+.2f}%/day)")
        elif v < -0.2:
            bear.append(f"Falling 20-day trend ({reg20['slope_pct']:+.2f}%/day)")
    if reg60:
        parts.append(("trend60", _clamp(reg60["slope_pct"] * 6), 0.15))

    if sma20 and sma50 and last:
        a = (1 if last > sma20 else -1) * 0.5 + (1 if sma20 > sma50 else -1) * 0.5
        parts.append(("ma_align", a, 0.15))
        if a >= 1:
            bull.append("Price above rising 20 & 50 DMA")
        elif a <= -1:
            bear.append("Price below falling 20 & 50 DMA")

    if macd_h is not None:
        parts.append(("macd", _clamp(macd_h / (abs(last) * 0.02 + 1e-9)), 0.10))
        if macd_h > 0:
            bull.append("MACD positive (momentum up)")
        else:
            bear.append("MACD negative (momentum down)")

    if rsi is not None:
        # bullish 50-70; >75 overbought (slight fade); <30 oversold
        r = (rsi - 50) / 50
        if rsi > 78:
            r *= 0.5
        parts.append(("rsi", _clamp(r), 0.10))
        if 55 <= rsi <= 78:
            bull.append(f"RSI {rsi:.0f} — bullish momentum")
        elif rsi < 35:
            bear.append(f"RSI {rsi:.0f} — weak/oversold")

    if dreg:
        v = _clamp(dreg["slope_pct"] * 4)
        parts.append(("deliv_trend", v, 0.10))
        if v > 0.15:
            bull.append("Delivery % trending up (accumulation)")
        elif v < -0.15:
            bear.append("Delivery % trending down (distribution)")

    if oi_first is not None and oi_last is not None and reg20:
        oi_up = oi_last > oi_first
        price_up = reg20["slope_pct"] > 0
        if oi_up and price_up:
            parts.append(("oi", 1.0, 0.075)); bull.append("Long buildup in F&O (OI↑, price↑)")
        elif oi_up and not price_up:
            parts.append(("oi", -1.0, 0.075)); bear.append("Short buildup in F&O (OI↑, price↓)")
        elif not oi_up and price_up:
            parts.append(("oi", 0.5, 0.075))
        else:
            parts.append(("oi", -0.5, 0.075))

    if wk_pos is not None:
        parts.append(("wk52", _clamp((wk_pos - 50) / 50), 0.075))
        if wk_pos >= 85:
            bull.append(f"Near 52-week high ({wk_pos:.0f}% of range) — breakout zone")
        elif wk_pos <= 15:
            bear.append(f"Near 52-week low ({wk_pos:.0f}% of range)")

    if not parts:
        return None
    wsum = sum(w for _, _, w in parts)
    raw = sum(v * w for _, v, w in parts) / wsum
    score = round(raw * 100, 1)

    # confidence: trend cleanliness (r2) + signal agreement + data sufficiency
    r2 = reg20["r2"] if reg20 else 0.0
    sign = 1 if score >= 0 else -1
    agree = sum(1 for _, v, _ in parts if (v > 0) == (sign > 0) and v != 0)
    agreement = agree / len(parts)
    data_factor = min(1.0, len([c for c in closes if c is not None]) / 45)
    confidence = round((r2 * 0.55 + agreement * 0.45) * data_factor * 100, 0)

    # straight trendline over the charted window (last up to 60 pts)
    window = history[-60:]
    reg = ind.linreg([h.get("close") for h in window])
    trendline = None
    if reg and reg["line"]:
        dated = [h for h in window if h.get("close") is not None]
        if len(dated) >= 2:
            trendline = [
                {"date": dated[0]["date"], "value": round(reg["line"][0], 2)},
                {"date": dated[-1]["date"], "value": round(reg["line"][-1], 2)},
            ]

    return {
        "trend_score": score,
        "trend_label": _label(score),
        "confidence": confidence,
        "rsi": round(rsi, 1) if rsi is not None else None,
        "sma20": round(sma20, 2) if sma20 else None,
        "sma50": round(sma50, 2) if sma50 else None,
        "slope20_pct": round(reg20["slope_pct"], 3) if reg20 else None,
        "trend_r2": round(r2, 2),
        "wk52_pos": round(wk_pos, 0) if wk_pos is not None else None,
        "reasons_bull": bull[:5],
        "reasons_bear": bear[:5],
        "trendline": trendline,
    }


def market_regime(index_rows: list[dict]) -> dict:
    by = {r["index"]: r for r in index_rows}
    nifty = by.get("NIFTY 50", {})
    vix = by.get("INDIA VIX", {})
    pos = ind.pct_position(nifty.get("last"), nifty.get("year_low"), nifty.get("year_high"))
    p30 = nifty.get("pchg30d")
    v = vix.get("last")

    risk_on = (p30 or 0) > 1.5 and (v or 99) < 16 and (pos or 0) > 58
    risk_off = (p30 or 0) < -1.5 or (v or 0) > 20 or (pos or 100) < 35
    label = "Risk-On" if risk_on else "Risk-Off" if risk_off else "Neutral"
    note = {
        "Risk-On": "Broad uptrend with low volatility — trend-following favoured.",
        "Risk-Off": "Weak breadth or elevated volatility — be selective, tighten stops.",
        "Neutral": "Mixed regime — favour high-confidence setups only.",
    }[label]
    return {
        "label": label, "note": note,
        "nifty_last": nifty.get("last"), "nifty_pchg30d": p30,
        "nifty_52w_pos": round(pos, 0) if pos is not None else None,
        "vix": v,
    }


def sector_trends(index_rows: list[dict]) -> list[dict]:
    out = []
    for r in index_rows:
        if r["index"] in SECTOR_INDICES:
            out.append({
                "sector": r["index"].replace("NIFTY ", "").title(),
                "index": r["index"],
                "pct": r.get("pct"),
                "pchg30d": r.get("pchg30d"),
                "pchg365d": r.get("pchg365d"),
            })
    out.sort(key=lambda x: (x["pchg30d"] is None, -(x["pchg30d"] or 0)))
    return out
