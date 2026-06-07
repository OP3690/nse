import Link from "next/link";
import { getLatest } from "../lib/data";
import { PageHeader } from "../components/ui";
import FlowsView from "../components/FlowsView";

export const dynamic = "force-dynamic";

export default async function FlowsPage() {
  const d = await getLatest();
  if (!d || !d.flows) {
    return <div className="card text-center py-16 text-muted">No flow data yet. Run the pipeline first.</div>;
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="FII / DII Money Flows"
        chip="Institutional flows"
        meta={<div className="text-sm font-semibold text-white">{d.date}</div>}
      >
        Where foreign (FII/FPI) and domestic (DII) institutional money is
        moving — across timeframes, by asset class, and by sector.
      </PageHeader>
      <FlowsView flows={d.flows} />
      <p className="text-xs text-muted">
        FII/DII cash figures are NSE end-of-day net buy/sell (₹ Cr). Asset-class
        split is from NSDL's daily FPI trends. Sector destination is delivered
        turnover (real demat accumulation), a proxy since cash flows aren't
        published per sector. Quantitative observation, not investment advice.
      </p>
      <Link href="/" className="link-back">← Back to dashboard</Link>
    </div>
  );
}
