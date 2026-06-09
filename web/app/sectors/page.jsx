import { getLatest } from "../lib/data";
import { PageHeader } from "../components/ui";
import SectorsView from "../components/SectorsView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sectors · NSE Flow",
  description: "Sector rotation, heatmap and multi-timeframe performance analytics.",
};

export default async function SectorsPage() {
  const d = await getLatest();
  if (!d) return <div className="card p-8 text-center text-muted">No data yet. Run the pipeline.</div>;

  const analytics = d.sector_analytics || { sectors: [], market: {} };
  // constituent universe: liquid headline stocks that carry a sector
  const stocks = (d.screener || []).filter((e) => e.sector);
  const asof = d.date;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sectors"
        info="sectors.overview"
        chip="Rotation · Heatmap · 1M–1Y performance"
        meta={
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted font-semibold">As of</div>
            <div className="font-mono text-sm text-white tabular-nums">{asof || "—"}</div>
          </div>
        }
      >
        Where money is rotating across the market — every sector's median return over 1 month, 3, 6 and a year,
        its breadth, smart-money score, drawdown and institutional flow, with an RRG-style rotation map and a
        click-through into any sector's constituents.
      </PageHeader>

      <SectorsView analytics={analytics} stocks={stocks} />
    </div>
  );
}
