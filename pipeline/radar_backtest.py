"""Backtest the KNN Multibagger Radar's live-published picks against real
forward prices, benchmarked to the NIFTY 50 over the same holding window.

The pick log is the model's own history: every daily top-3 pick, read from the
archived Mongo snapshots (falling back to the local processed/*.json when Mongo
is unavailable). Forward returns come from each symbol's own continuous close
series in delivery_daily, so an N-day horizon is N real trading days regardless
of any gap in when the pipeline ran. For each pick we also compute the NIFTY 50
return over the identical calendar window, so "excess" answers the only question
that matters: did the pick beat simply holding the index?
"""
from __future__ import annotations

import json
import os
import statistics as st
from pathlib import Path

import mongo

ROOT = Path(__file__).resolve().parent
PROCESSED = ROOT / "data" / "processed"

HORIZONS = [1, 2, 3, 5, 15, 30]
# fields we keep from each stored pick
PICK_FIELDS = ("symbol", "company", "sector", "close", "prob", "lift",
               "median_analog_move", "neighbors_up", "neighbors_total", "score")


def _pick_log(today_date=None, today_picks=None):
    """date -> [pick,...] for every session the model published picks."""
    log = {}
    client = mongo.get_client()
    if client is not None:
        try:
            db = client[os.environ.get("MONGODB_DB", "nseflow")]
            for doc in db.snapshots.find({}, {"multibaggers.picks": 1}):
                picks = (doc.get("multibaggers") or {}).get("picks") or []
                if picks:
                    log[doc["_id"]] = picks
        finally:
            client.close()
    else:  # local dev: reconstruct from the processed archive
        for f in sorted(PROCESSED.glob("*.json")):
            try:
                d = json.loads(f.read_text())
            except Exception:  # noqa: BLE001
                continue
            picks = (d.get("multibaggers") or {}).get("picks") or []
            if picks:
                log[d["date"]] = picks
    if today_date and today_picks:
        log[today_date] = today_picks  # include today's fresh picks (no fwd data yet)
    return log


def _close_series(con, symbols):
    """symbol -> ordered [(date, close), ...] from delivery_daily."""
    ser = {}
    q = ("SELECT date, symbol, close FROM delivery_daily "
         "WHERE symbol IN (%s) AND close IS NOT NULL ORDER BY date" % ",".join("?" * len(symbols)))
    for date, sym, close in con.execute(q, tuple(symbols)):
        ser.setdefault(sym, []).append((date, close))
    return ser


def _nifty_map(con):
    return {d: v for d, v in con.execute(
        "SELECT date, last FROM indices_daily WHERE [index]='NIFTY 50' AND last IS NOT NULL")}


def build(con, today_date=None, today_picks=None):
    log = _pick_log(today_date, today_picks)
    if not log:
        return {"ok": False, "reason": "no pick history available"}

    symbols = sorted({p["symbol"] for picks in log.values() for p in picks})
    series = _close_series(con, symbols)
    nifty = _nifty_map(con)

    rows = []
    for date in sorted(log):
        for p in log[date]:
            sym = p["symbol"]
            r = {k: p.get(k) for k in PICK_FIELDS}
            r["date"] = date
            r["agree"] = (round(100 * p["neighbors_up"] / p["neighbors_total"], 1)
                          if p.get("neighbors_total") else None)
            ser = series.get(sym) or []
            dates = [d for d, _ in ser]
            i = dates.index(date) if date in dates else None
            for k in HORIZONS:
                sr = br = None
                if i is not None and i + k < len(ser) and ser[i][1]:
                    fwd_date = ser[i + k][0]
                    sr = round((ser[i + k][1] / ser[i][1] - 1) * 100, 2)
                    if date in nifty and fwd_date in nifty and nifty[date]:
                        br = round((nifty[fwd_date] / nifty[date] - 1) * 100, 2)
                r[f"d{k}"] = sr
                r[f"b{k}"] = br
            # tidy: drop the raw neighbor counts now that agree% is derived
            r.pop("neighbors_up", None)
            r.pop("neighbors_total", None)
            rows.append(r)

    def agg(k):
        vals = [(r[f"d{k}"], r[f"b{k}"]) for r in rows if r[f"d{k}"] is not None]
        if not vals:
            return None
        s = [v for v, _ in vals]
        bench = [(v, b) for v, b in vals if b is not None]
        exc = [v - b for v, b in bench]
        return {
            "n": len(s),
            "hit": round(100 * sum(1 for v in s if v > 0) / len(s), 1),
            "avg": round(st.mean(s), 2),
            "median": round(st.median(s), 2),
            "avg_win": round(st.mean([v for v in s if v > 0] or [0]), 2),
            "avg_loss": round(st.mean([v for v in s if v <= 0] or [0]), 2),
            "best": round(max(s), 2),
            "worst": round(min(s), 2),
            "n_bench": len(bench),
            "avg_nifty": round(st.mean([b for _, b in bench]), 2) if bench else None,
            "avg_excess": round(st.mean(exc), 2) if exc else None,
            "beat": round(100 * sum(1 for e in exc if e > 0) / len(exc), 1) if exc else None,
        }

    def rank_ic(retkey):
        pairs = [(r["prob"], r[retkey]) for r in rows if r.get("prob") is not None and r.get(retkey) is not None]
        if len(pairs) < 10:
            return None
        xs, ys = [a for a, _ in pairs], [b for _, b in pairs]

        def ranks(z):
            order = sorted(range(len(z)), key=lambda i: z[i])
            rk = [0] * len(z)
            for pos, i in enumerate(order):
                rk[i] = pos
            return rk
        rx, ry, n = ranks(xs), ranks(ys), len(pairs)
        mx, my = sum(rx) / n, sum(ry) / n
        num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
        den = (sum((v - mx) ** 2 for v in rx) * sum((v - my) ** 2 for v in ry)) ** 0.5
        return round(num / den, 3) if den else None

    summary = {f"d{k}": agg(k) for k in HORIZONS}
    dates = sorted(log)
    meta = {
        "ok": True,
        "horizons": HORIZONS,
        "total_predictions": len(rows),
        "unique_stocks": len(symbols),
        "sessions": len(log),
        "date_from": dates[0],
        "date_to": dates[-1],
        "benchmark": "NIFTY 50",
        "ic_prob_vs_15d": rank_ic("d15"),
        "ic_prob_vs_30d": rank_ic("d30"),
        "generated_for": today_date or dates[-1],
    }
    return {"meta": meta, "summary": summary, "rows": rows}
