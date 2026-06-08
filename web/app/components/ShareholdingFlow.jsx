import InfoDot from "./InfoDot";

// Category identity colors (stable across light/dark) for the composition bars.
const CAT_COLOR = {
  promoter: "#f5a524",
  fii: "#5b8cff",
  dii: "#16c784",
  public: "#a78bfa",
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
}
function fmtQtr(iso) {
  if (!iso) return "";
  const [y, m] = iso.split("-").map(Number);
  return `${MON[m - 1]} '${String(y).slice(2)}`;
}
// Signed ₹ in crore, compact for large numbers.
function fmtCrSigned(v) {
  if (v == null) return "—";
  const a = Math.abs(v), s = v > 0 ? "+" : v < 0 ? "-" : "";
  if (a >= 100000) return `${s}₹${(a / 100000).toFixed(2)}L Cr`;
  if (a >= 1000) return `${s}₹${(a / 1000).toFixed(1)}k Cr`;
  return `${s}₹${Math.round(a).toLocaleString("en-IN")} Cr`;
}
const fmtPp = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)} pp`);

// One category tile: current holding %, quarter-over-quarter change, est ₹ flow.
function CatTile({ c }) {
  const up = c.delta_pp != null && c.delta_pp > 0;
  const down = c.delta_pp != null && c.delta_pp < 0;
  const tone = up ? "text-up" : down ? "text-down" : "text-muted";
  const chip = up ? "bg-up/15 text-up" : down ? "bg-down/15 text-down" : "bg-muted/15 text-muted";
  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: CAT_COLOR[c.key] }} />
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wide truncate">{c.label}</span>
      </div>
      <div className="font-mono text-xl font-bold tabular-nums text-white leading-none">
        {c.pct != null ? `${c.pct.toFixed(2)}%` : "—"}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${chip}`}>
          {up ? "▲" : down ? "▼" : "•"} {fmtPp(c.delta_pp)}
        </span>
      </div>
      <div className={`mt-1 text-[11px] font-semibold tabular-nums ${tone}`}>
        {c.est_cr != null ? `${fmtCrSigned(c.est_cr)}` : "—"}
      </div>
    </div>
  );
}

// Diverging net-flow bar: accumulation right (green), distribution left (red).
function FlowBar({ c, maxAbs }) {
  const mag = c.est_cr != null ? c.est_cr : c.delta_pp;
  const pct = maxAbs ? Math.min(100, (Math.abs(mag || 0) / maxAbs) * 100) : 0;
  const pos = mag > 0;
  const neg = mag < 0;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-16 shrink-0 text-muted font-medium truncate">{c.label}</span>
      <div className="flex-1 flex items-center">
        <div className="w-1/2 flex justify-end">
          {neg && <span className="h-3.5 rounded-l bg-down/80" style={{ width: `${pct}%` }} />}
        </div>
        <span className="w-px h-4 bg-line shrink-0" />
        <div className="w-1/2 flex justify-start">
          {pos && <span className="h-3.5 rounded-r bg-up/80" style={{ width: `${pct}%` }} />}
        </div>
      </div>
      <span className={`w-24 shrink-0 text-right font-mono font-semibold tabular-nums ${pos ? "text-up" : neg ? "text-down" : "text-muted"}`}>
        {c.est_cr != null ? fmtCrSigned(c.est_cr) : fmtPp(c.delta_pp)}
      </span>
    </div>
  );
}

// 100%-stacked composition bar for one quarter (ownership mix over time).
function CompRow({ q }) {
  const segs = [["promoter", q.promoter], ["fii", q.fii], ["dii", q.dii], ["public", q.public]];
  const total = segs.reduce((a, [, v]) => a + (v || 0), 0) || 100;
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[10px] text-muted tabular-nums">{fmtQtr(q.date)}</span>
      <div className="flex-1 flex h-4 rounded overflow-hidden ring-1 ring-inset ring-line/40">
        {segs.map(([k, v]) => (
          <span key={k} title={`${k}: ${(v || 0).toFixed(2)}%`}
            style={{ width: `${((v || 0) / total) * 100}%`, background: CAT_COLOR[k] }} />
        ))}
      </div>
    </div>
  );
}

export default function ShareholdingFlow({ data }) {
  if (!data || !data.categories) return null;
  const cats = data.categories;
  const maxAbs = Math.max(
    1,
    ...cats.map((c) => Math.abs(c.est_cr != null ? c.est_cr : c.delta_pp || 0))
  );
  const hasFlow = cats.some((c) => c.delta_pp != null);

  return (
    <section className="card">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
        <h2 className="card-title mb-0 flex items-center gap-2">
          <span>Where Money Is Flowing — Ownership</span>
          <InfoDot topic="stock.shareholding" />
        </h2>
        <span className="text-[11px] text-muted">
          {fmtDate(data.asof)}{data.prev ? ` vs ${fmtDate(data.prev)}` : ""} · last quarter
        </span>
      </div>
      <p className="text-xs text-muted mb-3">
        Net change in who owns this company over the latest quarter (~90 days), across the four
        ownership groups — shown as the shift in holding % and an estimated ₹ value.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {cats.map((c) => <CatTile key={c.key} c={c} />)}
      </div>

      {hasFlow && (
        <div className="mt-4 rounded-xl border border-line bg-panel2/30 p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">Net flow this quarter</span>
            <span className="text-[10px] text-muted/70">◀ sold · bought ▶</span>
          </div>
          <div className="space-y-2">
            {cats.map((c) => <FlowBar key={c.key} c={c} maxAbs={maxAbs} />)}
          </div>
        </div>
      )}

      {data.trend && data.trend.length > 1 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">
            Ownership mix over time
          </div>
          <div className="space-y-1.5">
            {data.trend.map((q) => <CompRow key={q.date} q={q} />)}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
            {[["promoter", "Promoters"], ["fii", "FII / FPI"], ["dii", "DII"], ["public", "Public"]].map(([k, label]) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CAT_COLOR[k] }} />
                <span className="text-muted">{label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted/80 mt-3">
        Quarterly shareholding-pattern filings (NSE). ₹ values are estimates: holding-% change ×
        shares outstanding × current price — not actual transacted amounts.
      </p>
    </section>
  );
}
