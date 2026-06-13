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

      <div className="space-y-1.5">
        {shown.map((s, i) => {
          const pos = s.avg_pct >= 0;
          const w = Math.min(100, (Math.abs(s.avg_pct) / maxAbs) * 100);
          const divider = i === firstLagIdx && laggards.length > 0;
          const isTop = i === 0 && pos; // #1 leader gets a soft glow
          return (
            <div key={s.sector} className="pt-0.5">
              {divider && (
                <div className="flex items-center gap-2 my-1.5">
                  <span className="h-px flex-1 bg-line/70" />
                  <span className="text-[9px] uppercase tracking-wider text-muted/70 font-semibold">Laggards</span>
                  <span className="h-px flex-1 bg-line/70" />
                </div>
              )}
              {/* Name + % on their own line so long sector names show in full,
                  then the diverging bar full-width beneath. */}
              <div className="flex items-center justify-between gap-2"
                title={`${s.sector} · ${s.count} stocks · ${s.advances}↑/${s.declines}↓ · delivery ${s.avg_deliv ?? "—"}%`}>
                <div className="min-w-0 flex items-center gap-1 text-xs text-white/85">
                  {pos && s.avg_deliv != null && s.avg_deliv >= 55 && (
                    <span className="text-up text-[8px] leading-none shrink-0" aria-hidden>◆</span>
                  )}
                  <span>{s.sector}</span>
                </div>
                <div className="shrink-0 text-xs font-semibold tabular-nums">
                  <Pct value={s.avg_pct} />
                </div>
              </div>
              <div className="mt-1 flex items-center">
                <div className="w-1/2 flex justify-end">
                  {!pos && (
                    <span className="h-2 rounded-l bg-gradient-to-l from-down to-down/40"
                      style={{ width: `${w}%` }} />
                  )}
                </div>
                <span className="w-px h-3 bg-line shrink-0" />
                <div className="w-1/2 flex justify-start">
                  {pos && (
                    <span className="h-2 rounded-r bg-gradient-to-r from-up/40 to-up"
                      style={{ width: `${w}%`, boxShadow: isTop ? "0 0 8px rgb(var(--up) / 0.55)" : undefined }} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted/80 leading-snug">
        Turnover-weighted average move per sector — leaders push right, laggards left.
        {hasConviction && <> <span className="text-up">◆</span> marks ≥55% delivery (conviction buying).</>}
      </p>
    </div>
  );
}
