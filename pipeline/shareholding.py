"""Per-stock quarterly shareholding pattern (Promoter / FII / DII / Public).

NSE's daily reports only carry FII/DII at the whole-market level. The only
per-stock institutional breakdown NSE publishes is the quarterly shareholding
pattern filing. Two sources are combined:

  1. corporate-share-holdings-master  (JSON) — newest-first list of every
     quarter with Promoter % and Public %, plus a link to the detailed XBRL.
  2. the XBRL filing (XML) per quarter — splits Public into Foreign (FII/FPI),
     Domestic Institutions (DII) and Non-Institutions (retail/"Public"), and
     carries the company's total share count.

We fetch the master once, then the XBRL for the most recent few quarters, so a
stock detail page can show the last ~90 days (latest quarter vs the one before)
of net accumulation / distribution per category, in both holding-% and an
estimated ₹ value.
"""
from __future__ import annotations

import datetime as dt
import re
import time

from nse_client import BASE

MASTER_URL = BASE + "/api/corporate-share-holdings-master?index=equities&symbol={sym}"

_MONTHS = {"JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
           "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12}

# Aggregate XBRL contexts (values are fractions of 1, e.g. 0.1867 = 18.67%).
_CTX_PROMOTER = "ShareholdingOfPromoterAndPromoterGroup_ContextI"
_CTX_FII = "InstitutionsForeign_ContextI"
_CTX_DII = "InstitutionsDomestic_ContextI"
_CTX_PUBLIC_RETAIL = "NonInstitutions_ContextI"
_CTX_TOTAL_SHARES = "ShareholdingPattern_ContextI"

# Fallback components when a filing omits the rolled-up aggregate.
_CTX_FII_PARTS = ("InstitutionsForeignPortfolioInvestorCategoryOne_ContextI",
                  "InstitutionsForeignPortfolioInvestorCategoryTwo_ContextI",
                  "OtherInstitutionsForeign_ContextI",
                  "ForeignInstitutionalInvestors_ContextI")
_CTX_DII_PARTS = ("MutualFundsOrUTI_ContextI", "Banks_ContextI",
                  "InsuranceCompanies_ContextI", "OtherFinancialInstitutions_ContextI",
                  "AlternateInvestmentFunds_ContextI", "ProvidentFunds_ContextI",
                  "VentureCapitalFunds_ContextI", "CentralGovernmentOrPresidentOfIndia_ContextI")

_PCT_RE = re.compile(
    r"<in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares\w*\b[^>]*?"
    r'contextRef="([^"]+)"[^>]*>([0-9.]+)<', re.I)
_SHARES_RE = re.compile(
    r'<in-bse-shp:NumberOfFullyPaidUpEquityShares\b[^>]*?contextRef="([^"]+)"[^>]*>(\d+)<', re.I)


def _iso_quarter(date_str: str) -> str | None:
    """'31-MAR-2026' -> '2026-03-31' (sortable). None if unparseable."""
    try:
        d, mon, y = date_str.strip().upper().split("-")
        return f"{int(y):04d}-{_MONTHS[mon[:3]]:02d}-{int(d):02d}"
    except Exception:  # noqa: BLE001
        return None


def fetch_master(client, symbol: str) -> list[dict]:
    """Newest-first list of quarters: {iso, label, promoter, public, xbrl}."""
    try:
        rows = client.get_json(MASTER_URL.format(sym=symbol))
    except Exception:  # noqa: BLE001
        return []
    out = []
    for r in rows or []:
        iso = _iso_quarter(r.get("date") or "")
        if not iso:
            continue
        out.append({
            "iso": iso,
            "label": r.get("date"),
            "promoter": _f(r.get("pr_and_prgrp")),
            "public": _f(r.get("public_val")),
            "xbrl": r.get("xbrl"),
        })
    out.sort(key=lambda x: x["iso"], reverse=True)
    return out


def _f(v):
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None


def _pct_map(text: str) -> dict[str, float]:
    m = {}
    for ctx, val in _PCT_RE.findall(text):
        if ctx not in m:  # first (aggregate) wins
            try:
                m[ctx] = float(val)
            except ValueError:
                pass
    return m


_CTX_PUBLIC_TOTAL = "PublicShareholding_ContextI"


def _sum_parts(pm: dict[str, float], parts) -> float | None:
    """Raw (un-scaled) sum of the given contexts, or None if none present."""
    present = [pm[c] for c in parts if c in pm]
    return sum(present) if present else None


def _scale(pm: dict[str, float]) -> float:
    """Filings are inconsistent: some express holdings as a fraction (0.50) and
    some as a percent (50.0). Promoter + Public must total the whole company, so
    if that base is ~1 we're in fractions (×100), else already percent (×1)."""
    base = (pm.get(_CTX_PROMOTER) or 0) + (pm.get(_CTX_PUBLIC_TOTAL) or 0)
    if not base:  # fall back to the largest single aggregate we can see
        base = max([pm.get(_CTX_FII, 0), pm.get(_CTX_DII, 0), pm.get(_CTX_PUBLIC_RETAIL, 0)] or [0])
    return 100.0 if 0 < base <= 1.5 else 1.0


def parse_xbrl(text: str) -> dict | None:
    """Extract {promoter, fii, dii, public, total_shares} (percentages 0-100)."""
    pm = _pct_map(text)
    if not pm:
        return None
    s = _scale(pm)
    promoter = pm.get(_CTX_PROMOTER)
    fii = pm.get(_CTX_FII)
    if fii is None:
        fii = _sum_parts(pm, _CTX_FII_PARTS)
    dii = pm.get(_CTX_DII)
    if dii is None:
        dii = _sum_parts(pm, _CTX_DII_PARTS)
    public = pm.get(_CTX_PUBLIC_RETAIL)
    rec = {
        "promoter": round(promoter * s, 2) if promoter is not None else None,
        "fii": round(fii * s, 2) if fii is not None else None,
        "dii": round(dii * s, 2) if dii is not None else None,
        "public": round(public * s, 2) if public is not None else None,
        "total_shares": None,
    }
    shares = {}
    for ctx, val in _SHARES_RE.findall(text):
        shares.setdefault(ctx, int(val))
    rec["total_shares"] = shares.get(_CTX_TOTAL_SHARES) or (max(shares.values()) if shares else None)
    # Need at least one institutional split to be useful.
    if rec["fii"] is None and rec["dii"] is None:
        return None
    return rec


def build_for_symbol(client, symbol: str, quarters: int = 5, pause: float = 0.4) -> list[dict]:
    """Return up-to-`quarters` recent quarter records (newest-first):
    {date, symbol, promoter_pct, fii_pct, dii_pct, public_pct, total_shares}.

    Falls back to the master's Promoter/Public when an XBRL is missing so the
    Promoter/Public trend stays continuous even if a detail file 404s.
    """
    master = fetch_master(client, symbol)
    if not master:
        return []
    out = []
    for q in master[:quarters]:
        rec = {"date": q["iso"], "symbol": symbol,
               "promoter_pct": q["promoter"], "fii_pct": None, "dii_pct": None,
               "public_pct": q["public"], "total_shares": None}
        url = q.get("xbrl")
        if url:
            try:
                xb = parse_xbrl(client.get_bytes(url).decode("utf-8", "replace"))
            except Exception:  # noqa: BLE001
                xb = None
            if xb:
                rec["promoter_pct"] = xb["promoter"] if xb["promoter"] is not None else rec["promoter_pct"]
                rec["fii_pct"] = xb["fii"]
                rec["dii_pct"] = xb["dii"]
                rec["public_pct"] = xb["public"] if xb["public"] is not None else rec["public_pct"]
                rec["total_shares"] = xb["total_shares"]
            time.sleep(pause)
        out.append(rec)
    return out
