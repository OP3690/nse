#!/usr/bin/env python3
"""Fast incremental refresh — for the 6-hourly updater and the in-app Sync button.

Unlike run_daily.py (a full fetch), this is optimised for speed:

  * Only the last few trading sessions are considered (LOOKBACK, default 3).
  * Historical bhavcopies never change, so a session already on disk is NOT
    re-downloaded — we skip straight past it.
  * The newest session is always re-pulled in *light* mode so the live snapshots
    (index/VIX levels, FII/DII) stay current and any just-published bhavcopy is
    picked up; the slow master/list fetches (equity master, index membership,
    IPO list, 30-session Moneycontrol backfill) are skipped — they don't change
    intraday and are already in the DB from the last full daily run.
  * analyze.run() then recomputes every signal — including the KNN Multibagger
    Radar — and emits latest.json + syncs MongoDB.

Idempotent and safe to run repeatedly.
"""
from __future__ import annotations

import datetime as dt
import sys

import analyze
import sectors
from download import (RAW, download_for_date, download_latest, is_weekend,
                      latest_trading_date)
from ingest import ingest_dir
from nse_client import NSEClient

LOOKBACK = 3  # trading sessions to keep fresh


def recent_trading_dates(n: int = LOOKBACK) -> list[dt.date]:
    """The n most recent weekday (trading) dates, newest first."""
    out: list[dt.date] = []
    d = latest_trading_date()
    while len(out) < n:
        if not is_weekend(d):
            out.append(d)
        d -= dt.timedelta(days=1)
    return out


def fast_refresh(lookback: int = LOOKBACK) -> int:
    print(f"=== NSE Flow fast refresh @ {dt.datetime.now():%Y-%m-%d %H:%M} ===")
    client = NSEClient()

    # Symbol -> sector map (internally cached weekly; cheap no-op most runs).
    sectors.ensure_cache(client)

    # 1) Newest available session — always pulled (light) to refresh live
    #    snapshots + catch a freshly published bhavcopy. Walks back over holidays.
    manifest = download_latest(light=True)
    newest_iso = manifest["iso"] if manifest else None
    if manifest:
        ingest_dir(RAW / newest_iso)

    # 2) Backfill any of the prior sessions that are missing on disk. Already-present
    #    sessions are immutable history — skipped without a network call.
    for d in recent_trading_dates(lookback):
        iso = d.strftime("%Y%m%d")
        if iso == newest_iso:
            continue
        if (RAW / iso / "delivery.csv").exists():
            continue  # already have this session — never refetch history
        m = download_for_date(d, light=True)
        if m:
            ingest_dir(RAW / m["iso"])

    # 3) Recompute all signals (incl. KNN Multibagger Radar) + emit JSON + Mongo sync.
    analyze.run()
    print("=== refresh done ===")
    return 0


if __name__ == "__main__":
    sys.exit(fast_refresh())
