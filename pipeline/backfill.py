"""Seed history. Delivery and F&O bhavcopies are date-addressed, so we fetch
the last N weekdays of those. Bulk/block (and the FII/DII API) are rolling
files that already span ~2 weeks, so we ingest them once from the latest day.

Run once after setup:  python3 backfill.py [days]
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import ingest
import parse
import store
from download import RAW, fmts, is_weekend
from nse_client import NSEClient


def _save_manifest(out_dir: Path, d: dt.date, files: dict):
    (out_dir / "manifest.json").write_text(json.dumps(
        {"date": d.isoformat(), "iso": d.strftime("%Y%m%d"), "files": files}, indent=2))


def backfill(days: int = 20):
    client = NSEClient()
    today = dt.date.today()
    fetched = 0
    # Dates already stored — skip them so re-running only fills gaps (idempotent).
    con0 = store.connect()
    have = {r["date"] for r in con0.execute("SELECT DISTINCT date FROM delivery_daily")}
    con0.close()
    # Walk back far enough in calendar days to cover `days` weekdays + holidays.
    d = today
    while fetched < days and (today - d).days < days * 2 + 10:
        if is_weekend(d):
            d -= dt.timedelta(days=1)
            continue
        if d.isoformat() in have:
            fetched += 1
            d -= dt.timedelta(days=1)
            continue
        ddmmyyyy, iso = fmts(d)
        out_dir = RAW / iso
        out_dir.mkdir(parents=True, exist_ok=True)
        delivery = client.download_report("delivery", out_dir, ddmmyyyy, iso)
        if not delivery:  # holiday or not yet published
            d -= dt.timedelta(days=1)
            continue
        files = {"delivery": delivery.name}
        fo = client.download_report("fo", out_dir, ddmmyyyy, iso)
        if fo:
            files["fo"] = fo.name
        _save_manifest(out_dir, d, files)

        con = store.connect()
        store.store_delivery(con, parse.parse_delivery(out_dir / "delivery.csv"), d.isoformat())
        if fo:
            store.store_fo(con, parse.parse_fo(out_dir / "fo.zip"), d.isoformat())
        con.commit()
        con.close()
        print(f"  backfilled {d.isoformat()}")
        fetched += 1
        d -= dt.timedelta(days=1)

    # Ingest the rolling deal files once (each spans ~2 weeks internally and is
    # keyed by each row's own date). FII/DII API returns only the latest day.
    print("Ingesting rolling bulk/block/FII-DII ...")
    from nse_client import ENDPOINTS, FIIDII_API
    con = store.connect()
    for kind, storer in (("bulk", store.store_bulk), ("block", store.store_block)):
        try:
            data = client.get_bytes(ENDPOINTS[kind])
            tmp = RAW / f"_{kind}.csv"
            tmp.write_bytes(data)
            print(f"  {kind}: {storer(con, parse._parse_deals(tmp))} rows")
        except Exception as e:  # noqa: BLE001
            print(f"  {kind}: {e}")
    try:
        fii = client.fiidii()
        print(f"  fiidii: {store.store_fiidii(con, parse.parse_fiidii_data(fii), None)} rows")
    except Exception as e:  # noqa: BLE001
        print(f"  fiidii: {e}")
    con.commit()
    con.close()
    print(f"Backfill complete: {fetched} sessions of delivery/F&O history.")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    backfill(n)
