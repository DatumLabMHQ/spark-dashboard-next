import { MarketsTable } from '@/components/markets-table';
import { PageHeader } from '@/components/page-header';
import { loadOverview } from '@/lib/data';
import { pct } from '@/lib/format';

// Rendered per request, not prerendered at build.
//
// These pages read a third-party API (DefiLlama and friends) through this dashboard's own data
// layer. With `revalidate` alone Next prerenders them during `next build`, which couples every
// deploy to that API being up: a single upstream blip fails the build outright, which is exactly
// what happened on the first deploy of this app. The loaders deliberately throw rather than
// return zeros, so a runtime failure renders the kit's error page instead of publishing a made-up
// number. The data layer's own TTL memo keeps repeat requests off the wire.
export const dynamic = 'force-dynamic';
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
