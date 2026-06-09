"""BSE market-cap enrichment for the NSE universe.

NSE doesn't publish per-stock market cap in any of its archive files, but BSE's
scrip master (`ListofScripData`) carries full market cap (₹ Cr) for every listed
scrip in a single call. The cross-exchange join key is ISIN — which our
`securities` table already stores from NSE's EQUITY_L master — so one BSE request
attaches market cap to ~94% of the NSE symbols we track (2,236 / 2,373) without
any per-stock fetching.

Free-float market cap (the index-weight-relevant figure) is only available
per-scrip via `StockTrading`, so we fetch that for a bounded subset (the
large/mid universe) where it actually matters.

Run standalone to fetch + store + print coverage:
    /usr/bin/python3 bse.py [--ff-limit N]
"""
from __future__ import annotations

import datetime as dt
import sys

import store


def _num(v) -> float | None:
    """Parse BSE numeric strings ('17,10,174.58', '1.00', '') -> float | None."""
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if not s or s in ("-", "NA", "N.A."):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _isin_to_symbol(con) -> dict[str, str]:
    """ISIN -> NSE symbol, from the securities table (EQ master)."""
    out: dict[str, str] = {}
    for r in con.execute(
            "SELECT symbol, isin FROM securities WHERE isin IS NOT NULL AND isin != ''"):
        if r["isin"] not in out:  # first symbol wins (ISIN is ~unique)
            out[r["isin"]] = r["symbol"]
    return out


def build_rows(master: list[dict], isin_to_sym: dict[str, str]) -> list[dict]:
    """Join the BSE scrip master to NSE symbols by ISIN. Returns one row per
    matched NSE symbol with full market cap + BSE identity."""
    now = dt.datetime.now().isoformat(timespec="seconds")
    rows: list[dict] = []
    seen: set[str] = set()
    for d in master:
        isin = (d.get("ISIN_NUMBER") or "").strip()
        sym = isin_to_sym.get(isin)
        if not sym or sym in seen:
            continue
        seen.add(sym)
        rows.append({
            "symbol": sym,
            "scripcode": str(d.get("SCRIP_CD") or "").strip() or None,
            "isin": isin or None,
            "bse_symbol": (d.get("scrip_id") or "").strip() or None,
            "group": (d.get("GROUP") or "").strip() or None,
            "face_value": _num(d.get("FACE_VALUE")),
            "mktcap_cr": _num(d.get("Mktcap")),
            "mktcap_ff_cr": None,  # filled below for the priority subset
            "fetched_at": now,
        })
    return rows


def _priority_symbols(con) -> set[str]:
    """Symbols worth a per-scrip free-float fetch: members of the size-tier
    indices (Nifty 50/100/500 etc.), i.e. anything in index_membership."""
    return {r["symbol"] for r in
            con.execute('SELECT DISTINCT symbol FROM index_membership')}


def enrich_free_float(client, rows: list[dict], priority: set[str], limit: int) -> int:
    """Fetch free-float market cap per scrip for the priority subset (bounded by
    `limit`). Mutates rows in place; returns how many were filled."""
    if limit <= 0:
        return 0
    targets = [r for r in rows if r["symbol"] in priority and r.get("scripcode")][:limit]
    filled = 0
    for r in targets:
        data = client.bse_stock_trading(r["scripcode"])
        if not data:
            continue
        ff = _num(data.get("MktCapFF"))
        full = _num(data.get("MktCapFull"))
        if ff is not None:
            r["mktcap_ff_cr"] = ff
            filled += 1
        if full is not None:  # prefer the per-scrip full cap (fresher)
            r["mktcap_cr"] = full
    return filled


def _sector_targets(con, nifty500_syms: set[str], limit: int) -> list[tuple[str, str]]:
    """[(symbol, scripcode)] for symbols that still lack a sector — i.e. not in
    NSE's Nifty-500 map and not already enriched in bse_sectors. Bounded by limit."""
    have = {r["symbol"] for r in con.execute("SELECT symbol FROM bse_sectors")}
    out = []
    for r in con.execute(
            "SELECT symbol, scripcode FROM bse_scrips WHERE scripcode IS NOT NULL"):
        sym = r["symbol"]
        if sym in nifty500_syms or sym in have:
            continue
        out.append((sym, r["scripcode"]))
        if limit and len(out) >= limit:
            break
    return out


def enrich_sectors(con, client, limit: int = 400) -> dict:
    """Fetch BSE ComHeader (macro Sector + Industry) for symbols still missing a
    sector, and store them. Incremental + idempotent: each call only fetches
    symbols not yet in bse_sectors, so it fills over successive runs without
    re-hitting BSE. Returns {fetched, stored}. Best-effort."""
    try:
        import sectors as _sec
        nifty500 = set(_sec.load_map().keys())
    except Exception:  # noqa: BLE001
        nifty500 = set()
    targets = _sector_targets(con, nifty500, limit)
    rows, miss = [], 0
    for sym, sc in targets:
        data = client.bse_com_header(sc)
        if not data:
            miss += 1
            continue
        sector = (data.get("Sector") or "").strip() or None
        industry = (data.get("Industry") or "").strip() or None
        if sector or industry:
            rows.append({"symbol": sym, "scripcode": sc,
                         "sector": sector, "industry": industry})
    stored = store.store_bse_sectors(con, rows)
    con.commit()
    return {"fetched": len(targets), "stored": stored, "miss": miss}


def fetch_and_store(con, client, ff_limit: int = 0) -> dict:
    """Fetch the BSE scrip master, join to NSE symbols by ISIN, optionally enrich
    a bounded priority subset with free-float cap, and store. Returns a small
    summary dict. Best-effort: returns {stored:0} if BSE is unreachable."""
    master = client.bse_scrip_master()
    if not master:
        return {"stored": 0, "matched": 0, "ff": 0, "note": "BSE master unavailable"}
    isin_to_sym = _isin_to_symbol(con)
    rows = build_rows(master, isin_to_sym)
    ff = 0
    if ff_limit:
        ff = enrich_free_float(client, rows, _priority_symbols(con), ff_limit)
    stored = store.store_bse_scrips(con, rows)
    con.commit()
    return {"stored": stored, "matched": len(rows), "master": len(master), "ff": ff}


if __name__ == "__main__":
    from nse_client import NSEClient

    con = store.connect()
    client = NSEClient()
    # --sectors N : backfill macro Sector/Industry for up to N still-missing
    # symbols (loops until exhausted when N is large). Otherwise fetch the
    # market-cap master, optionally with --ff-limit free-float enrichment.
    if "--sectors" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--sectors") + 1])
        total = {"fetched": 0, "stored": 0, "miss": 0}
        while True:
            batch = enrich_sectors(con, client, limit=min(limit, 200) if limit else 200)
            for k in total:
                total[k] += batch[k]
            print(f"  sectors: +{batch['stored']} stored "
                  f"(fetched {batch['fetched']}, miss {batch['miss']}) "
                  f"| running {total['stored']}")
            if batch["fetched"] == 0 or (limit and total["fetched"] >= limit):
                break
        print(total)
    else:
        ff_limit = 0
        if "--ff-limit" in sys.argv:
            ff_limit = int(sys.argv[sys.argv.index("--ff-limit") + 1])
        summary = fetch_and_store(con, client, ff_limit=ff_limit)
        print(summary)
    con.close()
