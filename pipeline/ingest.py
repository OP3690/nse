"""Parse a downloaded raw/<iso>/ folder and load it into SQLite."""
from __future__ import annotations

import json
from pathlib import Path

import parse
import store

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"


def ingest_dir(raw_dir: Path) -> dict:
    manifest = json.loads((raw_dir / "manifest.json").read_text())
    date = manifest["date"]
    files = manifest["files"]
    con = store.connect()
    counts = {}

    if "delivery" in files:
        counts["delivery"] = store.store_delivery(
            con, parse.parse_delivery(raw_dir / files["delivery"]), date)
    if "fiidii" in files:
        counts["fiidii"] = store.store_fiidii(
            con, parse.parse_fiidii(raw_dir / files["fiidii"]), date)
    if "bulk" in files:
        counts["bulk"] = store.store_bulk(
            con, parse.parse_bulk(raw_dir / files["bulk"]), date)
    if "block" in files:
        counts["block"] = store.store_block(
            con, parse.parse_block(raw_dir / files["block"]), date)
    if "fo" in files:
        counts["fo"] = store.store_fo(
            con, parse.parse_fo(raw_dir / files["fo"]), date)
    if "high52" in files:
        counts["high52"] = store.store_wk52(
            con, parse.parse_high52(raw_dir / files["high52"]), date)
    if "indices" in files:
        counts["indices"] = store.store_indices(
            con, parse.parse_indices(json.loads((raw_dir / files["indices"]).read_text())), date)
    if "mc_fiidii" in files:
        counts["mc_fiidii"] = store.store_fiidii(
            con, parse.parse_mc_fiidii((raw_dir / files["mc_fiidii"]).read_text()), date)
    if "fii_deriv" in files:
        counts["fii_deriv"] = store.store_fii_deriv(
            con, parse.parse_fii_deriv((raw_dir / files["fii_deriv"]).read_bytes()))
    if "nsdl_fpi" in files:
        parsed = parse.parse_nsdl_fpi((raw_dir / files["nsdl_fpi"]).read_text())
        counts["nsdl_fpi"] = store.store_fpi_nsdl(con, parsed)
    if "cat_turnover" in files:
        counts["cat_turnover"] = store.store_cat_turnover(
            con, parse.parse_cat_turnover((raw_dir / files["cat_turnover"]).read_bytes()))

    con.commit()
    con.close()
    print(f"Ingested {date}: " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    return counts


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        ingest_dir(RAW / sys.argv[1])
    else:
        dirs = sorted([p for p in RAW.iterdir() if p.is_dir()])
        if dirs:
            ingest_dir(dirs[-1])
