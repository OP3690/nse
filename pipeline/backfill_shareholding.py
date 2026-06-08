"""Backfill / refresh quarterly shareholding (Promoter / FII / DII / Public).

Quarterly data changes only ~4×/year, so this runs occasionally (a weekly cron
or manual top-up), not every daily run. Symbols are processed most-liquid-first
so the names most likely to be clicked from "Where Money Is Flowing" land first.

Usage:
    python backfill_shareholding.py [--limit N] [--symbols SYM,SYM] [--quarters Q]
                                    [--refresh-days D]
"""
from __future__ import annotations

import argparse
import time

import shareholding
import store
from nse_client import NSEClient


def _universe(con, limit: int) -> list[str]:
    """Most-liquid EQ symbols by latest-session turnover."""
    row = con.execute("SELECT MAX(date) d FROM delivery_daily").fetchone()
    if not row or not row["d"]:
        return []
    cur = con.execute(
        "SELECT symbol FROM delivery_daily WHERE date = ? AND series = 'EQ' "
        "ORDER BY turnover_lacs DESC", (row["d"],))
    syms = [r["symbol"] for r in cur]
    return syms[:limit] if limit else syms


def _already_fresh(con, symbol: str, refresh_days: int) -> bool:
    """True if we already have a recent quarter for this symbol (skip re-fetch)."""
    if refresh_days <= 0:
        return False
    r = con.execute(
        "SELECT MAX(date) d FROM shareholding_quarterly WHERE symbol = ?", (symbol,)).fetchone()
    if not r or not r["d"]:
        return False
    import datetime as dt
    try:
        age = (dt.date.today() - dt.date.fromisoformat(r["d"])).days
    except ValueError:
        return False
    return age < refresh_days


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=300, help="max symbols (0 = all)")
    ap.add_argument("--symbols", type=str, default="", help="explicit comma list (overrides universe)")
    ap.add_argument("--quarters", type=int, default=5, help="recent quarters per symbol")
    ap.add_argument("--refresh-days", type=int, default=80,
                    help="skip symbols whose newest quarter is younger than this")
    args = ap.parse_args()

    con = store.connect()
    client = NSEClient()
    if args.symbols:
        syms = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    else:
        syms = _universe(con, args.limit)
    print(f"shareholding backfill: {len(syms)} symbols, {args.quarters} quarters each")

    ok = miss = skip = 0
    for i, sym in enumerate(syms, 1):
        if not args.symbols and _already_fresh(con, sym, args.refresh_days):
            skip += 1
            continue
        try:
            recs = shareholding.build_for_symbol(client, sym, quarters=args.quarters)
        except Exception as e:  # noqa: BLE001
            print(f"  ! {sym}: {e!r}")
            recs = []
        if recs:
            store.store_shareholding(con, recs)
            con.commit()
            ok += 1
        else:
            miss += 1
        if i % 25 == 0:
            print(f"  [{i}/{len(syms)}] ok={ok} miss={miss} skip={skip}  (last {sym})")
        time.sleep(0.3)
    con.close()
    print(f"done: stored={ok} missing={miss} skipped={skip}")


if __name__ == "__main__":
    main()
