// Compact, machine-readable view of the KNN Multibagger Radar for other tools (e.g. the F&O bot's
// take-home investing). Only republishes what the Radar page already shows publicly: the radar's own
// top picks, plus the next-highest-PROB liquid names as fallbacks when a pick is too expensive.
const RUNNERS = 7;
const round = (v, n = 1) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(n)) : null);

export function buildRadarPicks(latest) {
  const mb = latest?.multibaggers;
  if (!latest || !mb || !mb.ok || !Array.isArray(mb.picks) || !mb.picks.length) {
    return { ok: false, error: "radar not available" };
  }
  const picks = mb.picks
    .filter((p) => p && p.symbol && Number.isFinite(p.prob) && Number.isFinite(p.close))
    .map((p) => ({
      symbol: String(p.symbol), company: p.company || null, prob: round(p.prob), close: round(p.close, 2),
      lift: round(p.lift, 2), confidence: round(p.confidence, 0), neighbors_total: p.neighbors_total ?? null,
    }));
  const taken = new Set(picks.map((p) => p.symbol));
  const byLiquid = new Map((Array.isArray(latest.screener) ? latest.screener : [])
    .filter((r) => r && r.liquid && Number.isFinite(r.close)).map((r) => [r.symbol, r]));
  const runners = Object.entries(mb.probs || {})
    .filter(([sym, prob]) => !taken.has(sym) && byLiquid.has(sym) && Number.isFinite(prob))
    .sort((a, b) => b[1] - a[1])
    .slice(0, RUNNERS)
    .map(([sym, prob]) => {
      const r = byLiquid.get(sym);
      return { symbol: sym, company: r.company || null, prob: round(prob), close: round(r.close, 2) };
    });
  return {
    ok: true,
    date: latest.date || null,
    generated_at: latest.generated_at || null,
    horizon_days: mb.horizon_days ?? null,
    target_pct: mb.target_pct ?? null,
    base_rate: mb.base_rate ?? null,
    picks,
    runners,
  };
}
