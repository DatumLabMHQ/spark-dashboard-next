import { MarketsTable } from '@/components/markets-table';
import { PageHeader } from '@/components/page-header';
import { loadOverview } from '@/lib/data';
import { pct } from '@/lib/format';

export const revalidate = 300;
export const metadata = { title: 'Markets' };

export default async function Markets() {
  const d = await loadOverview();
  const high = d.markets.filter((m) => m.risk === 'high').length;
  return (
    <>
      <PageHeader eyebrow="Markets" question="Which markets carry the risk?"
        answer={<>{d.markets.length} listed markets as of {d.asOf}, aggregate utilisation {pct(d.kpis.utilization, 1)}. {high === 0 ? 'No market is above 85% utilisation, the line where withdrawals start to queue.' : `${high} ${high === 1 ? 'market is' : 'markets are'} above 85% utilisation, where withdrawals start to queue.`}</>} />
      <MarketsTable data={d.markets} title="All markets" pageSize={20}
        caption={<><b className="font-medium text-foreground">Per-market risk.</b> Utilisation above 85% means suppliers may wait to withdraw; LLTV is the loan-to-value at which a position can be liquidated.</>} />
    </>
  );
}
