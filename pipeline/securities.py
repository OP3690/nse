"""Symbol -> company-name master from NSE's EQUITY_L.csv.

A tiny ingest: the equity master lists every listed symbol with its full company
name, series and ISIN. We keep it fresh each run so the UI can show the actual
company name on hover (e.g. RELIANCE -> "Reliance Industries Limited").
"""
from __future__ import annotations

import csv
import io


def parse_master(text: str) -> list[dict]:
    """Parse EQUITY_L.csv text into [{symbol, company, series, isin}]."""
    rows = []
    reader = csv.DictReader(io.StringIO(text))
    # NSE's header has leading spaces on some columns ("NAME OF COMPANY", " SERIES").
    keymap = {k.strip().upper(): k for k in (reader.fieldnames or [])}
    sym_k = keymap.get("SYMBOL")
    name_k = keymap.get("NAME OF COMPANY")
    ser_k = keymap.get("SERIES")
    isin_k = keymap.get("ISIN NUMBER")
    if not sym_k or not name_k:
        return rows
    for r in reader:
        sym = (r.get(sym_k) or "").strip()
        if not sym:
            continue
        rows.append({
            "symbol": sym,
            "company": (r.get(name_k) or "").strip() or None,
            "series": (r.get(ser_k) or "").strip() if ser_k else None,
            "isin": (r.get(isin_k) or "").strip() if isin_k else None,
        })
    return rows


def fetch_and_store(con, client) -> int:
    """Download the equity master and upsert it into the securities table."""
    import store
    text = client.equity_master()
    rows = parse_master(text)
    return store.store_securities(con, rows)
