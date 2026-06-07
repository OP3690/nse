import { NextResponse } from "next/server";
import { getTooltips } from "../../lib/data";

export const dynamic = "force-dynamic";

// Compact per-symbol hover-card map. The client fetches this once (on first
// hover) and caches it, so symbol links across the app can show a rich tooltip
// without every page shipping the full map.
export async function GET() {
  const tooltips = await getTooltips();
  return NextResponse.json(tooltips, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
  });
}
