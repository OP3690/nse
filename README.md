# NSE Flow

A local platform that downloads NSE end-of-day reports, analyzes **where
institutional money is flowing**, and surfaces high-probability accumulation
setups — built with a Python data pipeline and a Next.js dashboard.

> **Not investment advice.** Every signal here is a transparent, explainable
> observation of real order flow (delivery, FII/DII, open interest, bulk/block
> deals). It is decision *support*, not a prediction engine.

---

## What it tracks

| Report | Source | What it tells you |
|---|---|---|
| **Delivery bhavcopy** | `sec_bhavdata_full` | Delivery % + volume — real buying vs intraday churn |
| **FII / DII activity** | NSE JSON API | Net foreign vs domestic institutional flow |
| **Bulk & block deals** | `bulk.csv`, `block.csv` | Named institutions buying/selling in size |
| **F&O open interest** | F&O UDiFF bhavcopy | Long buildup, short covering, etc. |
| **Sector map** | Nifty 500 list | Sector rotation — which industries money rotates into |

## The "smart-money score"

A transparent 0–100 blend (weights auto-renormalize when data is missing):

- Delivery strength (30%) — high delivery % = conviction holding
- Delivery surge (20%) — delivery vs its 20-day average
- Volume surge (15%) — volume vs its 20-day average
- Price momentum (15%)
- OI signal (10%) — long buildup scores highest
- Institutional deals (10%) — net bulk/block buying

`Strong Accumulation` ≥ 75 · `Accumulation` ≥ 60 · `Distribution` ≤ 30 (and down).

---

## Setup (one time)

```bash
cd nse-flow
./scripts/setup.sh                       # venv + web deps
cd pipeline && ./.venv/bin/python backfill.py 20   # seed ~20 sessions of history
```

## Daily use

```bash
./scripts/run.sh                 # download + analyze the latest session
cd web && npm run dev            # open http://localhost:4321
```

Run a specific date: `./scripts/run.sh 2026-06-05`.

## Automate it (macOS launchd)

```bash
cp scripts/com.nseflow.daily.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.nseflow.daily.plist
```

Runs every weekday at 19:30 local (edit the plist for your timezone — NSE
publishes EOD files ~6–7 PM IST). Logs land in `logs/`.

Prefer cron? `crontab -e` and add:
```
30 19 * * 1-5 /Users/omprakashutaha/Desktop/nse-flow/scripts/run.sh
```

---

## How it fits together

```
NSE  ──download.py──►  data/raw/<date>/   ──ingest.py──►  SQLite (data/nse.db)
                                                              │
                                                        analyze.py
                                                              │
                                              web/data/latest.json + stocks/*.json
                                                              │
                                                   Next.js dashboard (web/)
```

- **`pipeline/`** — Python. `nse_client.py` uses `curl_cffi` (Chrome TLS
  impersonation) to get past NSE's Akamai bot wall. History accumulates in
  SQLite so rolling averages and trends improve every day.
- **`web/`** — Next.js (App Router, JavaScript, Tailwind, Recharts). Server
  components read the generated JSON fresh on each request, so a new daily run
  shows up without a rebuild.

## Notes & limits

- FII/DII history only grows from the day you start running (the API returns
  one session); delivery & F&O backfill ~2 weeks via dated archives.
- Bulk/block files are rolling (~2 weeks) and keyed by each deal's own date.
- ETFs / G-Secs are kept out of headline lists and the screener (they always
  show ~100% delivery) but remain in the raw database.
