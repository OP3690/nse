import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // allow a slow refresh to finish (seconds)

// Locate scripts/refresh.sh by walking up from the working dir, so this works
// whether the dev server was started in web/ or at the repo root. NSE_FLOW_ROOT
// overrides if set.
function resolveScript() {
  const candidates = [];
  if (process.env.NSE_FLOW_ROOT) candidates.push(process.env.NSE_FLOW_ROOT);
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    candidates.push(dir);
    dir = path.dirname(dir);
  }
  for (const root of candidates) {
    const p = path.join(root, "scripts", "refresh.sh");
    if (existsSync(p)) return p;
  }
  return null;
}

const SCRIPT = resolveScript();

// In-process single-flight guard. The shell script also holds a lockfile, but
// this gives the UI an immediate "already running" answer without spawning.
let running = false;

// POST /api/sync — run the fast incremental refresh (last sessions + live
// snapshots + KNN Multibagger Radar + emit JSON / Mongo sync). Local-only: the
// script and a Python pipeline must be present (won't work on a serverless host).
export async function POST() {
  if (!existsSync(SCRIPT)) {
    return NextResponse.json(
      { ok: false, error: "Refresh script not found (this only works on a local install)." },
      { status: 501 },
    );
  }
  if (running) {
    return NextResponse.json({ ok: false, error: "A sync is already in progress." }, { status: 409 });
  }

  running = true;
  const startedAt = Date.now();
  try {
    const result = await new Promise((resolve) => {
      const child = spawn("/bin/bash", [SCRIPT], { cwd: ROOT });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => { out += d.toString(); });
      child.stderr.on("data", (d) => { err += d.toString(); });
      child.on("error", (e) => resolve({ code: -1, out, err: String(e) }));
      child.on("close", (code) => resolve({ code, out, err }));
    });

    const tail = (s) => s.trim().split("\n").slice(-12).join("\n");
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (result.code !== 0) {
      return NextResponse.json(
        { ok: false, error: "Refresh failed.", code: result.code, log: tail(result.err || result.out), elapsed },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, elapsed, log: tail(result.out) });
  } finally {
    running = false;
  }
}
