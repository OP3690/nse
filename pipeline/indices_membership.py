"""Index membership: symbol -> the NSE indices it belongs to (+ size class).

NSE publishes the constituents of every index as a plain CSV under
/content/indices/<file>.csv. We fetch a curated set (broad-market tiers,
sector indices and the major thematic banks) and build, per symbol, the list
of index labels it appears in. From the broad-market *tier* indices we also
derive a SEBI-style market-cap class (Large/Mid/Small/Micro) — a meaningful,
defensible size label since NSE blocks per-symbol market-cap numbers.

The CSV columns are: Company Name, Industry, Symbol, Series, ISIN Code.
"""
from __future__ import annotations

import csv
import io

# label -> constituent-CSV filename. Order matters for display priority:
# broad tiers first, then sectors, then thematic banks.
INDEX_FILES = [
    # Broad market
    ("Nifty 50", "ind_nifty50list.csv"),
    ("Nifty Next 50", "ind_niftynext50list.csv"),
    ("Nifty 100", "ind_nifty100list.csv"),
    ("Nifty 200", "ind_nifty200list.csv"),
    ("Nifty 500", "ind_nifty500list.csv"),
    ("Nifty Midcap 50", "ind_niftymidcap50list.csv"),
    ("Nifty Midcap 100", "ind_niftymidcap100list.csv"),
    ("Nifty Midcap 150", "ind_niftymidcap150list.csv"),
    ("Nifty Smallcap 250", "ind_niftysmallcap250list.csv"),
    ("Nifty Microcap 250", "ind_niftymicrocap250_list.csv"),
    # Sector / thematic
    ("Nifty Bank", "ind_niftybanklist.csv"),
    ("Nifty IT", "ind_niftyitlist.csv"),
    ("Nifty Auto", "ind_niftyautolist.csv"),
    ("Nifty Pharma", "ind_niftypharmalist.csv"),
    ("Nifty Healthcare", "ind_niftyhealthcarelist.csv"),
    ("Nifty FMCG", "ind_niftyfmcglist.csv"),
    ("Nifty Metal", "ind_niftymetallist.csv"),
    ("Nifty Realty", "ind_niftyrealtylist.csv"),
    ("Nifty Media", "ind_niftymedialist.csv"),
    ("Nifty Energy", "ind_niftyenergylist.csv"),
    ("Nifty Oil & Gas", "ind_niftyoilgaslist.csv"),
    ("Nifty Infra", "ind_niftyinfralist.csv"),
    ("Nifty Fin Services", "ind_niftyfinancelist.csv"),
    ("Nifty PSU Bank", "ind_niftypsubanklist.csv"),
    ("Nifty Private Bank", "ind_nifty_privatebanklist.csv"),
    ("Nifty Cons Durables", "ind_niftyconsumerdurableslist.csv"),
]

# Broad tier index -> cap class. Checked in this order; first hit wins, so a
# stock in both Nifty 100 and Nifty 500 is "Large Cap".
CAP_TIERS = [
    ("Nifty 100", "Large Cap"),
    ("Nifty Midcap 150", "Mid Cap"),
    ("Nifty Smallcap 250", "Small Cap"),
    ("Nifty Microcap 250", "Micro Cap"),
]


def parse_constituents(text: str) -> list[dict]:
    """Parse an index constituent CSV into [{symbol, company, industry}]."""
    out = []
    reader = csv.DictReader(io.StringIO(text))
    keymap = {(k or "").strip().upper(): k for k in (reader.fieldnames or [])}
    sym_k = keymap.get("SYMBOL")
    name_k = keymap.get("COMPANY NAME")
    ind_k = keymap.get("INDUSTRY")
    if not sym_k:
        return out
    for r in reader:
        sym = (r.get(sym_k) or "").strip()
        if not sym:
            continue
        out.append({
            "symbol": sym,
            "company": (r.get(name_k) or "").strip() if name_k else None,
            "industry": (r.get(ind_k) or "").strip() if ind_k else None,
        })
    return out


def build_membership(client) -> dict:
    """Fetch the curated index set. Returns {symbol: {"indices": [...],
    "industry": str, "cap_tier": str|None}} plus a per-index constituent map."""
    sym_indices: dict[str, list[str]] = {}
    sym_industry: dict[str, str] = {}
    index_members: dict[str, list[str]] = {}
    for label, filename in INDEX_FILES:
        text = client.index_constituents(filename)
        if not text:
            print(f"  ! index membership: {label} ({filename}) unavailable")
            continue
        rows = parse_constituents(text)
        index_members[label] = [r["symbol"] for r in rows]
        for r in rows:
            sym = r["symbol"]
            sym_indices.setdefault(sym, []).append(label)
            if r.get("industry") and sym not in sym_industry:
                sym_industry[sym] = r["industry"]
        print(f"  + index membership: {label} -> {len(rows)} stocks")

    per_symbol = {}
    for sym, labels in sym_indices.items():
        cap = None
        for tier_label, tier_cap in CAP_TIERS:
            if tier_label in labels:
                cap = tier_cap
                break
        per_symbol[sym] = {
            "indices": labels,
            "industry": sym_industry.get(sym),
            "cap_tier": cap,
        }
    return {"per_symbol": per_symbol, "index_members": index_members}


def fetch_and_store(con, client) -> int:
    """Fetch the curated index set and rebuild the index_membership table."""
    import store
    data = build_membership(client)
    rows = []
    for sym, info in data["per_symbol"].items():
        for label in info["indices"]:
            rows.append({"symbol": sym, "index": label, "industry": info["industry"]})
    return store.store_index_membership(con, rows)


def load_maps(con) -> dict:
    """Read index_membership back from DB into the same shape build_membership
    returns: {per_symbol: {sym: {indices, industry, cap_tier}}, index_members}."""
    sym_indices: dict[str, list[str]] = {}
    sym_industry: dict[str, str] = {}
    index_members: dict[str, list[str]] = {}
    # Preserve the canonical display order from INDEX_FILES.
    order = {label: i for i, (label, _) in enumerate(INDEX_FILES)}
    cur = con.execute('SELECT symbol, "index" AS idx, industry FROM index_membership')
    for r in cur.fetchall():
        sym, idx, ind = r["symbol"], r["idx"], r["industry"]
        sym_indices.setdefault(sym, []).append(idx)
        index_members.setdefault(idx, []).append(sym)
        if ind and sym not in sym_industry:
            sym_industry[sym] = ind
    per_symbol = {}
    for sym, labels in sym_indices.items():
        labels = sorted(labels, key=lambda l: order.get(l, 999))
        cap = None
        for tier_label, tier_cap in CAP_TIERS:
            if tier_label in labels:
                cap = tier_cap
                break
        per_symbol[sym] = {
            "indices": labels,
            "industry": sym_industry.get(sym),
            "cap_tier": cap,
        }
    return {"per_symbol": per_symbol, "index_members": index_members}
