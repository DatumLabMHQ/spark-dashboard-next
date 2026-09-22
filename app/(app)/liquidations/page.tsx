// Liquidations. Ported from sparklend-dashboard/app/liquidations.
import type { Metadata } from 'next';
import { BarChart } from '@/components/charts';
import { PageHeader } from '@/components/page-header';
import { Panel, StatRow } from '@/components/page-parts';
import { loadLiquidations } from '@/lib/spark-pages';
import { count, pct } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Liquidations',
  description: 'Every SparkLend liquidation on record, by month, by liquidator and by collateral.',
};

export default async function LiquidationsPage() {
  const d = await loadLiquidations();
  const topShare = d.stats[3].value;

  return (
    <>
      <PageHeader
        eyebrow="Liquidations"
        question="Who actually liquidates SparkLend?"
        answer={
          <>
            {count(d.stats[0].value ?? 0)} liquidations on record across {count(d.stats[1].value ?? 0)} addresses
            {topShare !== null ? <>, with the busiest single liquidator handling {pct(topShare, 1)} of them</> : null}.
          </>
        }
      />

      <StatRow stats={d.stats} />

      <div className="px-4 lg:px-6">
        <Panel
          title="Liquidations by month"
          caption="Event counts, not dollar amounts. A spike here marks a volatile week; a flat stretch means collateral held up, not that the machinery stopped."
        >
          <BarChart data={d.byMonth} x="name" series={[{ key: 'events', label: 'Liquidations' }]} unit="count" height={300} />
        </Panel>
      </div>

      <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <Panel
          title="Busiest liquidators"
          caption="Concentration among liquidators is a real dependency: if one address handles most of the work, the protocol relies on that operator staying online."
          footnote={
            topShare !== null ? `The busiest address handles ${pct(topShare, 1)} of all events on record.` : undefined
          }
        >
          <BarChart
            data={d.topLiquidators}
            x="name"
            series={[{ key: 'events', label: 'Events' }]}
            horizontal
            unit="count"
            height={300}
            categoryWidth={130}
          />
        </Panel>

        <Panel
          title="Most liquidated collateral"
          caption="Which collateral gets seized most often. Volatile assets dominate by nature, so read this against how much of each is actually supplied."
        >
          <BarChart
            data={d.topCollateral}
            x="name"
            series={[{ key: 'events', label: 'Events' }]}
            horizontal
            unit="count"
            height={300}
            categoryWidth={110}
          />
        </Panel>
      </div>
    </>
  );
}
