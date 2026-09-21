// Overview: the question, the one-line answer, then the numbers. Cards, chart and table read
// the normalised data from lib/data.ts (the platform, or labelled sample data without a key).
import { config } from '@/datum.config';
import { ChartAreaInteractive } from '@/components/chart-area-interactive';
import { MarketsTable } from '@/components/markets-table';
import { PageHeader } from '@/components/page-header';
import { SectionCards } from '@/components/section-cards';
import { loadOverview } from '@/lib/data';
import { count, pct, usd } from '@/lib/format';

export const revalidate = 300;

export default async function Overview() {
  const d = await loadOverview();
  const k = d.kpis;
  return (
    <>
      <PageHeader eyebrow="Overview" question={config.question}
        answer={<>{usd(k.supplied)} is supplied across {count(k.markets)} markets and {pct(k.utilization, 1)} of it is borrowed. Supply moved {k.suppliedChange7d >= 0 ? 'up' : 'down'} {pct(Math.abs(k.suppliedChange7d), 1)} over seven days, as of {d.asOf}.</>} />
      <SectionCards kpis={k} asOf={d.asOf} />
      <div className="px-4 lg:px-6"><ChartAreaInteractive data={d.history} asOf={d.asOf} grain={d.historyGrain} /></div>
      <MarketsTable data={d.markets} title="Markets" pageSize={8}
        caption={<><b className="font-medium text-foreground">Where the money actually is.</b> A handful of markets carry most of the supply; their utilisation is the per-market risk that the aggregate hides. Largest first.</>} />
      {d.reconciliation ? (
        <p className="px-4 text-sm text-muted-foreground lg:px-6"><b className="font-medium text-foreground">Reconciliation.</b> Our own count of supplied value is {usd(d.reconciliation.ours)}; {d.reconciliation.theirsSource} reports {usd(d.reconciliation.theirs)} TVL. {d.reconciliation.note}</p>
      ) : null}
    </>
  );
}
