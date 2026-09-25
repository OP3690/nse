import { NextResponse } from "next/server";
import { getLatest } from "../../lib/data";
import { buildRadarPicks } from "../../lib/radarPicks";

export const dynamic = "force-dynamic";

// GET /api/radar-picks -- the latest KNN Multibagger Radar picks, ranked by PROB.
export async function GET() {
  try {
    const out = buildRadarPicks(await getLatest());
    return NextResponse.json(out, {
      status: out.ok ? 200 : 503,
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "radar lookup failed" }, { status: 500 });
  }
}
