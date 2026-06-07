"""Parse raw NSE report files into normalized Python dicts."""
from __future__ import annotations

import csv
import io
import json
import zipfile
from pathlib import Path


def _f(v) -> float | None:
    """Lenient float: handles '-', blanks, commas, surrounding spaces."""
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if s in ("", "-", "NA", "nan"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _i(v) -> int | None:
    f = _f(v)
    return int(f) if f is not None else None


def parse_delivery(path: Path) -> list[dict]:
    """sec_bhavdata_full: per-security price, volume, delivery qty & %.
    Header/values have leading spaces, so we strip keys and values."""
    rows: list[dict] = []
    with open(path, newline="") as fh:
        reader = csv.reader(fh)
        header = [h.strip() for h in next(reader)]
        idx = {name: i for i, name in enumerate(header)}

        def g(r, name):
            return r[idx[name]].strip() if name in idx and idx[name] < len(r) else ""

        for r in reader:
            if not r:
                continue
            series = g(r, "SERIES")
            if series not in ("EQ", "BE"):  # tradable equity series only
                continue
            prev = _f(g(r, "PREV_CLOSE"))
            close = _f(g(r, "CLOSE_PRICE"))
            pct = ((close - prev) / prev * 100) if (prev and close) else None
            rows.append({
                "symbol": g(r, "SYMBOL"),
                "series": series,
                "prev_close": prev,
                "open": _f(g(r, "OPEN_PRICE")),
                "high": _f(g(r, "HIGH_PRICE")),
                "low": _f(g(r, "LOW_PRICE")),
                "close": close,
                "pct_change": round(pct, 2) if pct is not None else None,
                "volume": _i(g(r, "TTL_TRD_QNTY")),
                "turnover_lacs": _f(g(r, "TURNOVER_LACS")),
                "trades": _i(g(r, "NO_OF_TRADES")),
                "deliv_qty": _i(g(r, "DELIV_QTY")),
                "deliv_pct": _f(g(r, "DELIV_PER")),
            })
    return rows


_MONTHS = {m: f"{i:02d}" for i, m in enumerate(
    ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}


def _deal_date_iso(s: str) -> str | None:
    """'05-JUN-2026' -> '2026-06-05'."""
    s = (s or "").strip()
    try:
        dd, mon, yyyy = s.split("-")
        return f"{yyyy}-{_MONTHS[mon.upper()]}-{int(dd):02d}"
    except Exception:  # noqa: BLE001
        return None


def _parse_deals(path: Path) -> list[dict]:
    """Bulk/block files are rolling (~2 weeks) and carry each deal's own date,
    so we extract the real date per row rather than using the download date."""
    rows: list[dict] = []
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            r = {(k or "").strip(): (v or "").strip() for k, v in r.items()}
            sym = r.get("Symbol")
            if not sym:
                continue
            rows.append({
                "date": _deal_date_iso(r.get("Date")),
                "symbol": sym,
                "security": r.get("Security Name"),
                "client": r.get("Client Name"),
                "side": (r.get("Buy/Sell") or "").upper(),
                "qty": _i(r.get("Quantity Traded")),
                "price": _f(r.get("Trade Price / Wght. Avg. Price")),
            })
    return rows


def parse_bulk(path: Path) -> list[dict]:
    return _parse_deals(path)


def parse_block(path: Path) -> list[dict]:
    return _parse_deals(path)


def parse_fiidii_data(data: list) -> list[dict]:
    out = []
    for row in data:
        out.append({
            "category": row.get("category"),
            "date": _deal_date_iso(row.get("date")),
            "buy": _f(row.get("buyValue")),
            "sell": _f(row.get("sellValue")),
            "net": _f(row.get("netValue")),
        })
    return out


def parse_fiidii(path: Path) -> list[dict]:
    return parse_fiidii_data(json.loads(Path(path).read_text()))


def _nsdl_num(s) -> float | None:
    """NSDL formats: '(4075.06)' = negative, 'Rs.95.7425', commas, blanks."""
    if s is None:
        return None
    s = str(s).strip().replace(",", "").replace("Rs.", "").replace("$", "")
    if s in ("", "-", "NA"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        v = float(s)
        return -v if neg else v
    except ValueError:
        return None


def parse_nsdl_fpi(html: str) -> dict | None:
    """NSDL 'Daily Trends in FPI Investments' page. Returns per-instrument net
    flows (Equity / Debt / Hybrid) in Rs Crore — the asset-class destination of
    FPI money. The page lists, per instrument, two route rows (Stock Exchange,
    Primary market) then a Sub-total row with gross buy/sell/net/net-USD."""
    import re
    cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", html, re.S | re.I)
    clean = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
    clean = [c for c in clean if c]

    date = None
    for c in clean:
        m = re.search(r"Investments on\s+(\d{2}-\w{3}-\d{4})", c)
        if m:
            date = _deal_date_iso(m.group(1).upper())
            break

    instruments = {"Equity", "Debt-General Limit", "Debt-VRR", "Debt-FAR", "Hybrid"}
    rows, cur = [], None
    i = 0
    while i < len(clean):
        c = clean[i]
        if c in instruments:
            cur = c
        elif c == "Sub-total" and cur:
            nums = []
            j = i + 1
            while j < len(clean) and len(nums) < 4:
                v = _nsdl_num(clean[j])
                if v is not None:
                    nums.append(v)
                    j += 1
                    continue
                break
            if len(nums) >= 3:
                rows.append({"instrument": cur, "gross_buy": nums[0],
                             "gross_sell": nums[1], "net": nums[2],
                             "net_usd": nums[3] if len(nums) > 3 else None})
            cur = None
        i += 1
    if not date or not rows:
        return None
    return {"date": date, "instruments": rows}


_FII_DERIV_CATS = ("INDEX FUTURES", "INDEX OPTIONS", "STOCK FUTURES", "STOCK OPTIONS")


def parse_fii_deriv(data: bytes) -> dict | None:
    """NSE 'FII Derivatives Statistics' .xls (BIFF). FII buy/sell/OI per F&O
    instrument category. We keep the 4 top categories (the named index sub-rows
    are their components, so summing all would double-count). 'net' = buy − sell
    in ₹ Crore — positive = FII net long that category."""
    import re
    import xlrd
    book = xlrd.open_workbook(file_contents=data)
    sh = book.sheet_by_index(0)
    date = None
    rows = []
    for ri in range(sh.nrows):
        cells = sh.row_values(ri)
        label = str(cells[0]).strip().upper()
        if label.startswith("FII DERIVATIVES STATISTICS FOR"):
            m = re.search(r"(\d{2}-\w{3}-\d{4})", label)
            if m:
                date = _deal_date_iso(m.group(1))
        elif label in _FII_DERIV_CATS:
            bc, ba, sc, sa, oc, oa = (cells[1:7] + [""] * 6)[:6]
            buy_amt, sell_amt = _f(ba), _f(sa)
            rows.append({
                "instrument": label.title(),
                "buy_contracts": _i(bc), "buy_amt": buy_amt,
                "sell_contracts": _i(sc), "sell_amt": sell_amt,
                "oi_contracts": _i(oc), "oi_amt": _f(oa),
                "net": round(buy_amt - sell_amt, 2)
                if buy_amt is not None and sell_amt is not None else None,
            })
    if not date or not rows:
        return None
    return {"date": date, "rows": rows}


def parse_mc_fiidii(html: str) -> list[dict]:
    """Moneycontrol cash FII/DII page embeds the last ~30 sessions in a Next.js
    __NEXT_DATA__ JSON blob (buy/sell/net for both FII and DII, ₹ Cr). Cash
    FII/DII has no NSE history, so this third-party feed seeds the recent window;
    values match NSE's published figures. Returns store_fiidii-compatible rows."""
    import re
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return []
    try:
        blob = json.loads(m.group(1))
        rows_in = blob["props"]["pageProps"]["FiiDiiData"]["fiiDiiData"]
    except (KeyError, ValueError):
        return []
    out: list[dict] = []
    for r in rows_in:
        date = (r.get("date") or "").strip()
        if not re.match(r"\d{4}-\d{2}-\d{2}", date):
            continue
        out.append({"date": date, "category": "FII/FPI",
                    "buy": _f(r.get("fiiPurchase")), "sell": _f(r.get("fiiSales")),
                    "net": _f(r.get("fiiNet"))})
        out.append({"date": date, "category": "DII",
                    "buy": _f(r.get("diiPurchase")), "sell": _f(r.get("diiSale")),
                    "net": _f(r.get("diiNet"))})
    return out


_CAT_MONTHS = {m: i for i, m in enumerate(
    ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}


def parse_cat_turnover(data: bytes) -> dict | None:
    """NSE 'Category-wise Turnover' .xls (BIFF). Two reconciled, official pieces:
      • Daily sheet -> that session's FPI buy/sell (NSDL-confirmed cash FII).
      • Historical sheet -> monthly Total-DII buy/sell/net back to Jan 2021.
    These differ from the provisional same-day FII/DII; the file is date-
    addressed, so it backfills for years. Returns
    {date, fpi:{buy,sell,net}, dii_monthly:[{month,buy,sell,net}]}."""
    import re
    import xlrd
    book = xlrd.open_workbook(file_contents=data)

    def month_of(label: str) -> str | None:
        m = re.match(r"\s*([A-Za-z]+)\s*'?\s*(\d{2})\s*$", label or "")
        if not m:
            return None
        num = _CAT_MONTHS.get(m.group(1)[:3].upper())
        return f"20{m.group(2)}-{num:02d}" if num else None

    def serial_to_iso(v):
        if isinstance(v, (int, float)) and v > 40000:
            return xlrd.xldate.xldate_as_datetime(v, book.datemode).date().isoformat()
        return None

    # --- daily reconciled FPI (sheet 0 "Daily") ---
    sh = book.sheet_by_index(0)
    fpi = date = None
    for ri in range(sh.nrows):
        row = sh.row_values(ri)
        if len(row) < 4:
            continue
        if str(row[1]).strip().upper() == "FPI":
            buy, sell = _f(row[2]), _f(row[3])
            if buy is not None and sell is not None:
                fpi = {"buy": buy, "sell": sell, "net": round(buy - sell, 2)}
            date = serial_to_iso(row[0]) or date
    if date is None:
        for ri in range(sh.nrows):
            r0 = sh.row_values(ri)
            iso = serial_to_iso(r0[0]) if r0 else None
            if iso:
                date = iso
                break

    # --- monthly reconciled DII (sheet 1 "Historical": Total DII = cols 11/12/13) ---
    dii_monthly = []
    if book.nsheets > 1:
        hs = book.sheet_by_index(1)
        for ri in range(hs.nrows):
            row = hs.row_values(ri)
            mon = month_of(str(row[0])) if row else None
            if not mon:
                continue
            buy = _f(row[11]) if len(row) > 11 else None
            sell = _f(row[12]) if len(row) > 12 else None
            net = _f(row[13]) if len(row) > 13 else None
            if buy is None and sell is None and net is None:
                continue
            if net is None and buy is not None and sell is not None:
                net = round(buy - sell, 2)
            dii_monthly.append({"month": mon, "buy": buy, "sell": sell, "net": net})

    if not date and not dii_monthly:
        return None
    return {"date": date, "fpi": fpi, "dii_monthly": dii_monthly}


def parse_high52(path: Path) -> list[dict]:
    """52-week high/low file. First two lines are disclaimer + 'Effective for…',
    real header is on the third line."""
    rows: list[dict] = []
    with open(path, newline="") as fh:
        lines = fh.read().splitlines()
    # find the header row (contains SYMBOL)
    start = next((i for i, ln in enumerate(lines) if ln.upper().startswith('"SYMBOL"')
                  or ln.upper().startswith("SYMBOL")), 2)
    reader = csv.DictReader(lines[start:])
    for r in reader:
        r = {(k or "").strip().strip('"'): (v or "").strip().strip('"') for k, v in r.items()}
        sym = r.get("SYMBOL")
        if not sym or (r.get("SERIES") or "").strip() not in ("EQ", "BE", ""):
            continue
        rows.append({
            "symbol": sym,
            "wk_high": _f(r.get("Adjusted_52_Week_High")),
            "wk_low": _f(r.get("Adjusted_52_Week_Low")),
        })
    return rows


def parse_indices(data: list) -> list[dict]:
    out = []
    for r in data:
        out.append({
            "index": r.get("indexSymbol") or r.get("index"),
            "last": _f(r.get("last")),
            "pct": _f(r.get("percentChange")),
            "year_high": _f(r.get("yearHigh")),
            "year_low": _f(r.get("yearLow")),
            "pchg30d": _f(r.get("perChange30d")),
            "pchg365d": _f(r.get("perChange365d")),
            "advances": _i(r.get("advances")),
            "declines": _i(r.get("declines")),
            "pe": _f(r.get("pe")),
        })
    return out


# Futures instrument types in the UDiFF F&O bhavcopy.
_FUT_TYPES = {"STF", "IDF"}  # stock futures, index futures


def parse_fo(path: Path) -> list[dict]:
    """F&O bhavcopy zip -> per-futures-contract OI rows (futures only)."""
    with zipfile.ZipFile(path) as z:
        name = z.namelist()[0]
        text = z.read(name).decode("utf-8", "replace")
    rows: list[dict] = []
    reader = csv.DictReader(io.StringIO(text))
    for r in reader:
        if r.get("FinInstrmTp") not in _FUT_TYPES:
            continue
        rows.append({
            "symbol": (r.get("TckrSymb") or "").strip(),
            "instr": r.get("FinInstrmTp"),
            "expiry": r.get("XpryDt"),
            "close": _f(r.get("ClsPric")),
            "prev_close": _f(r.get("PrvsClsgPric")),
            "underlying": _f(r.get("UndrlygPric")),
            "oi": _i(r.get("OpnIntrst")),
            "oi_change": _i(r.get("ChngInOpnIntrst")),
            "volume": _i(r.get("TtlTradgVol")),
        })
    return rows
