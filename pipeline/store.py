"""SQLite persistence. History accumulates across daily runs so the analyzer
can compute rolling averages and trends. All writes are idempotent upserts
keyed by (symbol, date) — re-running a date overwrites cleanly."""
from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "nse.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS delivery_daily (
    date TEXT, symbol TEXT, series TEXT,
    prev_close REAL, open REAL, high REAL, low REAL, close REAL,
    pct_change REAL, volume INTEGER, turnover_lacs REAL, trades INTEGER,
    deliv_qty INTEGER, deliv_pct REAL,
    PRIMARY KEY (date, symbol)
);
CREATE INDEX IF NOT EXISTS idx_delivery_symbol ON delivery_daily(symbol);

CREATE TABLE IF NOT EXISTS fiidii_daily (
    date TEXT, category TEXT, buy REAL, sell REAL, net REAL,
    PRIMARY KEY (date, category)
);

CREATE TABLE IF NOT EXISTS bulk_deals (
    date TEXT, symbol TEXT, client TEXT, side TEXT, qty INTEGER, price REAL,
    security TEXT,
    PRIMARY KEY (date, symbol, client, side, qty)
);

CREATE TABLE IF NOT EXISTS block_deals (
    date TEXT, symbol TEXT, client TEXT, side TEXT, qty INTEGER, price REAL,
    security TEXT,
    PRIMARY KEY (date, symbol, client, side, qty)
);

CREATE TABLE IF NOT EXISTS fo_oi_daily (
    date TEXT, symbol TEXT, expiry TEXT, instr TEXT,
    close REAL, prev_close REAL, underlying REAL,
    oi INTEGER, oi_change INTEGER, volume INTEGER,
    PRIMARY KEY (date, symbol, expiry, instr)
);

-- Latest 52-week high/low level per symbol (refreshed each run).
CREATE TABLE IF NOT EXISTS wk52 (
    symbol TEXT PRIMARY KEY, wk_high REAL, wk_low REAL, date TEXT
);

-- Symbol -> company name from NSE's equity master (the whole listed universe).
-- Refreshed each run; used to show full company names on hover in the UI.
CREATE TABLE IF NOT EXISTS securities (
    symbol TEXT PRIMARY KEY, company TEXT, series TEXT, isin TEXT
);

-- Symbol -> index membership, one row per (symbol, index). Built from NSE's
-- published index constituent CSVs. cap_tier is the SEBI size class derived
-- from tier-index membership (Large/Mid/Small/Micro). Cleared & rebuilt each run.
CREATE TABLE IF NOT EXISTS index_membership (
    symbol TEXT, "index" TEXT, industry TEXT,
    PRIMARY KEY (symbol, "index")
);

-- Index snapshots (broad + sector + India VIX). History builds going forward.
CREATE TABLE IF NOT EXISTS indices_daily (
    date TEXT, "index" TEXT, last REAL, pct REAL,
    year_high REAL, year_low REAL, pchg30d REAL, pchg365d REAL,
    advances INTEGER, declines INTEGER, pe REAL,
    PRIMARY KEY (date, "index")
);

-- FII derivatives stats per F&O category (Index/Stock Futures/Options), ₹ Cr.
-- net = buy_amt - sell_amt. The only date-addressed FII history NSE publishes.
CREATE TABLE IF NOT EXISTS fii_deriv_daily (
    date TEXT, instrument TEXT,
    buy_contracts INTEGER, buy_amt REAL,
    sell_contracts INTEGER, sell_amt REAL,
    oi_contracts INTEGER, oi_amt REAL, net REAL,
    PRIMARY KEY (date, instrument)
);

-- NSDL daily FPI flows by instrument (Equity / Debt-* / Hybrid), ₹ Crore.
-- net_usd is the same net in USD million. Destination of foreign money.
CREATE TABLE IF NOT EXISTS fpi_nsdl_daily (
    date TEXT, instrument TEXT,
    gross_buy REAL, gross_sell REAL, net REAL, net_usd REAL,
    PRIMARY KEY (date, instrument)
);

-- Reconciled cash FII = NSDL-confirmed FPI from NSE's Category-wise Turnover
-- daily report (₹ Cr). Differs from the same-day provisional figure; date-
-- addressed, so backfillable for years. net = buy - sell.
CREATE TABLE IF NOT EXISTS cat_fpi_daily (
    date TEXT PRIMARY KEY, buy REAL, sell REAL, net REAL
);

-- Reconciled DII monthly (Total DII = Banks+DFI+Insurance+MF+NPS), ₹ Cr, from
-- the Category-wise Turnover historical sheet (back to Jan 2021). month=YYYY-MM.
CREATE TABLE IF NOT EXISTS cat_dii_monthly (
    month TEXT PRIMARY KEY, buy REAL, sell REAL, net REAL
);

-- Past IPO issues from NSE's public-past-issues API: issue price + listing date
-- per recently listed symbol. Joined to delivery_daily to score post-listing
-- behaviour (the IPO Radar). board: Mainboard (EQ) / SME / Other.
CREATE TABLE IF NOT EXISTS ipo_issues (
    symbol TEXT PRIMARY KEY, company TEXT, security_type TEXT, board TEXT,
    issue_price REAL, price_range TEXT, listing_date TEXT,
    ipo_start TEXT, ipo_end TEXT, fetched_at TEXT
);

-- Quarterly shareholding pattern per symbol (Promoter / FII / DII / Public %),
-- from NSE's shareholding-master + the detailed XBRL filing. date = quarter-end
-- (YYYY-MM-DD). total_shares is the company's fully-paid equity count, used to
-- turn a holding-% change into an estimated ₹ flow. Idempotent per (date,symbol).
CREATE TABLE IF NOT EXISTS shareholding_quarterly (
    date TEXT, symbol TEXT,
    promoter_pct REAL, fii_pct REAL, dii_pct REAL, public_pct REAL,
    total_shares INTEGER,
    PRIMARY KEY (date, symbol)
);
CREATE INDEX IF NOT EXISTS idx_shp_symbol ON shareholding_quarterly(symbol);

-- Open / upcoming IPOs from NSE's all-upcoming-issues + ipo-current-issue APIs.
-- sub_times = live subscription multiple (Total). Refreshed each run; the whole
-- table is cleared and repopulated since the open set changes daily.
CREATE TABLE IF NOT EXISTS ipo_upcoming (
    symbol TEXT PRIMARY KEY, company TEXT, series TEXT, board TEXT,
    price_range TEXT, issue_size TEXT, issue_start TEXT, issue_end TEXT,
    status TEXT, sub_times REAL, shares_offered REAL, shares_bid REAL,
    fetched_at TEXT
);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def _upsert(con, table, cols, rows, date, extra=None):
    if not rows:
        return 0
    extra = extra or {}
    allcols = ["date"] + cols + list(extra.keys())
    placeholders = ",".join("?" * len(allcols))
    sql = f"INSERT OR REPLACE INTO {table} ({','.join(allcols)}) VALUES ({placeholders})"
    payload = []
    for r in rows:
        payload.append([date] + [r.get(c) for c in cols] + list(extra.values()))
    con.executemany(sql, payload)
    return len(payload)


def store_delivery(con, rows, date):
    cols = ["symbol", "series", "prev_close", "open", "high", "low", "close",
            "pct_change", "volume", "turnover_lacs", "trades", "deliv_qty", "deliv_pct"]
    return _upsert(con, "delivery_daily", cols, rows, date)


def store_fiidii(con, rows, date=None):
    # Each FII/DII row carries its own date (the API's reported session).
    cols = ["category", "buy", "sell", "net"]
    payload = [[r.get("date"), r.get("category"), r.get("buy"), r.get("sell"), r.get("net")]
               for r in rows if r.get("date")]
    if not payload:
        return 0
    con.executemany(
        "INSERT OR REPLACE INTO fiidii_daily (date,category,buy,sell,net) VALUES (?,?,?,?,?)",
        payload)
    return len(payload)


def _store_deals(con, table, rows):
    """Deals carry their own per-row date (rolling file spans ~2 weeks)."""
    cols = ["symbol", "client", "side", "qty", "price", "security"]
    payload = [[r.get("date")] + [r.get(c) for c in cols]
               for r in rows if r.get("date")]
    if not payload:
        return 0
    sql = (f"INSERT OR REPLACE INTO {table} (date,{','.join(cols)}) "
           f"VALUES ({','.join('?' * (len(cols) + 1))})")
    con.executemany(sql, payload)
    return len(payload)


def store_bulk(con, rows, date=None):
    return _store_deals(con, "bulk_deals", rows)


def store_block(con, rows, date=None):
    return _store_deals(con, "block_deals", rows)


def store_fo(con, rows, date):
    cols = ["symbol", "expiry", "instr", "close", "prev_close",
            "underlying", "oi", "oi_change", "volume"]
    return _upsert(con, "fo_oi_daily", cols, rows, date)


def store_securities(con, rows):
    """rows = [{symbol, company, series, isin}]. Idempotent upsert."""
    payload = [[r["symbol"], r.get("company"), r.get("series"), r.get("isin")]
               for r in rows if r.get("symbol")]
    if not payload:
        return 0
    con.executemany(
        "INSERT OR REPLACE INTO securities (symbol,company,series,isin) VALUES (?,?,?,?)",
        payload)
    return len(payload)


def store_index_membership(con, rows):
    """rows = [{symbol, index, industry}]. Full-rebuild: clears then inserts."""
    con.execute("DELETE FROM index_membership")
    payload = [[r["symbol"], r["index"], r.get("industry")]
               for r in rows if r.get("symbol") and r.get("index")]
    if not payload:
        return 0
    con.executemany(
        'INSERT OR REPLACE INTO index_membership (symbol,"index",industry) VALUES (?,?,?)',
        payload)
    return len(payload)


def store_wk52(con, rows, date):
    payload = [[r["symbol"], r.get("wk_high"), r.get("wk_low"), date]
               for r in rows if r.get("symbol")]
    if not payload:
        return 0
    con.executemany(
        "INSERT OR REPLACE INTO wk52 (symbol,wk_high,wk_low,date) VALUES (?,?,?,?)", payload)
    return len(payload)


def store_fii_deriv(con, parsed):
    """parsed = {"date": iso, "rows": [{instrument, buy_amt, ..., net}]}."""
    if not parsed or not parsed.get("date") or not parsed.get("rows"):
        return 0
    date = parsed["date"]
    cols = ["instrument", "buy_contracts", "buy_amt", "sell_contracts",
            "sell_amt", "oi_contracts", "oi_amt", "net"]
    payload = [[date] + [r.get(c) for c in cols] for r in parsed["rows"]]
    con.executemany(
        f"INSERT OR REPLACE INTO fii_deriv_daily (date,{','.join(cols)}) "
        f"VALUES ({','.join('?' * (len(cols) + 1))})", payload)
    return len(payload)


def store_fpi_nsdl(con, parsed):
    """parsed = {"date": iso, "instruments": [{instrument, gross_buy, ...}]}.
    Each NSDL page carries its own session date, so we key off parsed["date"]."""
    if not parsed or not parsed.get("date") or not parsed.get("instruments"):
        return 0
    date = parsed["date"]
    cols = ["instrument", "gross_buy", "gross_sell", "net", "net_usd"]
    payload = [[date] + [r.get(c) for c in cols] for r in parsed["instruments"]]
    con.executemany(
        f"INSERT OR REPLACE INTO fpi_nsdl_daily (date,{','.join(cols)}) "
        f"VALUES ({','.join('?' * (len(cols) + 1))})", payload)
    return len(payload)


def store_cat_turnover(con, parsed):
    """parsed = {"date": iso, "fpi": {buy,sell,net}, "dii_monthly": [{month,buy,sell,net}]}.
    Stores reconciled daily FPI (one row) and monthly DII (back to 2021)."""
    n = 0
    if parsed and parsed.get("date") and parsed.get("fpi"):
        f = parsed["fpi"]
        con.execute(
            "INSERT OR REPLACE INTO cat_fpi_daily (date,buy,sell,net) VALUES (?,?,?,?)",
            [parsed["date"], f.get("buy"), f.get("sell"), f.get("net")])
        n += 1
    months = (parsed or {}).get("dii_monthly") or []
    if months:
        con.executemany(
            "INSERT OR REPLACE INTO cat_dii_monthly (month,buy,sell,net) VALUES (?,?,?,?)",
            [[m["month"], m.get("buy"), m.get("sell"), m.get("net")] for m in months])
        n += len(months)
    return n


def store_shareholding(con, rows):
    """rows = [{date, symbol, promoter_pct, fii_pct, dii_pct, public_pct, total_shares}].
    Each row carries its own quarter-end date; idempotent per (date, symbol)."""
    cols = ["date", "symbol", "promoter_pct", "fii_pct", "dii_pct", "public_pct", "total_shares"]
    payload = [[r.get(c) for c in cols] for r in rows if r.get("date") and r.get("symbol")]
    if not payload:
        return 0
    con.executemany(
        f"INSERT OR REPLACE INTO shareholding_quarterly ({','.join(cols)}) "
        f"VALUES ({','.join('?' * len(cols))})", payload)
    return len(payload)


def store_indices(con, rows, date):
    cols = ['"index"', "last", "pct", "year_high", "year_low",
            "pchg30d", "pchg365d", "advances", "declines", "pe"]
    keys = ["index", "last", "pct", "year_high", "year_low",
            "pchg30d", "pchg365d", "advances", "declines", "pe"]
    payload = [[date] + [r.get(k) for k in keys] for r in rows if r.get("index")]
    if not payload:
        return 0
    con.executemany(
        f"INSERT OR REPLACE INTO indices_daily (date,{','.join(cols)}) "
        f"VALUES ({','.join('?' * (len(cols) + 1))})", payload)
    return len(payload)
