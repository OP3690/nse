#!/usr/bin/env python3
"""End-to-end daily run: download latest session -> ingest -> analyze -> emit JSON.

Run manually after market close, or schedule it (see scripts/run.sh + crontab).
Idempotent: re-running the same day just overwrites cleanly.
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import analyze
import sectors
from download import RAW, download_latest, download_for_date
from ingest import ingest_dir
from nse_client import NSEClient

ROOT = Path(__file__).resolve().parent


def _refresh_shareholding(session_date: dt.date, limit: int = 250) -> None:
    """Top-up quarterly shareholding once a week (Fridays), best-effort.

    Quarterly filings change only ~4×/year, so a weekly pass over the most
    liquid names — gated by `refresh-days` so fresh symbols are skipped — keeps
    the per-stock ownership-flow section current without hammering NSE daily.
    Never fatal: a failure here must not break the daily price/flow run.
    """
    if session_date.weekday() != 4:  # Friday only
        return
    try:
        import shareholding
        import store
        from backfill_shareholding import _already_fresh, _universe
        con = store.connect()
        client = NSEClient()
        syms = _universe(con, limit)
        ok = 0
        for sym in syms:
            if _already_fresh(con, sym, refresh_days=80):
                continue
            try:
                recs = shareholding.build_for_symbol(client, sym)
            except Exception:  # noqa: BLE001
                recs = []
            if recs:
                store.store_shareholding(con, recs)
                con.commit()
                ok += 1
        con.close()
        print(f"  shareholding weekly refresh: updated {ok} symbols")
    except Exception as e:  # noqa: BLE001
        print(f"  shareholding refresh skipped: {e!r}")


def _refresh_bse_marketcap(session_date: dt.date) -> None:
    """Attach BSE market cap to the NSE universe, best-effort.

    One BSE scrip-master call gives full market cap (₹ Cr) for ~94% of the
    symbols we track, joined by ISIN — cheap, so we do it every run. Free-float
    market cap needs a per-scrip fetch, so we only top that up weekly (Fridays)
    over the index-member subset where it's index-weight-relevant. Never fatal.
    """
    try:
        import bse
        import store
        ff_limit = 600 if session_date.weekday() == 4 else 0  # free-float on Fridays
        con = store.connect()
        summary = bse.fetch_and_store(con, NSEClient(), ff_limit=ff_limit)
        con.close()
        print(f"  BSE market cap: matched {summary.get('matched', 0)} "
              f"of {summary.get('master', 0)} scrips, free-float {summary.get('ff', 0)}")
    except Exception as e:  # noqa: BLE001
        print(f"  BSE market cap refresh skipped: {e!r}")


def main(date_str: str | None = None):
    print(f"=== NSE Flow daily run @ {dt.datetime.now():%Y-%m-%d %H:%M} ===")

    # Refresh the symbol->sector map (cached weekly internally).
    sectors.ensure_cache(NSEClient())

    if date_str:
        target = dt.date.fromisoformat(date_str)
        manifest = download_for_date(target)
        raw_dir = RAW / target.strftime("%Y%m%d") if manifest else None
    else:
        manifest = download_latest()
        raw_dir = RAW / manifest["iso"] if manifest else None

    if not manifest:
        print("No new session data available. Nothing to do.")
        return 1

    ingest_dir(raw_dir)
    session_date = dt.date.fromisoformat(manifest["iso"]) if manifest.get("iso") else dt.date.today()
    _refresh_shareholding(session_date)
    _refresh_bse_marketcap(session_date)
    analyze.run()
    print("=== done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else None))
