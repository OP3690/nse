"""NSE HTTP client.

NSE sits behind Akamai bot protection that fingerprints the TLS handshake,
so plain requests/urllib/curl get a 403. curl_cffi impersonates a real Chrome
TLS+HTTP fingerprint, which gets through. We warm up a session by hitting the
homepage (to collect cookies) before requesting any data file.
"""
from __future__ import annotations

import time
from pathlib import Path

from curl_cffi import requests

BASE = "https://www.nseindia.com"
ARCHIVES = "https://nsearchives.nseindia.com"

# NSE archive paths. {d} = DDMMYYYY, {iso} = YYYYMMDD.
ENDPOINTS = {
    # Security-wise full bhavcopy: includes DELIV_QTY and DELIV_PER (delivery %).
    "delivery": ARCHIVES + "/products/content/sec_bhavdata_full_{d}.csv",
    # Bulk & block deals (rolling files, last ~ couple weeks).
    "bulk": ARCHIVES + "/content/equities/bulk.csv",
    "block": ARCHIVES + "/content/equities/block.csv",
    # F&O bhavcopy (UDiFF zip) — open interest per contract.
    "fo": ARCHIVES + "/content/fo/BhavCopy_NSE_FO_0_0_0_{iso}_F_0000.csv.zip",
    # 52-week high/low levels (date-addressed; first two lines are a disclaimer).
    "high52": ARCHIVES + "/content/CM_52_wk_High_low_{d}.csv",
}

# FII Derivatives Statistics (date-addressed .xls). {dmon} = DD-Mon-YYYY.
# FII buy/sell/OI per F&O category — the one date-addressed FII history NSE
# publishes (cash FII/DII is latest-only, so this is how we get a year of FII).
FII_DERIV_URL = ARCHIVES + "/content/fo/fii_stats_{dmon}.xls"

# Category-wise Turnover (date-addressed .xls). {ddmmyy} = DDMMYY.
# Daily sheet carries NSDL-confirmed FPI (reconciled cash FII); historical sheet
# carries monthly Total-DII back to Jan 2021. The reconciled counterpart to the
# provisional fiidiiTradeReact numbers, and unlike them it backfills for years.
CAT_TURNOVER_URL = ARCHIVES + "/archives/equities/cat/cat_turnover_{ddmmyy}.xls"

# Symbol -> Industry map (Nifty 500). Not date-addressed; refreshed weekly.
NIFTY500_LIST = ARCHIVES + "/content/indices/ind_nifty500list.csv"

# Full equity master (SYMBOL, NAME OF COMPANY, ...) — the canonical symbol ->
# company-name list for the whole listed universe. "Current", refreshed daily.
EQUITY_MASTER_URL = ARCHIVES + "/content/equities/EQUITY_L.csv"

# All indices snapshot (broad + sector indices + India VIX), JSON. "Current".
ALLINDICES_API = BASE + "/api/allIndices"

# FII/DII activity is a JSON API, not an archive file.
FIIDII_API = BASE + "/api/fiidiiTradeReact"

# NSDL FPI daily trends (asset-class destination of FPI money). Separate site,
# no Akamai wall — a plain impersonated GET works without the NSE warmup.
NSDL_FPI_URL = "https://www.fpi.nsdl.co.in/web/Reports/Latest.aspx"

# Cash FII/DII has no NSE history (latest-only). Moneycontrol embeds the last
# ~30 sessions (buy/sell/net for FII & DII) in its page JSON — used to seed the
# recent window; figures match NSE. Third-party site, no warmup needed.
MC_FIIDII_URL = "https://www.moneycontrol.com/markets/fii-dii-data/cash/"


class NSEClient:
    def __init__(self):
        self.s = requests.Session(impersonate="chrome")
        self._warm = False

    def _warmup(self):
        if self._warm:
            return
        # Hit homepage to seed cookies; one retry on transient failure.
        for attempt in range(3):
            try:
                r = self.s.get(BASE, timeout=25)
                if r.status_code == 200:
                    self._warm = True
                    return
            except Exception:
                pass
            time.sleep(1.5 * (attempt + 1))
        raise RuntimeError("Could not establish NSE session (homepage warmup failed)")

    def get_bytes(self, url: str) -> bytes:
        self._warmup()
        headers = {"Referer": BASE + "/", "Accept": "*/*"}
        last = None
        for attempt in range(3):
            try:
                r = self.s.get(url, timeout=40, headers=headers)
                if r.status_code == 200:
                    return r.content
                last = f"HTTP {r.status_code}"
            except Exception as e:  # noqa: BLE001
                last = repr(e)
            time.sleep(1.5 * (attempt + 1))
            # Re-warm in case cookies expired.
            self._warm = False
            self._warmup()
        raise RuntimeError(f"Download failed: {url} ({last})")

    def get_json(self, url: str):
        self._warmup()
        headers = {"Referer": BASE + "/", "Accept": "application/json"}
        r = self.s.get(url, timeout=30, headers=headers)
        r.raise_for_status()
        return r.json()

    def download_report(self, kind: str, out_dir: Path, d: str, iso: str) -> Path | None:
        """Download one report kind into out_dir. Returns path or None if missing."""
        url = ENDPOINTS[kind].format(d=d, iso=iso)
        ext = ".zip" if url.endswith(".zip") else ".csv"
        out = out_dir / f"{kind}{ext}"
        try:
            data = self.get_bytes(url)
        except RuntimeError as e:
            print(f"  ! {kind}: {e}")
            return None
        if len(data) < 200:  # NSE sometimes returns a tiny error page
            print(f"  ! {kind}: suspiciously small ({len(data)} bytes), skipping")
            return None
        out.write_bytes(data)
        print(f"  + {kind}: {len(data):,} bytes -> {out.name}")
        return out

    def equity_master(self) -> str:
        """Raw CSV text of NSE's full equity master (symbol + company name)."""
        return self.get_bytes(EQUITY_MASTER_URL).decode("utf-8", "replace")

    def index_constituents(self, filename: str) -> str | None:
        """Raw CSV text of an NSE index constituent list (e.g. ind_nifty50list.csv).
        Returns None on a missing file rather than raising."""
        url = ARCHIVES + "/content/indices/" + filename
        try:
            return self.get_bytes(url).decode("utf-8", "replace")
        except RuntimeError:
            return None

    def fiidii(self):
        return self.get_json(FIIDII_API)

    def all_indices(self):
        return self.get_json(ALLINDICES_API).get("data", [])

    def nsdl_fpi(self) -> str:
        """Raw HTML of NSDL's daily FPI trends page (no NSE warmup needed)."""
        r = self.s.get(NSDL_FPI_URL, timeout=30)
        r.raise_for_status()
        return r.text

    def mc_fiidii_cash(self) -> str:
        """Moneycontrol cash FII/DII page HTML (last ~30 sessions). No warmup."""
        r = self.s.get(MC_FIIDII_URL, timeout=30,
                       headers={"Accept": "text/html", "Referer": "https://www.moneycontrol.com/"})
        r.raise_for_status()
        return r.text

    def cat_turnover(self, ddmmyy: str) -> bytes | None:
        """Category-wise Turnover .xls for a date (ddmmyy = 'DDMMYY').
        Returns None on a holiday / missing file rather than raising."""
        try:
            data = self.get_bytes(CAT_TURNOVER_URL.format(ddmmyy=ddmmyy))
        except RuntimeError:
            return None
        return data if data and len(data) > 2000 else None

    def fii_deriv(self, dmon: str) -> bytes | None:
        """FII derivatives stats .xls for a date (dmon = 'DD-Mon-YYYY').
        Returns None on a holiday / missing file rather than raising."""
        try:
            data = self.get_bytes(FII_DERIV_URL.format(dmon=dmon))
        except RuntimeError:
            return None
        return data if data and len(data) > 2000 else None
