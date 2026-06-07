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
    analyze.run()
    print("=== done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else None))
