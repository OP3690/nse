import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // allow a slow refresh to finish (seconds)

// Locate scripts/refresh.sh independent of where `next` was started. We try, in
// order: NSE_FLOW_ROOT, dirs walked up from this route file's own location, then
// dirs walked up from the working dir. The file-anchored path makes the in-app
// Sync button work even when the dev server's cwd is outside the repo.
function resolveScript() {
  const candidates = [];
  if (process.env.NSE_FLOW_ROOT) candidates.push(process.env.NSE_FLOW_ROOT);

  const walkUp = (start, n) => {
    let dir = start;
    for (let i = 0; i < n; i++) {
      candidates.push(dir);
      dir = path.dirname(dir);
    }
  };

  // This file lives at <root>/web/app/api/sync/route.js in dev — walk up to <root>.
  try {
    walkUp(path.dirname(fileURLToPath(import.meta.url)), 7);
  } catch {
    /* import.meta.url unavailable (e.g. bundled) — fall through to cwd */
  }
  walkUp(process.cwd(), 6);

  for (const root of candidates) {
    const p = path.join(root, "scripts", "refresh.sh");
    if (existsSync(p)) return p;
  }
  return null;
}

const SCRIPT = resolveScript();
// Repo root = the parent of the scripts/ dir holding refresh.sh. The script
// cd's to its own location, but we still launch it from the repo root.
const ROOT = SCRIPT ? path.dirname(path.dirname(SCRIPT)) : process.cwd();

// Cloud trigger: on a hosted/serverless deploy (Vercel) there's no Python
// pipeline, so instead of running it we ask GitHub to run the existing refresh
// workflow (which has the cached DB + an unblocked IP) via a repository_dispatch.
// Enabled only when GH_DISPATCH_TOKEN is set in the host's env.
const GH = {
  token: process.env.GH_DISPATCH_TOKEN,
  repo: process.env.GH_REPO || "OP3690/nse",
  eventType: process.env.GH_DISPATCH_EVENT || "refresh",
};

// In-process single-flight guard. The shell script also holds a lockfile, but
// this gives the UI an immediate "already running" answer without spawning.
let running = false;

// Run the local pipeline by spawning scripts/refresh.sh (fast incremental
// refresh: last sessions + live snapshots + KNN Multibagger Radar + Mongo sync).
async function runLocal() {
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
    return NextResponse.json({ ok: true, mode: "local", elapsed, log: tail(result.out) });
  } finally {
    running = false;
  }
}

// Ask GitHub to run the refresh workflow on its runners, then return immediately
// (the run takes a couple of minutes; the UI polls/reloads afterwards).
async function dispatchCloud() {
  try {
    const res = await fetch(`https://api.github.com/repos/${GH.repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GH.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: GH.eventType }),
    });
    if (res.status === 204) {
      return NextResponse.json({
        ok: true,
        mode: "dispatched",
        message: "Refresh queued on the data runner — new numbers usually appear within ~3 minutes.",
      });
    }
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    return NextResponse.json(
      { ok: false, error: `Could not trigger the cloud refresh (GitHub ${res.status}).`, detail },
      { status: 502 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Could not reach GitHub to trigger the refresh.", detail: String(e) },
      { status: 502 },
    );
  }
}

// POST /api/sync — refresh the data. Local installs run the Python pipeline
// directly; hosted deploys with a GitHub token trigger the cloud workflow.
export async function POST() {
  if (SCRIPT && existsSync(SCRIPT)) return runLocal();
  if (GH.token) return dispatchCloud();
  return NextResponse.json(
    { ok: false, error: "Refresh script not found (this only works on a local install)." },
    { status: 501 },
  );
}
