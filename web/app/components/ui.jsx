import Link from "next/link";
import StockTip from "./StockTip";
import InfoDot from "./InfoDot";

export function Pct({ value, className = "" }) {
  if (value == null) return <span className="text-muted">—</span>;
  const up = value >= 0;
  return (
    <span className={`${up ? "text-up" : "text-down"} ${className}`}>
      {up ? "+" : ""}{Number(value).toFixed(2)}%
    </span>
  );
}

const SIGNAL_STYLES = {
  "Strong Accumulation": "bg-up/15 text-up",
  "Accumulation": "bg-up/10 text-up/90",
  "Distribution": "bg-down/15 text-down",
  "Neutral": "bg-line text-muted",
};

export function SignalBadge({ signal }) {
  return <span className={`badge ${SIGNAL_STYLES[signal] || "bg-line text-muted"}`}>{signal}</span>;
}

const OI_STYLES = {
  long_buildup: ["Long Buildup", "bg-up/15 text-up"],
  short_covering: ["Short Covering", "bg-accent/15 text-accent"],
  short_buildup: ["Short Buildup", "bg-down/15 text-down"],
  long_unwinding: ["Long Unwinding", "bg-amber-500/15 text-amber-400"],
};

export function OiBadge({ label }) {
  if (!label || !OI_STYLES[label]) return <span className="text-muted">—</span>;
  const [text, cls] = OI_STYLES[label];
  return <span className={`badge ${cls}`}>{text}</span>;
}

export function Stat({ label, value, sub, accent, info, delta }) {
  const bar = accent?.includes("up") ? "from-up/80"
    : accent?.includes("down") ? "from-down/80"
    : "from-accent/80";
  return (
    <div className="stat-tile">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${bar} to-transparent`} />
      <div className="stat-label flex items-center justify-between gap-1.5">
        <span className="truncate">{label}</span>
        {info && <InfoDot topic={info} />}
      </div>
      <div className={`stat-value ${accent || "text-white"}`}>{value}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {sub && <span className="text-xs text-muted truncate">{sub}</span>}
        {delta}
      </div>
    </div>
  );
}

// Market Breadth tile with a proportional advance/decline split bar. Richer than
// the generic Stat: shows adv (green) vs dec (red) counts, the split visually,
// the % advancing, and the unchanged count.
export function BreadthStat({ advances = 0, declines = 0, unchanged = 0, info }) {
  const ad = advances + declines || 1;
  const advPct = Math.round((advances / ad) * 100);
  const up = advPct >= 50;
  const advW = (advances / ad) * 100;
  return (
    <div className="stat-tile">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${up ? "from-up/80" : "from-down/80"} to-transparent`} />
      <div className="stat-label flex items-center justify-between gap-1.5">
        <span className="truncate">Market Breadth</span>
        {info && <InfoDot topic={info} />}
      </div>
      <div className="stat-value flex items-baseline gap-1.5">
        <span className="text-up">{advances.toLocaleString("en-IN")}</span>
        <span className="text-muted text-base font-normal">/</span>
        <span className="text-down">{declines.toLocaleString("en-IN")}</span>
      </div>
      <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-line"
        title={`${advances} advancing · ${declines} declining${unchanged ? ` · ${unchanged} unchanged` : ""}`}>
        <div className="bg-up h-full" style={{ width: `${advW}%` }} />
        <div className="bg-down h-full" style={{ width: `${100 - advW}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className={`font-semibold ${up ? "text-up" : "text-down"}`}>{advPct}% advancing</span>
        {unchanged > 0 && <span className="text-muted">{unchanged.toLocaleString("en-IN")} unchanged</span>}
      </div>
    </div>
  );
}

export function Section({ title, children, href, action, desc, info }) {
  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
            <span>{title}</span>
            {info && <InfoDot topic={info} />}
          </h2>
          {desc && <p className="text-xs text-muted mt-1 max-w-2xl">{desc}</p>}
        </div>
        {href && (
          <Link href={href} className="chip chip-accent shrink-0 hover:brightness-125 transition">
            {action || "View all →"}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, children, meta, chip, info, titleAside }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-panel2 via-panel to-ink p-6">
      <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
      <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {chip && <span className="chip chip-accent mb-2">{chip}</span>}
          <h1 className="text-3xl font-bold tracking-tight gradient-text flex items-center gap-2.5">
            <span>{title}</span>
            {info && <InfoDot topic={info} hidePeriod />}
          </h1>
          {children && <p className="text-muted text-sm mt-2 max-w-2xl">{children}</p>}
        </div>
        <div className="shrink-0 ml-auto flex flex-col items-end gap-3">
          {meta}
          {titleAside}
        </div>
      </div>
    </div>
  );
}

export function Score({ value }) {
  const v = Number(value || 0);
  const hue = v >= 75 ? "text-up" : v >= 55 ? "text-accent" : v <= 30 ? "text-down" : "text-muted";
  const grad = v >= 75 ? "from-up to-[#0fa968]" : v >= 55 ? "from-accent to-[#3f6fe0]"
    : v <= 30 ? "from-down to-[#c22f3a]" : "from-muted to-muted";
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-2 rounded-full bg-line overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${grad}`} style={{ width: `${v}%` }} />
      </div>
      <span className={`font-mono text-sm font-bold tabular-nums ${hue}`}>{v.toFixed(0)}</span>
    </div>
  );
}

const TREND_STYLES = {
  "Strong Uptrend": "bg-up/20 text-up",
  "Uptrend": "bg-up/10 text-up/90",
  "Sideways": "bg-line text-muted",
  "Downtrend": "bg-down/10 text-down/90",
  "Strong Downtrend": "bg-down/20 text-down",
};

export function TrendBadge({ label }) {
  return <span className={`badge ${TREND_STYLES[label] || "bg-line text-muted"}`}>{label}</span>;
}

export function TrendScore({ value }) {
  const v = Number(value || 0);
  const up = v >= 0;
  const mag = Math.min(100, Math.abs(v));
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-2 rounded-full bg-line overflow-hidden flex justify-center">
        <div className={`h-full rounded-full bg-gradient-to-r ${up ? "from-up to-[#0fa968]" : "from-down to-[#c22f3a]"}`} style={{ width: `${mag}%` }} />
      </div>
      <span className={`font-mono text-sm font-bold tabular-nums ${up ? "text-up" : "text-down"}`}>
        {up ? "+" : ""}{v.toFixed(0)}
      </span>
    </div>
  );
}

export function Confidence({ value }) {
  const v = Number(value || 0);
  const hue = v >= 75 ? "text-up" : v >= 50 ? "text-accent" : "text-muted";
  const grad = v >= 75 ? "from-up to-[#0fa968]" : v >= 50 ? "from-accent to-[#3f6fe0]" : "from-muted to-muted";
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-2 rounded-full bg-line overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${grad}`} style={{ width: `${v}%` }} />
      </div>
      <span className={`font-mono text-xs font-semibold tabular-nums ${hue}`}>{v.toFixed(0)}%</span>
    </div>
  );
}

export function SymbolLink({ symbol, name }) {
  return <StockTip symbol={symbol} name={name} />;
}
