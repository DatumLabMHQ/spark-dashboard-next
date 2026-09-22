// Spark Savings. Ported from sparklend-dashboard/app/savings.
import type { Metadata } from 'next';
import { AreaChart } from '@/components/charts';
import { PageHeader } from '@/components/page-header';
import { Panel, StatRow } from '@/components/page-parts';
import { loadSavings } from '@/lib/spark-pages';
import { pct, usd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Savings',
  description: 'Spark Savings deposits over time and across chains.',
};

export default async function SavingsPage() {
  const d = await loadSavings();
  const change = d.stats[1].value;

  return (
    <>
      <PageHeader
        eyebrow="Savings"
        question="Is Spark Savings still taking deposits?"
        answer={
          <>
            {usd(d.stats[0].value ?? 0)} in Savings
            {change !== null ? <>, {pct(change, 1)} over thirty days</> : null}, as of {d.asOf}.
          </>
        }
      />

      <StatRow stats={d.stats} />

      <div className="px-4 lg:px-6">
        <Panel
          title="Savings deposits over time"
          caption="sUSDS and sDAI together. Savings is the simplest of Spark's three businesses to read: deposits arrive when the rate is competitive and leave when it is not."
        >
          <AreaChart data={d.history} x="day" series={[{ key: 'savings', label: 'Savings' }]} unit="usd" height={300} />
        </Panel>
      </div>

      <div className="px-4 lg:px-6">
        <Panel
          title="Savings by chain"
          caption="Where those deposits sit. DefiLlama tracks deposits routed through Spark's own interface, so this is narrower than total sUSDS supply."
        >
          <AreaChart data={d.byChain.rows} x="day" series={d.byChain.series} stacked unit="usd" height={280} legend />
        </Panel>
      </div>
    </>
  );
}
