"""Backfill FII Derivatives Statistics history from NSE.

Cash FII/DII has no NSE history (latest-only), but FII *derivatives* stats are
date-addressed: nsearchives.../content/fo/fii_stats_DD-Mon-YYYY.xls. We walk
back N calendar days, skip weekends/holidays (missing file), and store each
day's per-category FII buy/sell/OI net.

Run:  python3 backfill_fii.py [days]   (default 366)
"""
from __future__ import annotations

import datetime as dt
import sys

import parse
import store
from download import is_weekend
from nse_client import NSEClient


def backfill_fii_deriv(days: int = 366):
    client = NSEClient()
    con = store.connect()
    have = {r["date"] for r in con.execute("SELECT DISTINCT date FROM fii_deriv_daily")}
    today = dt.date.today()
    fetched = miss = 0
    d = today
    while (today - d).days <= days:
        if is_weekend(d) or d.isoformat() in have:
            d -= dt.timedelta(days=1)
            continue
        dmon = d.strftime("%d-%b-%Y")  # 04-Jun-2026
        data = client.fii_deriv(dmon)
        if not data:
            miss += 1
            d -= dt.timedelta(days=1)
            continue
        parsed = parse.parse_fii_deriv(data)
        if parsed:
            n = store.store_fii_deriv(con, parsed)
            con.commit()
            fetched += 1
            if fetched % 20 == 0:
                print(f"  ... {fetched} days stored (at {d.isoformat()})")
        d -= dt.timedelta(days=1)
    con.close()
    print(f"FII derivatives backfill complete: {fetched} sessions stored, "
          f"{miss} dates missing (holidays/unpublished).")


def backfill_cat_turnover(days: int = 400):
    """Backfill reconciled NSDL cash data from NSE's date-addressed Category-wise
    Turnover .xls: daily FPI (confirmed cash FII) per session, plus the monthly
    DII history (back to Jan 2021) which rides along in every file's historical
    sheet. Walks back N calendar days, skipping weekends/holidays/already-have."""
    client = NSEClient()
    con = store.connect()
    have = {r["date"] for r in con.execute("SELECT date FROM cat_fpi_daily")}
    today = dt.date.today()
    fetched = miss = months_seeded = 0
    d = today
    while (today - d).days <= days:
        if is_weekend(d) or d.isoformat() in have:
            d -= dt.timedelta(days=1)
            continue
        data = client.cat_turnover(d.strftime("%d%m%y"))
        if not data:
            miss += 1
            d -= dt.timedelta(days=1)
            continue
        parsed = parse.parse_cat_turnover(data)
        if parsed:
            # Seed the multi-year monthly DII once (it's identical in every file).
            if months_seeded == 0 and parsed.get("dii_monthly"):
                months_seeded = store.store_cat_turnover(con, parsed)
            elif parsed.get("fpi"):
                store.store_cat_turnover(con, {"date": parsed["date"], "fpi": parsed["fpi"]})
            con.commit()
            fetched += 1
            if fetched % 20 == 0:
                print(f"  ... {fetched} FPI sessions stored (at {d.isoformat()})")
        d -= dt.timedelta(days=1)
    con.close()
    print(f"Cat-turnover backfill complete: {fetched} FPI sessions, "
          f"{months_seeded} DII months seeded, {miss} dates missing.")


def backfill_cash_fiidii():
    """Seed recent cash FII/DII from Moneycontrol (~30 sessions). Cash has no NSE
    history, so this fills the recent window; daily runs extend it forward."""
    client = NSEClient()
    con = store.connect()
    try:
        rows = parse.parse_mc_fiidii(client.mc_fiidii_cash())
    except Exception as e:  # noqa: BLE001
        print(f"  cash FII/DII: {e}")
        con.close()
        return
    n = store.store_fiidii(con, rows)
    con.commit()
    con.close()
    dates = sorted({r["date"] for r in rows})
    print(f"Cash FII/DII seeded: {n} rows across {len(dates)} sessions "
          f"({dates[0] if dates else '?'} -> {dates[-1] if dates else '?'}).")


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "366"
    if arg == "cash":
        backfill_cash_fiidii()
    elif arg == "cat":
        backfill_cat_turnover(int(sys.argv[2]) if len(sys.argv) > 2 else 400)
    else:
        backfill_fii_deriv(int(arg))
        backfill_cash_fiidii()
        backfill_cat_turnover()
