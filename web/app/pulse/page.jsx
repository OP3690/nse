import Link from "next/link";
import { getLatest, fmtCr } from "../lib/data";
import { PageHeader } from "../components/ui";
import PulseView from "../components/PulseView";

export const dynamic = "force-dynamic";

export default async function PulsePage() {
  const d = await getLatest();
  if (!d || !d.pulse) {
    return <div className="card text-center py-16 text-muted">No market data yet. Run the pipeline first.</div>;
  }
  const b = d.pulse.breadth;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Market Pulse"
        chip="Live analysis board"
        meta={
          <>
            <div className="text-sm font-semibold text-white">{d.date}</div>
            <div className="text-xs text-muted">{fmtCr(b.total_turnover_cr)} turnover</div>
          </>
        }
      >
        A full read of the last NSE session — most active names, index performances, circuit hitters,
        volume spikes, 52-week extremes, large deals and market breadth.
      </PageHeader>

      <PulseView pulse={d.pulse} />

      <div className="card border border-line bg-panel2/50">
        <div className="text-xs text-muted leading-relaxed">
          <span className="font-semibold text-white">About this board. </span>
          Every panel is a transparent computation over the EOD delivery bhavcopy, all-indices snapshot,
          52-week levels and bulk/block deal reports. Circuit detection flags stocks locked at open=high=low=close
          or pinned to a ≥4.5% extreme. These are quantitative observations of what already happened —
          <span className="text-white"> not forecasts and not investment advice</span>.
        </div>
      </div>

      <Link href="/" className="link-back">← Back to dashboard</Link>
    </div>
  );
}
