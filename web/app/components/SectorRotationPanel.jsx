import { Pct } from "./ui";

// Dashboard "Sector Rotation" panel. The sectors arrive sorted by turnover-weighted
// average move (descending), so the top rows are today's leaders and the tail the
// laggards. We render a diverging bar list — leaders push right (green), laggards
// push left (red), each scaled against the strongest absolute move — plus a breadth
// summary, so money rotating *into* strength vs *out of* weakness reads at a glance.
export default function SectorRotationPanel({ sectors }) {
  if (!sectors?.length) return null;

  const up = sectors.filter((s) => s.avg_pct > 0).length;
  const down = sectors.filter((s) => s.avg_pct < 0).length;

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

  return (
    <div className="space-y-3">
      {/* breadth summary */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-md bg-up/15 text-up px-1.5 py-0.5 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-up" /> {up} advancing
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-down/15 text-down px-1.5 py-0.5 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-down" /> {down} declining
        </span>
      </div>

      <div className="space-y-1.5">
        {shown.map((s, i) => {
          const pos = s.avg_pct >= 0;
          const w = Math.min(100, (Math.abs(s.avg_pct) / maxAbs) * 100);
          const divider = i === firstLagIdx && laggards.length > 0;
          return (
            <div key={s.sector}>
              {divider && (
                <div className="flex items-center gap-2 my-1.5">
                  <span className="h-px flex-1 bg-line/70" />
                  <span className="text-[9px] uppercase tracking-wider text-muted/70 font-semibold">Laggards</span>
                  <span className="h-px flex-1 bg-line/70" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="w-20 shrink-0 truncate text-xs text-white/85" title={`${s.sector} · ${s.count} stocks · ${s.advances}↑/${s.declines}↓`}>
                  {s.sector}
                </div>
                <div className="flex-1 flex items-center">
                  <div className="w-1/2 flex justify-end">
                    {!pos && (
                      <span className="h-2.5 rounded-l bg-gradient-to-l from-down to-down/40"
                        style={{ width: `${w}%` }} />
                    )}
                  </div>
                  <span className="w-px h-3.5 bg-line shrink-0" />
                  <div className="w-1/2 flex justify-start">
                    {pos && (
                      <span className="h-2.5 rounded-r bg-gradient-to-r from-up/40 to-up"
                        style={{ width: `${w}%` }} />
                    )}
                  </div>
                </div>
                <div className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums">
                  <Pct value={s.avg_pct} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted/80 leading-snug">
        Turnover-weighted average move per sector — leaders push right, laggards left.
      </p>
    </div>
  );
}
