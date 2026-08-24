// Market-regime strip for the top of the dashboard. Turns the pipeline's regime
// read (risk posture + Nifty position/momentum + VIX) into a single context bar
// that colours the whole session: are we in an accumulate-freely tape or a
// be-selective, tighten-stops one?
export default function RegimeBanner({ regime }) {
  if (!regime?.label) return null;
  const label = regime.label;
  const t = /off/i.test(label)
    ? { dot: "bg-down", text: "text-down", ring: "ring-down/30", bg: "bg-down/5" }
    : /on/i.test(label)
    ? { dot: "bg-up", text: "text-up", ring: "ring-up/30", bg: "bg-up/5" }
    : { dot: "bg-amber-400", text: "text-amber-500", ring: "ring-amber-400/30", bg: "bg-amber-400/5" };

  const pos = regime.nifty_52w_pos; // 0..100 within the 52-week range
  const chg = regime.nifty_pchg30d;
  const chgUp = chg != null && chg >= 0;

  const Mini = ({ label, children }) => (
    <div className="flex flex-col items-start sm:items-end">
      <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</span>
      <span className="text-sm font-bold tabular-nums text-white/90">{children}</span>
    </div>
  );

  return (
    <div className={`rounded-2xl border border-line ${t.bg} ring-1 ${t.ring} px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3`}>
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <span className={`mt-1 w-2.5 h-2.5 rounded-full ${t.dot} animate-pulse shrink-0`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Market regime</span>
            <span className={`text-sm font-bold ${t.text}`}>{label}</span>
          </div>
          {regime.note && <p className="text-xs text-muted mt-0.5 leading-snug max-w-2xl">{regime.note}</p>}
        </div>
      </div>

      <div className="flex items-center gap-5 sm:gap-6">
        {regime.vix != null && <Mini label="India VIX">{regime.vix.toFixed(2)}</Mini>}
        {pos != null && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Nifty 52w range</span>
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-1.5 rounded-full bg-line overflow-hidden">
                <div className={`h-full rounded-full ${pos >= 66 ? "bg-up" : pos >= 33 ? "bg-amber-400" : "bg-down"}`}
                  style={{ width: `${Math.max(2, Math.min(100, pos))}%` }} />
              </div>
              <span className="text-xs font-bold tabular-nums text-white/90">{pos.toFixed(0)}%</span>
            </div>
          </div>
        )}
        {chg != null && (
          <Mini label="Nifty 30d">
            <span className={chgUp ? "text-up" : "text-down"}>{chgUp ? "+" : ""}{chg.toFixed(2)}%</span>
          </Mini>
        )}
      </div>
    </div>
  );
}
