import { NextResponse } from "next/server";
import path from "node:path";
import { execFile } from "node:child_process";
import { getLatest } from "../../lib/data";

export const dynamic = "force-dynamic";

// Live headline-index quotes (Nifty 50 / Sensex / India VIX) for the dashboard
// ticker. The exchange-authoritative source is NSE's allIndices feed, which
// only the pipeline can reach (it needs a real Chrome TLS fingerprint). So when
// running alongside the pipeline (local / self-hosted) we shell out to
// pipeline/live_indices.py for current quotes; everywhere else (e.g. Vercel,
// where NSE is unreachable) we fall back to the EOD snapshot the daily run
// stamped into latest.json / Mongo. Either way the shape is identical.

const PYTHON_BIN = process.env.PYTHON_BIN || "/usr/bin/python3";
const PIPELINE_DIR =
  process.env.PIPELINE_DIR || path.join(process.cwd(), "..", "pipeline");
const CACHE_MS = 30_000; // don't re-hit NSE more than ~2×/min

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

export async function GET() {
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_MS) {
    return NextResponse.json(
      { indices: cache.data, source: cache.source, ts: cache.ts },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Skip the spawn on Vercel — NSE is unreachable and python isn't bundled.
  let indices = process.env.VERCEL ? null : await fetchLive();
  let source = "live";

  if (!indices) {
    const latest = await getLatest();
    indices = latest?.headline_indices || [];
    source = "snapshot";
  }

  cache = { ts: now, data: indices, source };
  return NextResponse.json(
    { indices, source, ts: now },
    { headers: { "Cache-Control": "no-store" } }
  );
}
