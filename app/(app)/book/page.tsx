// The SparkLend book over time. Ported from the charts on sparklend-dashboard/app/markets.
//
// Named /book because this app already has /markets: the kit's sortable reserve table. This is
// the charted read of the same book.
import type { Metadata } from 'next';
import { AreaChart, BarChart } from '@/components/charts';
import { PageHeader } from '@/components/page-header';
import { Panel, StatRow } from '@/components/page-parts';
import { loadBook } from '@/lib/spark-pages';
import { pct, usd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Loan book',
  description: 'SparkLend supplied against borrowed over time, and the asset mix behind it.',
};

export default async function BookPage() {
  const d = await loadBook();

  return (
    <>
      <PageHeader
        eyebrow="Loan book"
        question="How much of SparkLend's book is actually lent out?"
        answer={
          <>
            {usd(d.stats[0].value ?? 0)} supplied against {usd(d.stats[1].value ?? 0)} borrowed
            {d.stats[2].value !== null ? <>, a utilisation of {pct(d.stats[2].value, 1)}</> : null}, as of {d.asOf}.
          </>
        }
      />

      <StatRow stats={d.stats} />

      <div className="px-4 lg:px-6">
        <Panel
          title="Supplied against borrowed"
          caption="The two sides of the Ethereum book daily. The gap between them is idle liquidity: capital sitting in the protocol earning the supply rate but not being borrowed."
        >
          <AreaChart
            data={d.history}
            x="day"
            series={[
              { key: 'supplied', label: 'Supplied' },
              { key: 'borrowed', label: 'Borrowed' },
            ]}
            unit="usd"
            height={320}
            legend
          />
        </Panel>
      </div>

      <div className="px-4 lg:px-6">
        <Panel
          title="Supplied against borrowed, by asset"
          caption="Ranked on whichever side the asset is larger, so pure collateral and pure debt both appear. Stablecoins are borrowed; volatile assets are posted."
        >
          <BarChart
            data={d.byAsset}
            x="name"
            series={[
              { key: 'supplied', label: 'Supplied' },
              { key: 'borrowed', label: 'Borrowed' },
            ]}
            horizontal
            unit="usd"
            height={340}
            categoryWidth={96}
            legend
          />
        </Panel>
      </div>
    </>
  );
}
