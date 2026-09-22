// SPK. Ported from sparklend-dashboard/app/spk-token.
import type { Metadata } from 'next';
import { BarChart, DonutChart, LineChart } from '@/components/charts';
import { PageHeader } from '@/components/page-header';
import { Panel, StatRow } from '@/components/page-parts';
import { loadSpk } from '@/lib/spark-pages';
import { pct, usd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SPK',
  description: 'SPK price, holder concentration, and the buyback.',
};

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n.toLocaleString());

export default async function SpkPage() {
  const d = await loadSpk();

  return (
    <>
      <PageHeader
        eyebrow="SPK"
        question="Who holds SPK, and what is the buyback doing?"
        answer={
          <>
            {d.buybackSpk ? (
              <>
                {compact(d.buybackSpk)} SPK repurchased for {usd(d.buybackUsds ?? 0)}
              </>
            ) : (
              <>Buyback in progress</>
            )}
            {d.cushionMonths !== null ? <>, with {d.cushionMonths.toFixed(1)} months of runway left</> : null}
            {d.hhi !== null ? <>. Holder concentration reads {d.hhi.toFixed(0)} on HHI</> : null}, as of {d.asOf}.
          </>
        }
      />

      <StatRow stats={d.stats} />

      <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <Panel
          title="Top holders"
          caption="Share of the tracked balance across the twenty largest holders. Note the denominator: this is share of those top twenty, not of circulating supply."
          footnote={
            d.hhi !== null
              ? `HHI ${d.hhi.toFixed(0)} across the tracked set. Above 2,500 is the antitrust convention for high concentration.`
              : undefined
          }
        >
          <BarChart
            data={d.holders}
            x="name"
            series={[{ key: 'share', label: 'Share' }]}
            horizontal
            unit="pct"
            height={320}
            categoryWidth={130}
          />
        </Panel>

        <Panel
          title="Holders by category"
          caption="Hand-labelled from known addresses: treasury, exchanges, market makers and the rest. Anything unrecognised stays Unknown rather than being guessed at."
        >
          <DonutChart items={d.categories} unit="pct" height={240} centerLabel="tracked" />
        </Panel>
      </div>

      <div className="px-4 lg:px-6">
        <Panel
          title="SPK price"
          caption="Price last, deliberately. Read it against the buyback runway above: a buyback that outlives its treasury is a different story from one that does not."
        >
          <LineChart data={d.priceHistory} x="day" series={[{ key: 'price', label: 'Price' }]} unit="usd" height={260} zero={false} />
        </Panel>
      </div>
    </>
  );
}
