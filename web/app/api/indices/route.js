import { NextResponse } from "next/server";
import path from "node:path";
import { execFile } from "node:child_process";
import { getLatest } from "../../lib/data";

export const dynamic = "force-dynamic";

// Live headline-index quotes (Nifty 50 / Sensex / India VIX) for the dashboard
// ticker. Three-tier sourcing, identical shape at every tier:
//
//   1. pipeline/live_indices.py — exchange-authoritative (NSE allIndices + BSE
//      IndexMovers). Needs a real Chrome TLS fingerprint, so it only works where
//      the pipeline runs (local / self-hosted). Skipped on Vercel.
//   2. Live web feeds reachable from anywhere, including Vercel's datacenter IPs
//      (NSE blocks those; it needs a Chrome TLS fingerprint). Nifty + India VIX
//      come from Yahoo's chart API; Sensex from BSE's own IndexMovers feed
//      (plain server fetch + Referer works — Yahoo's ^BSESN lags a session).
//   3. EOD snapshot stamped into latest.json / Mongo by the daily run.
//
// This is what makes the ticker live on Vercel: tier 1 is unreachable there, so
// tier 2 (Yahoo) carries it instead of falling straight through to the EOD tier.

const PYTHON_BIN = process.env.PYTHON_BIN || "/usr/bin/python3";
const PIPELINE_DIR =
  process.env.PIPELINE_DIR || path.join(process.cwd(), "..", "pipeline");
const CACHE_MS = 30_000; // don't re-hit upstreams more than ~2×/min

// Yahoo ticker -> dashboard tile metadata (label/decimals/invert mirror
// analyze.HEADLINE_INDICES so the rendered shape is identical to tiers 1 & 3).
// NOTE: Sensex is fetched from BSE's own API, NOT Yahoo — Yahoo's ^BSESN lags a
// full session (its regularMarketTime stays on yesterday's close), which would
// show a stale/wrong-direction quote. Yahoo's ^NSEI and ^INDIAVIX are live.
const YAHOO_INDICES = [
  { sym: "%5ENSEI", label: "Nifty 50", decimals: 2, invert: false },
  { sym: "%5EINDIAVIX", label: "India VIX", decimals: 2, invert: true },
];

// BSE's own IndexMovers feed (index 16 = S&P BSE SENSEX). Reachable from plain
// server-side fetch (incl. Vercel) with a Referer header — unlike NSE, which
// needs a real Chrome TLS fingerprint. Exchange-authoritative + live.
const BSE_SENSEX_URL =
  "https://api.bseindia.com/BseIndiaAPI/api/IndexMovers/w?cat=Top&indexcode=16&orderby=";

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

// Tier 2: live web sources reachable from anywhere (incl. Vercel) — Nifty/VIX
// from Yahoo, Sensex from BSE. Assembled in the dashboard's display order
// (Nifty, Sensex, India VIX); any tile that fails is simply dropped.
async function fetchLiveWeb() {
  const [yahoo, sensex] = await Promise.all([
    Promise.all(YAHOO_INDICES.map(fetchYahooOne)),
    fetchBseSensex(),
  ]);
  const by = {};
  for (const t of yahoo) if (t) by[t.label] = t;
  if (sensex) by[sensex.label] = sensex;
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
