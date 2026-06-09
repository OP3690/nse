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

# --- Corporate disclosure APIs (JSON). All sit behind the same Akamai wall as
# the other /api endpoints, so they reuse the warmed session + Referer header. ---
# Corporate announcements (filings: order wins, fundraises, board changes, ratings,
# concall/transcript intimations, etc). Optional from_date/to_date (DD-MM-YYYY) give
# a dated window across the whole equity universe; &symbol= filters to one stock.
CORP_ANNOUNCE_API = BASE + "/api/corporate-announcements?index=equities"
# Forward board-meeting calendar: upcoming results/dividend/buyback/split intimations
# with the stated purpose. This is the only forward-looking "event is coming" feed.
EVENT_CALENDAR_API = BASE + "/api/event-calendar"
# Quarterly financial-results filings (who filed, when, audited flag, XBRL link). The
# headline numbers live in the XBRL XML, fetched separately and parsed best-effort.
FIN_RESULTS_API = BASE + "/api/corporates-financial-results?index=equities&period=Quarterly"

# FII/DII activity is a JSON API, not an archive file.
FIIDII_API = BASE + "/api/fiidiiTradeReact"

# NSDL FPI daily trends (asset-class destination of FPI money). Separate site,
# no Akamai wall — a plain impersonated GET works without the NSE warmup.
NSDL_FPI_URL = "https://www.fpi.nsdl.co.in/web/Reports/Latest.aspx"

# Cash FII/DII has no NSE history (latest-only). Moneycontrol embeds the last
# ~30 sessions (buy/sell/net for FII & DII) in its page JSON — used to seed the
# recent window; figures match NSE. Third-party site, no warmup needed.
MC_FIIDII_URL = "https://www.moneycontrol.com/markets/fii-dii-data/cash/"

# BSE Sensex isn't on NSE's allIndices feed (it's a BSE index). BSE's own API is
# the authoritative source (LTP + change + %chg, exchange-official); index 16 is
# the S&P BSE SENSEX. Yahoo ^BSESN is kept as a fallback only — its
# chartPreviousClose can be wrong, yielding a spurious % change.
BSE_INDEX_API = "https://api.bseindia.com/BseIndiaAPI/api/IndexMovers/w?index=16"
BSE_HOME = "https://www.bseindia.com/"

# BSE active-equity scrip master (one call → every listed scrip with SCRIP_CD,
# ticker, ISIN, group, face value and full market cap in ₹ Cr). The cross-exchange
# join key is ISIN, which our `securities` table already carries from NSE. This is
# how we attach market cap to the whole NSE universe without per-stock requests.
BSE_SCRIP_MASTER = ("https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w"
                    "?Group=&Scripcode=&industry=&segment=Equity&status=Active")
# Per-scrip trading detail: full + free-float market cap, WAP, turnover, TTQ,
# 2-week avg qty, circuit limits. {sc} = BSE scrip code. Used for the Nifty-500
# subset where free-float (index-weight-relevant) market cap matters.
BSE_STOCK_TRADING = ("https://api.bseindia.com/BseIndiaAPI/api/StockTrading/w"
                     "?flag=&quotetype=EQ&scripcode={sc}")
# Per-scrip company header: macro Sector + granular Industry classification.
# Fills sectors for symbols outside NSE's Nifty-500-only free sector map.
BSE_COM_HEADER = ("https://api.bseindia.com/BseIndiaAPI/api/ComHeader/w"
                  "?quotetype=EQ&scripcode={sc}&seriesid=")
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1d&interval=1d"


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

    # --- Corporate disclosures --------------------------------------------
    def corp_announcements(self, frm: str | None = None, to: str | None = None) -> list[dict]:
        """Corporate announcements. With no dates → the ~20 latest market-wide;
        with frm/to ('DD-MM-YYYY') → every equity filing in that window. Returns
        [] on failure (the daily run just skips the refresh)."""
        url = CORP_ANNOUNCE_API
        if frm and to:
            url += f"&from_date={frm}&to_date={to}"
        try:
            data = self.get_json(url)
        except Exception:  # noqa: BLE001
            return []
        return data if isinstance(data, list) else []

    def event_calendar(self) -> list[dict]:
        """Upcoming board-meeting calendar: [{symbol, company, purpose, bm_desc,
        date}]. Returns [] on failure."""
        try:
            data = self.get_json(EVENT_CALENDAR_API)
        except Exception:  # noqa: BLE001
            return []
        return data if isinstance(data, list) else []

    def fin_results(self, fys: list[int] | None = None) -> list[dict]:
        """Quarterly financial-results filings across the universe (filing
        metadata + XBRL link, not the numbers). The bare endpoint is flaky — it
        intermittently returns a tiny default slice — so we query explicit
        financial years (FY label = ending calendar year) and merge, deduped by
        seqNumber. `fys` defaults to the current and previous Indian FY. Returns
        [] only if every query fails."""
        if fys is None:
            import datetime as _dt
            t = _dt.date.today()
            fy_end = t.year + 1 if t.month >= 4 else t.year  # Apr-Mar FY label
            fys = [fy_end, fy_end - 1]
        merged: dict[str, dict] = {}
        for fy in fys:
            try:
                data = self.get_json(f"{FIN_RESULTS_API}&fy={fy}")
            except Exception:  # noqa: BLE001
                continue
            if isinstance(data, list):
                for r in data:
                    key = str(r.get("seqNumber") or r.get("seqId") or id(r))
                    merged[key] = r
        if not merged:  # last resort: the bare (flaky) endpoint
            try:
                data = self.get_json(FIN_RESULTS_API)
                if isinstance(data, list):
                    return data
            except Exception:  # noqa: BLE001
                pass
        return list(merged.values())

    def get_text(self, url: str) -> str | None:
        """Fetch a text/XML resource (e.g. results XBRL) through the warmed
        session. Returns None on failure rather than raising."""
        try:
            return self.get_bytes(url).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            return None

    def bse_sensex(self) -> dict | None:
        """BSE Sensex headline quote: {last, pct, change}. NSE's feed has no
        Sensex, so we go straight to BSE's own API (exchange-authoritative LTP +
        change + %chg), with Yahoo ^BSESN as a fallback. Returns None only if
        both fail (the tile just hides)."""
        return self._bse_sensex_official() or self._bse_sensex_yahoo()

    def _bse_sensex_official(self) -> dict | None:
        """BSE's own IndexMovers API (index 16 = S&P BSE SENSEX). curl_cffi's
        Chrome impersonation clears BSE's bot wall; a homepage hit seeds cookies."""
        headers = {"Referer": BSE_HOME, "Accept": "application/json, text/plain, */*"}
        for attempt in range(2):
            try:
                if attempt:  # second try: warm cookies on the BSE homepage first
                    self.s.get(BSE_HOME, timeout=15)
                r = self.s.get(BSE_INDEX_API, headers=headers, timeout=20)
                row = (r.json() or {}).get("Table", [None])[0]
                if not row or row.get("LTP") is None:
                    continue
                return {
                    "last": round(float(row["LTP"]), 2),
                    "pct": round(float(row["PERCENTCHG"]), 2) if row.get("PERCENTCHG") is not None else None,
                    "change": round(float(row["change"]), 2) if row.get("change") is not None else None,
                }
            except Exception:  # noqa: BLE001 (bad JSON / HTML error page / network)
                continue
        return None

    def _bse_sensex_yahoo(self) -> dict | None:
        """Fallback only — Yahoo ^BSESN. chartPreviousClose can be stale/wrong,
        so this is used solely when BSE's own API is unreachable."""
        url = YAHOO_CHART_URL.format(sym="%5EBSESN")
        try:
            r = self.s.get(url, timeout=20)
            r.raise_for_status()
            meta = r.json()["chart"]["result"][0]["meta"]
            last = meta.get("regularMarketPrice")
            prev = meta.get("chartPreviousClose") or meta.get("previousClose")
            if last is None or not prev:
                return None
            return {"last": round(last, 2), "pct": round((last - prev) / prev * 100, 2),
                    "change": round(last - prev, 2)}
        except Exception:  # noqa: BLE001
            return None

    def bse_scrip_master(self) -> list[dict]:
        """BSE active-equity scrip master (whole listed universe in one call).
        Each row: {SCRIP_CD, scrip_id, ISIN_NUMBER, GROUP, FACE_VALUE, Mktcap,
        Scrip_Name, Issuer_Name, ...}. Mktcap is full market cap in ₹ Cr. Returns
        [] on failure (the caller just skips the market-cap enrichment)."""
        headers = {"Referer": BSE_HOME, "Accept": "application/json, text/plain, */*"}
        for attempt in range(2):
            try:
                if attempt:
                    self.s.get(BSE_HOME, timeout=15)
                r = self.s.get(BSE_SCRIP_MASTER, headers=headers, timeout=30)
                data = r.json()
                if isinstance(data, list) and data:
                    return data
            except Exception:  # noqa: BLE001
                continue
        return []

    def bse_com_header(self, scripcode: str) -> dict | None:
        """BSE company header for a scrip: carries macro Sector + granular
        Industry + ISIN/group. Returns the raw JSON dict, or None on failure."""
        headers = {"Referer": BSE_HOME, "Accept": "application/json, text/plain, */*"}
        try:
            r = self.s.get(BSE_COM_HEADER.format(sc=scripcode), headers=headers, timeout=20)
            data = r.json()
            return data if isinstance(data, dict) and data else None
        except Exception:  # noqa: BLE001
            return None

    def bse_stock_trading(self, scripcode: str) -> dict | None:
        """Per-scrip trading detail incl. full + free-float market cap. Returns
        the raw JSON dict, or None on failure / empty."""
        headers = {"Referer": BSE_HOME, "Accept": "application/json, text/plain, */*"}
        try:
            r = self.s.get(BSE_STOCK_TRADING.format(sc=scripcode), headers=headers, timeout=20)
            data = r.json()
            return data if isinstance(data, dict) and data else None
        except Exception:  # noqa: BLE001
            return None

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
