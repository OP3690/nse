import { getLatest } from "../lib/data";
import { PageHeader } from "../components/ui";
import ScreenerTable from "../components/ScreenerTable";
import ScreenerInsights from "../components/ScreenerInsights";
import MultibaggerSpotlight from "../components/MultibaggerSpotlight";

export const dynamic = "force-dynamic";

export default async function ScreenerPage() {
  const d = await getLatest();
  if (!d) return <div className="card text-center py-16 text-muted">No data. Run the pipeline first.</div>;

  const sectors = [...new Set(d.screener.map((e) => e.sector).filter(Boolean))].sort();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Screener"
        info="screener.overview"
        chip="Smart-money rank · KNN radar"
        meta={
          <>
            <div className="text-sm font-semibold text-white">{d.date}</div>
            <div className="text-xs text-muted">{d.screener.length} liquid stocks</div>
          </>
        }
      >
        Liquid stocks ranked by smart-money score, with a machine-learning multibagger radar and
        cross-sectional insight charts. Click a column to sort, a symbol for its flow history.
      </PageHeader>
      <MultibaggerSpotlight multibaggers={d.multibaggers} />
      <ScreenerInsights rows={d.screener} multibaggers={d.multibaggers} />
      <ScreenerTable rows={d.screener} sectors={sectors} />
    </div>
  );
}
