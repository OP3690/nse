import Link from "next/link";
import { getLatest } from "../lib/data";
import { PageHeader } from "../components/ui";
import IpoView from "../components/IpoView";

export const dynamic = "force-dynamic";

export default async function IpoPage() {
  const d = await getLatest();
  if (!d || !d.ipo) {
    return <div className="card text-center py-16 text-muted">No IPO data yet. Run the pipeline first.</div>;
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="IPO Radar"
        chip="Recent listings"
        meta={
          <>
            <div className="text-sm font-semibold text-white">{d.date}</div>
            <div className="text-xs text-muted">last 12 months</div>
          </>
        }
      >
        Recently listed stocks scored on how they&apos;ve actually behaved since debut —
        return vs issue price, post-listing momentum, delivery accumulation and liquidity.
      </PageHeader>

      <IpoView ipo={d.ipo} />

      <div className="card border border-line bg-panel2/50">
        <div className="text-xs text-muted leading-relaxed">
          <span className="font-semibold text-white">How IPO Strength is built. </span>
          {d.ipo.method} Strength is a percentile <span className="text-white">within the recent-listing cohort</span>,
          not a market-wide score. Newly listed stocks are thinly traded and exceptionally volatile, and a strong
          score reflects momentum and accumulation that has <span className="text-white">already occurred</span> —
          it is a quantitative observation, <span className="text-white">not a forecast and not investment advice</span>.
        </div>
      </div>

      <Link href="/" className="link-back">← Back to dashboard</Link>
    </div>
  );
}
