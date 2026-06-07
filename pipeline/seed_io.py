#!/usr/bin/env python3
"""Seed snapshot of non-refetchable history tables.

Some history can never be rebuilt from a fresh fetch:

  * fiidii_daily   — cash FII/DII from a 3rd-party (Moneycontrol) feed that only
                     serves a *recent* window. Older days are gone the moment
                     they age out, so a clean cloud DB can only ever hold ~1 day.
  * cat_fpi_daily, fpi_nsdl_daily, fii_deriv_daily — slower-changing flow series
                     that we'd rather ship than re-scrape on every cold start.

Without a seed, GitHub Actions (which builds the DB from scratch / a thin cache)
emits a 1-point FII/DII history, and mongo.push then overwrites the good cloud
doc with that thin payload — so the dashboard chart collapses to its "history
builds as the pipeline runs" placeholder.

This module dumps those tables to CSVs committed under pipeline/seed/, and loads
them back with INSERT OR IGNORE — idempotent and gap-filling: freshly fetched
rows always win (they're inserted first by the normal pipeline), the seed only
backfills the dates a cold DB is missing.

Usage:
    python seed_io.py export   # snapshot local history -> pipeline/seed/*.csv
    python seed_io.py load     # merge seed CSVs into the DB (safe to repeat)
"""
from __future__ import annotations

import csv
import sys

import store

SEED_DIR = store.ROOT / "seed"

# Tables worth shipping: small, history-bearing, and not reliably refetchable.
# (delivery_daily / fo_oi_daily are huge AND rebuildable via backfill, so they
# are deliberately NOT seeded.)
SEED_TABLES = [
    "fiidii_daily",
    "cat_fpi_daily",
    "fpi_nsdl_daily",
    "fii_deriv_daily",
]


def _columns(con, table: str) -> list[str]:
    return [r[1] for r in con.execute(f'PRAGMA table_info("{table}")').fetchall()]


def export() -> int:
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    con = store.connect()
    total = 0
    for table in SEED_TABLES:
        cols = _columns(con, table)
        if not cols:
            print(f"  ! {table}: no such table, skipped")
            continue
        rows = con.execute(f'SELECT * FROM "{table}"').fetchall()
        path = SEED_DIR / f"{table}.csv"
        with path.open("w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(cols)
            for r in rows:
                w.writerow([r[c] for c in cols])
        print(f"  + {table}: {len(rows)} rows -> {path.relative_to(store.ROOT)}")
        total += len(rows)
    con.close()
    print(f"exported {total} rows across {len(SEED_TABLES)} tables")
    return 0


def load() -> int:
    if not SEED_DIR.exists():
        print("no seed dir; nothing to load")
        return 0
    con = store.connect()
    con.executescript(store.SCHEMA)  # ensure tables exist on a cold DB
    total = 0
    for table in SEED_TABLES:
        path = SEED_DIR / f"{table}.csv"
        if not path.exists():
            continue
        cols = _columns(con, table)
        if not cols:
            continue
        before = con.total_changes
        seen = 0
        with path.open(newline="") as fh:
            reader = csv.reader(fh)
            header = next(reader, None)
            if not header:
                continue
            placeholders = ",".join("?" for _ in header)
            quoted = ",".join(f'"{c}"' for c in header)
            sql = f'INSERT OR IGNORE INTO "{table}" ({quoted}) VALUES ({placeholders})'
            for row in reader:
                vals = [v if v != "" else None for v in row]
                con.execute(sql, vals)
                seen += 1
        con.commit()
        inserted = con.total_changes - before
        print(f"  + {table}: {inserted} new of {seen} seed rows inserted (rest already present)")
        total += 1
    con.close()
    print(f"seed load complete ({total} tables)")
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "export"
    if cmd == "export":
        raise SystemExit(export())
    elif cmd == "load":
        raise SystemExit(load())
    else:
        print(__doc__)
        raise SystemExit(2)
