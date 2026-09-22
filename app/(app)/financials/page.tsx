// Financials. Ported from sparklend-dashboard/app/financials, rebuilt on the kit's charts.
//
// The source page is a client component fetching /api/financials; this renders on the server
// from the same route. That route is deliberately first-party through Block Analitica:
// DefiLlama's spark-liquidity-layer fees adapter under-captures its own source and turns a
// positive month negative. Nothing here may reintroduce it as a revenue source.
import type { Metadata } from 'next';
import { AreaChart, BarChart, DonutChart } from '@/components/charts';
import { PageHeader } from '@/components/page-header';
import { Panel, StatRow } from '@/components/page-parts';
import { loadFinancials } from '@/lib/spark-pages';
import { usd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Financials',
  description: "What Spark earns, by month and by product line, measured first-party.",
};

export default async function FinancialsPage() {
  const d = await loadFinancials();

  return (
    <>
      <PageHeader
        eyebrow="Financials"
        question="What does Spark actually earn?"
        answer={
          <>
            {d.settledMonth ? (
              <>
                {d.settledMonth} net revenue was {usd(d.stats[0].value ?? 0)} on {usd(d.stats[1].value ?? 0)} gross,
                against {usd(d.stats[2].value ?? 0)} earned since launch.
              </>
            ) : (
              <>Revenue by month and product line, measured first-party.</>
            )}
          </>
        }
      />

      <StatRow stats={d.stats} />

      <div className="px-4 lg:px-6">
        <Panel
          title="Net revenue by month"
          caption="Every month on record. The newest month is excluded: Distribution Rewards settle as a lagging off-chain rebate, so reading it as finished understates revenue."
          footnote={d.settledMonth ? `Last settled month: ${d.settledMonth}.` : undefined}
        >
          <BarChart data={d.monthlyNet} x="name" series={[{ key: 'net', label: 'Net revenue' }]} unit="usd" height={300} />
        </Panel>
      </div>

      <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <Panel
          title="Revenue by product line"
          caption="Spark is three businesses under one name: SparkLend interest, Savings, and the Liquidity Layer. The split says which one is actually carrying it."
        >
          <DonutChart items={d.byProduct} unit="usd" height={240} centerLabel="net revenue" />
        </Panel>

        <Panel
          title="What the Liquidity Layer earns against what it pays"
          caption="Real yield on the book against the base rate Spark owes Sky. The gap between the two lines is the spread; when it closes, the business stops working."
        >
          <AreaChart
            data={d.spread}
            x="day"
            series={[
              { key: 'earned', label: 'Earned' },
              { key: 'paid', label: 'Paid to Sky' },
            ]}
            unit="pct"
            height={260}
            legend
          />
        </Panel>
      </div>
    </>
  );
}
