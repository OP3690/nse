import { NextResponse } from "next/server";
import path from "node:path";
import { execFile } from "node:child_process";
import { getLatest } from "../../lib/data";

export const dynamic = "force-dynamic";

// Live headline-index quotes (Nifty 50 / Sensex / India VIX) for the dashboard
// ticker. Sourced exchange-first, with identical tile shape at every tier:
//
//   1. pipeline/live_indices.py — exchange-authoritative via curl_cffi. Only
//      runs where the pipeline lives (local / self-hosted). Skipped on Vercel.
//   2. Exchange APIs fetched directly from Node (works on Vercel too): Nifty 50
//      and India VIX from NSE's allIndices (a homepage cookie warmup clears
//      NSE's Akamai wall — the block is cookie-based, not a TLS-fingerprint one,
//      so undici gets through), Sensex from BSE's IndexMovers feed. Yahoo's
//      chart API is a *fallback only* for Nifty/VIX if NSE is unreachable, since
//      Yahoo's Indian-index data is a session stale and its prev-close is wrong.
//   3. EOD snapshot stamped into latest.json / Mongo by the daily run.
//
// This is what makes the ticker live on Vercel: tier 1 is skipped there, so
// tier 2 carries it with real NSE/BSE quotes instead of the frozen EOD tier.

const PYTHON_BIN = process.env.PYTHON_BIN || "/usr/bin/python3";
const PIPELINE_DIR =
  process.env.PIPELINE_DIR || path.join(process.cwd(), "..", "pipeline");
const CACHE_MS = 30_000; // don't re-hit upstreams more than ~2×/min
const FETCH_TIMEOUT = 8_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// NSE allIndices — exchange-authoritative for Nifty 50 + India VIX. Needs a
// session cookie from the homepage; we cache it module-side to avoid warming up
// on every poll (serverless instances stay warm between requests).
const NSE_HOME = "https://www.nseindia.com/";
const NSE_ALL_INDICES = "https://www.nseindia.com/api/allIndices";
const NSE_COOKIE_TTL = 10 * 60 * 1000;
const NSE_PICKS = [
  ["NIFTY 50", "Nifty 50", false],
  ["INDIA VIX", "India VIX", true],
];
let nseCookie = { value: "", ts: 0 };

// BSE's own IndexMovers feed (index 16 = S&P BSE SENSEX). Reachable from a plain
// server fetch (incl. Vercel) with a Referer header. Exchange-authoritative.
const BSE_SENSEX_URL =
  "https://api.bseindia.com/BseIndiaAPI/api/IndexMovers/w?cat=Top&indexcode=16&orderby=";

// Yahoo fallback (Nifty/VIX only) — used only when NSE is unreachable.
const YAHOO_INDICES = [
  { sym: "%5ENSEI", label: "Nifty 50", decimals: 2, invert: false },
  { sym: "%5EINDIAVIX", label: "India VIX", decimals: 2, invert: true },
];

let cache = { ts: 0, data: null, source: null };

function fetchLive() {
  return new Promise((resolve) => {
    execFile(
      PYTHON_BIN,
      ["live_indices.py"],
      { cwd: PIPELINE_DIR, timeout: 12_000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const arr = JSON.parse(stdout);
          resolve(Array.isArray(arr) && arr.length ? arr : null);
        } catch {
          resolve(null);
        }
      }
    );
  });
}

// Warm (and cache) an NSE session cookie from the homepage. NSE's Akamai gate
// sets cookies even on its 403 challenge, and the JSON API accepts them — so one
// warmup unlocks subsequent allIndices calls. Cached module-side for NSE_COOKIE_TTL.
async function nseWarmup() {
  if (nseCookie.value && Date.now() - nseCookie.ts < NSE_COOKIE_TTL) return nseCookie.value;
  try {
    const w = await fetch(NSE_HOME, {
      cache: "no-store",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    const jar = (w.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
    if (jar) nseCookie = { value: jar, ts: Date.now() };
  } catch {
    /* keep any prior cookie */
  }
  return nseCookie.value;
}

// NSE allIndices -> Nifty 50 + India VIX tiles. Exchange-authoritative: `last` +
// `variation` (point change) + `percentChange` come straight from NSE. Returns a
// {label: tile} map, or null if NSE is unreachable (Vercel IP blocked, etc.).
async function fetchNseIndices() {
  try {
    const cookie = await nseWarmup();
    if (!cookie) return null;
    const r = await fetch(NSE_ALL_INDICES, {
      cache: "no-store",
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Referer: NSE_HOME,
        Cookie: cookie,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!r.ok) {
      nseCookie = { value: "", ts: 0 }; // force a fresh warmup next time
      return null;
    }
    const data = (await r.json())?.data;
    if (!Array.isArray(data)) return null;
    const out = {};
    for (const [key, label, invert] of NSE_PICKS) {
      const row = data.find((d) => (d.index || "").toUpperCase() === key);
      if (row && row.last != null) {
        out[label] = {
          label,
          last: +Number(row.last).toFixed(2),
          pct: row.percentChange != null ? +Number(row.percentChange).toFixed(2) : null,
          change: row.variation != null ? +Number(row.variation).toFixed(2) : null,
          decimals: 2,
          invert,
        };
      }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

async function fetchYahooOne({ sym, label, decimals, invert }) {
  // 5-day daily series, NOT range=1d: Yahoo's `chartPreviousClose` is frequently
  // off by one session for ^NSEI/^BSESN (it reports the close from two days ago),
  // which flips the % change sign. Deriving prev from the actual prior daily bar
  // is reliable and matches NSE's official figure.
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=5d&interval=1d`;
  try {
    const r = await fetch(url, {
      cache: "no-store",
      // A browser-ish UA avoids Yahoo's occasional 429/403 on bare requests.
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const res = (await r.json())?.chart?.result?.[0];
    const meta = res?.meta;
    const closes = (res?.indicators?.quote?.[0]?.close || []).filter((c) => c != null);
    const last = meta?.regularMarketPrice ?? closes[closes.length - 1];
    // Prior session's close: the second-to-last daily bar (the last bar is the
    // current/live session). Fall back to chartPreviousClose only if the series
    // is too short.
    const prev =
      closes.length >= 2 ? closes[closes.length - 2] : meta?.chartPreviousClose;
    if (last == null || !prev) return null;
    const change = +(last - prev).toFixed(2);
    const pct = +(((last - prev) / prev) * 100).toFixed(2);
    return { label, last: +Number(last).toFixed(2), pct, change, decimals, invert };
  } catch {
    return null;
  }
}

async function fetchBseSensex() {
  try {
    const r = await fetch(BSE_SENSEX_URL, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json, text/plain, */*",
        Referer: "https://www.bseindia.com/",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const row = (await r.json())?.Table?.[0];
    if (!row || row.LTP == null) return null;
    return {
      label: "Sensex",
      last: +Number(row.LTP).toFixed(2),
      pct: row.PERCENTCHG != null ? +Number(row.PERCENTCHG).toFixed(2) : null,
      change: row.change != null ? +Number(row.change).toFixed(2) : null,
      decimals: 2,
      invert: false,
    };
  } catch {
    return null;
  }
}

// Tier 2: live exchange APIs fetched directly (works on Vercel). Nifty 50 +
// India VIX from NSE, Sensex from BSE — both exchange-authoritative. Yahoo is a
// fallback only for whichever of Nifty/VIX NSE didn't return. Assembled in the
// dashboard's display order (Nifty, Sensex, India VIX).
async function fetchLiveWeb() {
  const [nse, sensex] = await Promise.all([fetchNseIndices(), fetchBseSensex()]);
  const by = {};
  if (nse) Object.assign(by, nse);
  if (sensex) by[sensex.label] = sensex;

  // Yahoo only fills NSE gaps (e.g. if NSE blocked the datacenter IP).
  if (!by["Nifty 50"] || !by["India VIX"]) {
    const yahoo = await Promise.all(YAHOO_INDICES.map(fetchYahooOne));
    for (const t of yahoo) if (t && !by[t.label]) by[t.label] = t;
  }

  const tiles = ["Nifty 50", "Sensex", "India VIX"].map((l) => by[l]).filter(Boolean);
  return tiles.length ? tiles : null;
}

export async function GET() {
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_MS) {
    return NextResponse.json(
      { indices: cache.data, source: cache.source, ts: cache.ts },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Tier 1: exchange-authoritative via the pipeline. Skipped on Vercel, where
  // NSE/BSE are unreachable and python isn't bundled.
  let indices = process.env.VERCEL ? null : await fetchLive();
  let source = "live";

  // Tier 2: live web sources (Yahoo + BSE) — reachable everywhere, incl. Vercel.
  if (!indices) {
    indices = await fetchLiveWeb();
    if (indices) source = "live";
  }

  // Tier 3: EOD snapshot from the daily run — the full fallback when no live
  // tier produced anything, and a per-tile backstop when a live tier produced
  // only some tiles (e.g. if BSE blocks a datacenter IP, Sensex falls back to
  // its EOD close rather than vanishing while Nifty/VIX stay live).
  if (!indices || indices.length < 3) {
    const snapshot = (await getLatest())?.headline_indices || [];
    if (!indices || !indices.length) {
      indices = snapshot;
      source = "snapshot";
    } else {
      const have = new Set(indices.map((t) => t.label));
      const byLabel = Object.fromEntries(snapshot.map((t) => [t.label, t]));
      indices = ["Nifty 50", "Sensex", "India VIX"]
        .map((l) => (have.has(l) ? indices.find((t) => t.label === l) : byLabel[l]))
        .filter(Boolean);
    }
  }

  cache = { ts: now, data: indices, source };
  return NextResponse.json(
    { indices, source, ts: now },
    { headers: { "Cache-Control": "no-store" } }
  );
}
