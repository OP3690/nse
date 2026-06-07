"""Push the daily analysis into MongoDB Atlas so the web app can read it from
the cloud (and so every session is durably archived).

Safe-by-design: if MONGODB_URI is unset or the cluster is unreachable, the
functions log and return without raising — the local JSON pipeline still works.

Collections (in the MONGODB_DB database):
  - latest    : single doc {_id:"latest", ...analysis}  — the dashboard payload
  - snapshots : one doc per trading date {_id:<date>, ...analysis}  — archive
  - stocks    : one doc per symbol {_id:<symbol>, symbol, meta, history, ...}
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT.parent / ".env")
except Exception:  # noqa: BLE001 — dotenv optional; env may be set another way
    pass


def _uri():
    return os.environ.get("MONGODB_URI")


def get_client():
    """Return a MongoClient, or None if not configured / unreachable."""
    uri = _uri()
    if not uri:
        return None
    try:
        from pymongo import MongoClient
        client = MongoClient(uri, serverSelectionTimeoutMS=8000)
        client.admin.command("ping")
        return client
    except Exception as e:  # noqa: BLE001
        print(f"  ! mongo: connection failed ({e}); skipping cloud sync")
        return None


def push(latest: dict, stock_docs: list[dict]) -> bool:
    """Upsert the latest payload, archive it by date, and replace all stock docs.
    Returns True on success, False if skipped/failed (never raises)."""
    client = get_client()
    if client is None:
        return False
    try:
        from pymongo import ReplaceOne
        db = client[os.environ.get("MONGODB_DB", "nseflow")]
        date = latest.get("date")

        db.latest.replace_one({"_id": "latest"}, {"_id": "latest", **latest}, upsert=True)
        if date:
            db.snapshots.replace_one({"_id": date}, {"_id": date, **latest}, upsert=True)

        if stock_docs:
            ops = [ReplaceOne({"_id": d["symbol"]}, {"_id": d["symbol"], **d}, upsert=True)
                   for d in stock_docs]
            res = db.stocks.bulk_write(ops, ordered=False)
            n = res.upserted_count + res.modified_count
        else:
            n = 0
        print(f"  + mongo: synced latest + {date} snapshot + {n} stock docs")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  ! mongo: sync failed ({e})")
        return False
    finally:
        client.close()
