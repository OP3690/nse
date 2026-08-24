// Relative Rotation Graph — every sector plotted by relative strength (x) vs the
// momentum of that strength (y), both indexed to the market at 100. The four
// quadrants read as a rotation clock (Improving → Leading → Weakening → Lagging),
// so you can see which sectors money is rotating into and out of at a glance.
const Q = {
  Leading: { color: "rgb(var(--up))", cls: "text-up", corner: "top-right" },
  Improving: { color: "rgb(var(--accent))", cls: "text-accent", corner: "top-left" },
  Weakening: { color: "#f59e0b", cls: "text-amber-500", corner: "bottom-right" },
  Lagging: { color: "rgb(var(--down))", cls: "text-down", corner: "bottom-left" },
};

export default function RrgQuadrants({ rot }) {
  const pts = rot?.points;
  if (!pts?.length) return null;

  const W = 340, H = 300, PAD = 30;
  // Symmetric domain around 100 so the crosshair sits dead-centre.
  const rSpan = Math.max(6, ...pts.map((p) => Math.abs((p.rs_ratio ?? 100) - 100))) + 3;
  const mSpan = Math.max(6, ...pts.map((p) => Math.abs((p.rs_momentum ?? 100) - 100))) + 3;
  const sx = (v) => PAD + ((v - (100 - rSpan)) / (2 * rSpan)) * (W - 2 * PAD);
  const sy = (v) => H - PAD - ((v - (100 - mSpan)) / (2 * mSpan)) * (H - 2 * PAD);
  const cx0 = sx(100), cy0 = sy(100);
  const maxShare = Math.max(...pts.map((p) => p.share || 0), 1);

  const quadrants = rot.quadrants || {};
  const order = ["Leading", "Improving", "Weakening", "Lagging"];

  return (
    <div className="grid lg:grid-cols-[minmax(0,340px)_1fr] gap-5 items-start">
      <div className="mx-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} className="overflow-visible">
          {/* quadrant fills */}
          <rect x={cx0} y={PAD} width={W - PAD - cx0} height={cy0 - PAD} fill="rgb(var(--up))" opacity="0.05" />
          <rect x={PAD} y={PAD} width={cx0 - PAD} height={cy0 - PAD} fill="rgb(var(--accent))" opacity="0.05" />
          <rect x={cx0} y={cy0} width={W - PAD - cx0} height={H - PAD - cy0} fill="#f59e0b" opacity="0.05" />
          <rect x={PAD} y={cy0} width={cx0 - PAD} height={H - PAD - cy0} fill="rgb(var(--down))" opacity="0.05" />
          {/* crosshair */}
          <line x1={cx0} y1={PAD} x2={cx0} y2={H - PAD} stroke="rgb(var(--line))" strokeWidth="1" />
          <line x1={PAD} y1={cy0} x2={W - PAD} y2={cy0} stroke="rgb(var(--line))" strokeWidth="1" />
          {/* corner labels */}
          <text x={W - PAD} y={PAD - 8} textAnchor="end" className="fill-up" fontSize="10" fontWeight="700" opacity="0.9">LEADING</text>
          <text x={PAD} y={PAD - 8} textAnchor="start" className="fill-accent" fontSize="10" fontWeight="700" opacity="0.9">IMPROVING</text>
          <text x={W - PAD} y={H - PAD + 16} textAnchor="end" fill="#f59e0b" fontSize="10" fontWeight="700" opacity="0.9">WEAKENING</text>
          <text x={PAD} y={H - PAD + 16} textAnchor="start" className="fill-down" fontSize="10" fontWeight="700" opacity="0.9">LAGGING</text>
          {/* tails + dots */}
          {pts.map((p) => {
            const c = Q[p.quadrant]?.color || "rgb(var(--muted))";
            const x = sx(p.rs_ratio), y = sy(p.rs_momentum);
            const tail = rot.tails?.[p.sector];
            const r = 3 + Math.sqrt((p.share || 0) / maxShare) * 5;
            return (
              <g key={p.sector}>
                {Array.isArray(tail) && tail.length > 1 && (
                  <polyline points={tail.map((t) => `${sx(t.ratio)},${sy(t.mom)}`).join(" ")}
                    fill="none" stroke={c} strokeWidth="1" opacity="0.35" />
                )}
                <circle cx={x} cy={y} r={r} fill={c} fillOpacity="0.85" stroke="rgb(var(--ink))" strokeWidth="0.8">
                  <title>{`${p.sector} — ${p.quadrant}\nRS-Ratio ${p.rs_ratio?.toFixed(1)} · RS-Momentum ${p.rs_momentum?.toFixed(1)} · ${p.share?.toFixed(1)}% of mktcap`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>

      {/* sector lists per quadrant */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-3">
        {order.map((q) => {
          const list = quadrants[q] || [];
          return (
            <div key={q}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ background: Q[q].color }} />
                <span className={`text-[11px] font-bold uppercase tracking-wider ${Q[q].cls}`}>{q}</span>
                <span className="text-[10px] text-muted">{list.length}</span>
              </div>
              <ul className="space-y-0.5">
                {list.map((s) => (
                  <li key={s} className="text-xs text-white/80 truncate">{s}</li>
                ))}
                {list.length === 0 && <li className="text-xs text-muted">—</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
