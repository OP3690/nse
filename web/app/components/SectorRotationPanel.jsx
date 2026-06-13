import { Pct } from "./ui";

// Dashboard "Sector Rotation" panel. Sectors arrive sorted by turnover-weighted
// average move (descending), so the top rows are today's leaders and the tail the
// laggards. We open with a plain-language rotation headline (money moving *into*
// strength / *out of* weakness), then a breadth meter, then a diverging bar list —
// leaders push right (green), laggards left (red), each scaled to the strongest
// absolute move — so the day's rotation reads at a glance.
export default function SectorRotationPanel({ sectors }) {
  if (!sectors?.length) return null;

  const up = sectors.filter((s) => s.avg_pct > 0).length;
  const down = sectors.filter((s) => s.avg_pct < 0).length;
  const total = up + down || 1;
  const upPct = (up / total) * 100;

  const leaders = sectors.slice(0, 5);
  const leaderSet = new Set(leaders.map((s) => s.sector));
  // Laggards = genuinely negative sectors only (up to 3, deepest first), so on a
  // broad up-day we don't mislabel weak-but-positive sectors as "laggards".
  const laggards = sectors
    .filter((s) => s.avg_pct < 0 && !leaderSet.has(s.sector))
    .slice(-3)
    .reverse();
  const shown = [...leaders, ...laggards];
  const maxAbs = Math.max(1, ...shown.map((s) => Math.abs(s.avg_pct)));
  const firstLagIdx = leaders.length;
  const hasConviction = shown.some((s) => s.avg_pct >= 0 && s.avg_deliv != null && s.avg_deliv >= 55);

  // Narrative: where money rotated INTO (top positive leaders) and OUT OF
  // (deepest genuine decliners). Cap each side to two names so it stays a headline.
  const into = leaders.filter((s) => s.avg_pct > 0).slice(0, 2).map((s) => s.sector);
  const outOf = sectors.filter((s) => s.avg_pct < 0).slice(-2).reverse().map((s) => s.sector);
  const fmt = (arr) => arr.join(" & ");

  return (
    <div className="space-y-3">
      {/* rotation headline */}
      {(into.length > 0 || outOf.length > 0) && (
        <div className="rounded-lg border border-line/70 bg-panel2/40 px-3 py-2 text-[11px] leading-snug">
          {into.length > 0 && (
            <div className="flex items-start gap-1.5">
              <span className="text-up font-bold shrink-0">↗</span>
              <span className="text-muted">
                Into <span className="text-up font-semibold">{fmt(into)}</span>
              </span>
            </div>
          )}
          {outOf.length > 0 && (
            <div className="flex items-start gap-1.5 mt-0.5">
              <span className="text-down font-bold shrink-0">↘</span>
              <span className="text-muted">
                Out of <span className="text-down font-semibold">{fmt(outOf)}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* breadth: chips + proportional meter */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-md bg-up/15 text-up px-1.5 py-0.5 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-up" /> {up} advancing
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-down/15 text-down px-1.5 py-0.5 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-down" /> {down} declining
          </span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-down/30"
          title={`${up} of ${total} sectors advancing`}>
          <span className="bg-up/80" style={{ width: `${upPct}%` }} />
        </div>
      </div>

      <div className="space-y-1">
        {shown.map((s, i) => {
          const pos = s.avg_pct >= 0;
          const w = Math.min(100, (Math.abs(s.avg_pct) / maxAbs) * 100);
          const divider = i === firstLagIdx && laggards.length > 0;
          const isTop = i === 0 && pos; // #1 leader gets a soft glow
          // Single compact line: a left-anchored magnitude bar sits *behind* the
          // row (green for leaders, red for laggards), the full sector name reads
          // on top, and the % sits at the right — so names never truncate but each
          // row stays one line tall.
          return (
            <div key={s.sector}>
              {divider && (
                <div className="flex items-center gap-2 my-1.5">
                  <span className="h-px flex-1 bg-line/70" />
                  <span className="text-[9px] uppercase tracking-wider text-muted/70 font-semibold">Laggards</span>
                  <span className="h-px flex-1 bg-line/70" />
                </div>
              )}
              <div className="relative flex items-center justify-between gap-2 overflow-hidden rounded px-2 py-1"
                title={`${s.sector} · ${s.count} stocks · ${s.advances}↑/${s.declines}↓ · delivery ${s.avg_deliv ?? "—"}%`}>
                <span aria-hidden className="absolute inset-y-0 left-0 rounded"
                  style={{
                    width: `${w}%`,
                    background: pos
                      ? "linear-gradient(to right, rgb(var(--up) / 0.32), rgb(var(--up) / 0.08))"
                      : "linear-gradient(to right, rgb(var(--down) / 0.32), rgb(var(--down) / 0.08))",
                    boxShadow: isTop ? "0 0 10px rgb(var(--up) / 0.4)" : undefined,
                  }} />
                <div className="relative min-w-0 flex items-center gap-1 text-xs text-white/90">
                  {pos && s.avg_deliv != null && s.avg_deliv >= 55 && (
                    <span className="text-up text-[8px] leading-none shrink-0" aria-hidden>◆</span>
                  )}
                  <span className="truncate">{s.sector}</span>
                </div>
                <div className="relative shrink-0 text-xs font-semibold tabular-nums">
                  <Pct value={s.avg_pct} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted/80 leading-snug">
        Turnover-weighted average move per sector — longer bar means a bigger move.
        {hasConviction && <> <span className="text-up">◆</span> marks ≥55% delivery (conviction buying).</>}
      </p>
    </div>
  );
}
