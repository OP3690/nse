"""Live headline-index quotes (Nifty 50 / Sensex / India VIX) for the dashboard.

The dashboard hero normally shows the EOD snapshot stamped by the daily run.
This helper fetches the *current* quotes on demand — Nifty 50 and India VIX from
NSE's own allIndices feed (exchange-authoritative), Sensex from Yahoo ^BSESN
(NSE doesn't carry it) — and shapes them exactly like analyze.headline_indices
so the web `/api/indices` route can serve always-current values.

Run standalone to print the JSON array:
    /usr/bin/python3 live_indices.py
"""
from __future__ import annotations

import json
import sys

from analyze import headline_indices
from nse_client import NSEClient


def quotes() -> list[dict]:
    """Return the live headline-index tiles, or [] on any failure."""
    client = NSEClient()
    rows: list[dict] = []
    try:
        for r in client.all_indices():
            name = (r.get("index") or r.get("indexSymbol") or "").upper()
            if name in ("NIFTY 50", "INDIA VIX"):
                rows.append({"index": name, "last": r.get("last"),
                             "pct": r.get("percentChange")})
    except Exception:  # noqa: BLE001
        pass
    try:
        sx = client.bse_sensex()
        if sx:
            rows.append({"index": "SENSEX", "last": sx["last"], "pct": sx["pct"]})
    except Exception:  # noqa: BLE001
        pass
    return headline_indices(rows)


if __name__ == "__main__":
    try:
        print(json.dumps(quotes()))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": repr(e)}))
        sys.exit(1)
