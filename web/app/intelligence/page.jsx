import Link from "next/link";
import { getLatest } from "../lib/data";
import { PageHeader } from "../components/ui";
import IntelligenceView from "../components/IntelligenceView";

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const d = await getLatest();
  if (!d || !d.intel) {
    return <div className="card text-center py-16 text-muted">No intelligence data yet. Run the pipeline first.</div>;
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Money-Flow Intelligence"
        chip="3–6 month synthesis"
        meta={<div className="text-sm font-semibold text-white">{d.date}</div>}
      >
        A quantitative read of NSE&apos;s deepest reports — delivery accumulation, sector
        rotation, institutional regime, and delivery–price divergence.
      </PageHeader>
      <IntelligenceView intel={d.intel} />
      <p className="text-xs text-muted">
        Built from public NSE end-of-day reports (delivery, F&amp;O OI, FII derivatives, NSDL
        category-wise turnover). Delivery-based accumulation is a transparent proxy for demat demand,
        since cash flows aren&apos;t published per stock. Quantitative observation, not investment advice.
      </p>
      <Link href="/" className="link-back">← Back to dashboard</Link>
    </div>
  );
}
