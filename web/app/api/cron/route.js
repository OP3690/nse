import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Vercel Cron target. Vercel can't run the Python pipeline itself, so this just
// triggers the GitHub Actions workflow (repository_dispatch), which does the real
// fetch + analyze + KNN + Mongo sync. The deployed site then reads fresh Mongo.
//
// Required env on Vercel:
//   CRON_SECRET       — Vercel sends it as `Authorization: Bearer <CRON_SECRET>`.
//   GH_DISPATCH_TOKEN — a GitHub PAT with `repo`/`workflow` scope (fine-grained:
//                       "Contents: read & write" or Actions access on the repo).
//   GH_REPO           — "owner/name" (defaults to OP3690/nse).
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  const repo = process.env.GH_REPO || "OP3690/nse";
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "GH_DISPATCH_TOKEN not configured." },
      { status: 501 },
    );
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: "refresh" }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { ok: false, error: `GitHub dispatch failed (${res.status})`, detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, dispatched: "refresh", repo });
}
