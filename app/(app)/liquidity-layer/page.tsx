// Spark Liquidity Layer. Ported from sparklend-dashboard/app/liquidity-layer.
import type { Metadata } from 'next';
import { AreaChart, BarChart } from '@/components/charts';
import { PageHeader } from '@/components/page-header';
import { Panel, StatRow } from '@/components/page-parts';
import { loadSll } from '@/lib/spark-pages';
import { pct, usd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Liquidity Layer',
  description: "Where the Spark Liquidity Layer's capital is deployed, and how much of it stays inside Spark.",
};

export default async function LiquidityLayerPage() {
  const d = await loadSll();

  return (
    <>
      <PageHeader
        eyebrow="Liquidity Layer"
        question="Where does the Liquidity Layer actually put its money?"
        answer={
          <>
            {pct(d.ownShare, 1)} of the book sits in Spark&rsquo;s own venues, with {pct(d.sparkLendShare, 1)} in
            SparkLend alone, as of {d.asOf}.
          </>
        }
      />

      <StatRow stats={d.stats} />

      <div className="px-4 lg:px-6">
        <Panel
          title="Capital by destination"
          caption={
            <>
              <b className="font-medium text-foreground">Roughly half of the Liquidity Layer is deposited into
              SparkLend.</b> That matters when reading Spark&rsquo;s ecosystem TVL: the same dollar appears in both
              the SLL line and the SparkLend line, so the two cannot simply be added.
            </>
          }
          footnote={`${pct(d.ownShare, 1)} in Spark's own venues, ${pct(100 - d.ownShare, 1)} deployed externally.`}
        >
          <BarChart data={d.categories} x="name" series={[{ key: 'usd', label: 'Deployed' }]} horizontal unit="usd" height={320} categoryWidth={110} />
        </Panel>
      </div>

      <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <Panel
          title="AUM by chain"
          caption="Daily assets under management split by chain. The Liquidity Layer is where Spark's multichain presence actually lives."
        >
          <AreaChart data={d.byChain.rows} x="day" series={d.byChain.series} stacked unit="usd" height={280} legend />
        </Panel>

        <Panel
          title="Largest positions"
          caption="The individual allocations behind the category chart, largest first. Concentration here is counterparty risk, not just an allocation choice."
        >
          <BarChart data={d.largestPositions} x="name" series={[{ key: 'usd', label: 'Position' }]} horizontal unit="usd" height={280} categoryWidth={130} />
        </Panel>
      </div>
    </>
  );
}
