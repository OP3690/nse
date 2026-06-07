"""Download all NSE reports for a trading date into data/raw/<iso>/."""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from nse_client import NSEClient

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"

# NSE trading holidays are date-specific; for a local tool we just skip weekends
# and fall back to earlier dates if a file is missing (covers holidays too).
def is_weekend(d: dt.date) -> bool:
    return d.weekday() >= 5  # Sat=5, Sun=6


def latest_trading_date(today: dt.date | None = None) -> dt.date:
    d = today or dt.date.today()
    # NSE files for "today" appear after market close (~6pm IST). To be safe the
    # caller usually wants the previous completed session, but we start at today
    # and the download loop will fall back if files are not yet published.
    while is_weekend(d):
        d -= dt.timedelta(days=1)
    return d


def fmts(d: dt.date) -> tuple[str, str]:
    return d.strftime("%d%m%Y"), d.strftime("%Y%m%d")  # DDMMYYYY, YYYYMMDD


def download_for_date(d: dt.date, light: bool = False) -> dict | None:
    """Download reports for date d. Returns manifest dict, or None if the core
    delivery file is unavailable (likely a holiday / not-yet-published).

    light=True skips the slow, rarely-changing master/history fetches (full equity
    master, index membership, IPO list, 30-session Moneycontrol backfill) — used by
    the fast 6-hourly refresh. All date-addressed daily files are still fetched."""
    ddmmyyyy, iso = fmts(d)
    out_dir = RAW / iso
    out_dir.mkdir(parents=True, exist_ok=True)
    client = NSEClient()

    print(f"Downloading NSE reports for {d.isoformat()} ...")
    manifest: dict = {"date": d.isoformat(), "iso": iso, "files": {}}

    # Delivery bhavcopy is the anchor: if it's missing, the session has no data.
    delivery = client.download_report("delivery", out_dir, ddmmyyyy, iso)
    if not delivery:
        print(f"  -> no delivery data for {d.isoformat()} (holiday or not yet published)")
        return None
    manifest["files"]["delivery"] = delivery.name

    for kind in ("bulk", "block", "fo", "high52"):
        p = client.download_report(kind, out_dir, ddmmyyyy, iso)
        if p:
            manifest["files"][kind] = p.name

    # FII/DII is a JSON API (always "latest", not date-addressed).
    try:
        fii = client.fiidii()
        (out_dir / "fiidii.json").write_text(json.dumps(fii, indent=2))
        manifest["files"]["fiidii"] = "fiidii.json"
        print(f"  + fiidii: {len(fii)} rows -> fiidii.json")
    except Exception as e:  # noqa: BLE001
        print(f"  ! fiidii: {e}")

    # Cash FII/DII recent window from Moneycontrol (last ~30 sessions). Keeps the
    # cash history dense even if a daily run is missed; figures match NSE. Slow
    # (parses 30 sessions) — skipped in light mode since the latest-only NSE
    # fiidii.json above already carries the current session.
    if not light:
        try:
            mc = client.mc_fiidii_cash()
            (out_dir / "mc_fiidii.html").write_text(mc)
            manifest["files"]["mc_fiidii"] = "mc_fiidii.html"
            print(f"  + mc_fiidii: {len(mc):,} bytes -> mc_fiidii.html")
        except Exception as e:  # noqa: BLE001
            print(f"  ! mc_fiidii: {e}")

    # All-indices snapshot (broad + sector + India VIX) JSON API. We also append
    # BSE Sensex (not on NSE's feed) shaped like an NSE row so it stores uniformly.
    try:
        idx = client.all_indices()
        sx = client.bse_sensex()
        if sx:
            idx.append({"indexSymbol": "SENSEX", "index": "SENSEX",
                        "last": sx["last"], "percentChange": sx["pct"]})
            print(f"  + sensex: {sx['last']} ({sx['pct']:+.2f}%) appended to indices")
        else:
            print("  ! sensex: unavailable (skipped)")
        (out_dir / "indices.json").write_text(json.dumps(idx, indent=2))
        manifest["files"]["indices"] = "indices.json"
        print(f"  + indices: {len(idx)} rows -> indices.json")
    except Exception as e:  # noqa: BLE001
        print(f"  ! indices: {e}")

    # FII derivatives stats (date-addressed .xls) — FII F&O positioning.
    fii_x = client.fii_deriv(d.strftime("%d-%b-%Y"))
    if fii_x:
        (out_dir / "fii_deriv.xls").write_bytes(fii_x)
        manifest["files"]["fii_deriv"] = "fii_deriv.xls"
        print(f"  + fii_deriv: {len(fii_x):,} bytes -> fii_deriv.xls")

    # Category-wise Turnover (date-addressed .xls): NSDL-confirmed FPI (reconciled
    # cash FII) + monthly DII history. The official counterpart to the provisional
    # FII/DII figures above; this one backfills for years.
    cat = client.cat_turnover(d.strftime("%d%m%y"))
    if cat:
        (out_dir / "cat_turnover.xls").write_bytes(cat)
        manifest["files"]["cat_turnover"] = "cat_turnover.xls"
        print(f"  + cat_turnover: {len(cat):,} bytes -> cat_turnover.xls")

    # NSDL daily FPI trends (asset-class destination of foreign money). The page
    # is "latest only" and carries its own session date, parsed at ingest time.
    try:
        html = client.nsdl_fpi()
        (out_dir / "nsdl_fpi.html").write_text(html)
        manifest["files"]["nsdl_fpi"] = "nsdl_fpi.html"
        print(f"  + nsdl_fpi: {len(html):,} bytes -> nsdl_fpi.html")
    except Exception as e:  # noqa: BLE001
        print(f"  ! nsdl_fpi: {e}")

    # The following three are slow master/list fetches that don't change intraday
    # (IPO list, full equity master, index membership). Skipped in light mode —
    # they're already in the DB from the last full daily run.
    if not light:
        # Past IPO issues (issue price + listing date per symbol) for the IPO Radar.
        # Stored straight into the DB (not a raw file) since it's a small live list.
        try:
            import ipo
            import store
            con = store.connect()
            ipo.fetch_and_store(con, client)
            ipo.fetch_upcoming(con, client)
            con.close()
            manifest["files"]["ipo_issues"] = "db:ipo_issues"
        except Exception as e:  # noqa: BLE001
            print(f"  ! ipo: {e}")

        # Equity master (symbol -> company name) for the whole listed universe.
        # Stored straight into the DB; powers full-company-name tooltips in the UI.
        try:
            import securities
            import store
            con = store.connect()
            n = securities.fetch_and_store(con, client)
            con.commit()
            con.close()
            manifest["files"]["securities"] = "db:securities"
            print(f"  + securities: {n} symbols -> db:securities")
        except Exception as e:  # noqa: BLE001
            print(f"  ! securities: {e}")

        # Index membership (symbol -> the NSE indices it belongs to + cap class).
        # Rebuilt each run from the curated constituent-CSV set; powers the rich
        # hover-card index chips and the clickable Index Performances panel.
        try:
            import indices_membership
            import store
            con = store.connect()
            n = indices_membership.fetch_and_store(con, client)
            con.commit()
            con.close()
            manifest["files"]["index_membership"] = "db:index_membership"
            print(f"  + index membership: {n} (symbol,index) rows -> db:index_membership")
        except Exception as e:  # noqa: BLE001
            print(f"  ! index membership: {e}")

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def download_latest(max_lookback: int = 6, light: bool = False) -> dict | None:
    """Try today, then walk back up to max_lookback days until data is found."""
    d = latest_trading_date()
    for _ in range(max_lookback + 1):
        if not is_weekend(d):
            m = download_for_date(d, light=light)
            if m:
                return m
        d -= dt.timedelta(days=1)
    print("No trading data found in lookback window.")
    return None


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        target = dt.date.fromisoformat(sys.argv[1])
        download_for_date(target)
    else:
        download_latest()
