"""Symbol -> Industry (sector) map, sourced from the NSE Nifty 500 list.
Cached locally and refreshed weekly. Symbols outside Nifty 500 map to None."""
from __future__ import annotations

import csv
import time
from pathlib import Path

from nse_client import NIFTY500_LIST, NSEClient

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "data" / "sectors.csv"
MAX_AGE = 7 * 24 * 3600  # refresh weekly


def ensure_cache(client: NSEClient | None = None) -> Path:
    fresh = CACHE.exists() and (time.time() - CACHE.stat().st_mtime) < MAX_AGE
    if not fresh:
        client = client or NSEClient()
        try:
            data = client.get_bytes(NIFTY500_LIST)
            if len(data) > 500:
                CACHE.write_bytes(data)
        except Exception as e:  # noqa: BLE001
            if not CACHE.exists():
                print(f"  ! sector map unavailable: {e}")
    return CACHE


def load_map(client: NSEClient | None = None) -> dict[str, str]:
    ensure_cache(client)
    mapping: dict[str, str] = {}
    if not CACHE.exists():
        return mapping
    with open(CACHE, newline="") as fh:
        for r in csv.DictReader(fh):
            sym = (r.get("Symbol") or "").strip()
            ind = (r.get("Industry") or "").strip()
            if sym and ind:
                mapping[sym] = ind
    return mapping
