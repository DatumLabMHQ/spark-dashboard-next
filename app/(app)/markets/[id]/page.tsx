import { notFound } from 'next/navigation';
import { loadMarket } from '@/lib/data';
import { count, pct, usd } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { PageBreadcrumb } from '@/components/page-breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AssetAvatar, MarketPair } from '@/components/asset-avatar';
import { BarChart, RadialChart } from '@/components/charts';
import { MarketCharts } from '@/components/market-charts';
import { MarketDetailLayout } from '@/components/market-detail-layout';
import { MarketFacts, MarketHolders } from '@/components/market-facts';
import { CardRow } from '@/components/card-row';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const d = await loadMarket(id);
  return { title: d ? `${d.market.collateral} / ${d.market.loan}` : 'Market' };
}

const RISK_CLASS = { safe: 'text-(--green)', moderate: 'text-(--yellow)', high: 'text-(--red)' } as const;

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadMarket(id);
  if (!d) notFound();
  const m = d.market;
  const idle = m.supplied - m.borrowed;
  const stat = (label: string, value: string, sub: string) => (
    <Card className="@container/card"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl font-medium tracking-tight tabular-nums">{value}</CardTitle><CardDescription>{sub}</CardDescription></CardHeader></Card>
  );
  return (
    <>
      <div className="flex flex-col gap-3 px-4 lg:px-6">
        <PageBreadcrumb items={[{ label: 'Markets', href: '/markets' }, { label: `${m.collateral} / ${m.loan}` }]} />
        <div className="flex flex-wrap items-center gap-3">
          <MarketPair collateral={m.collateral} loan={m.loan} logos={m.logos} className="size-9" />
          <div>
            <h1 className="font-serif text-[1.75rem] font-medium leading-tight tracking-tight">{m.collateral} / {m.loan}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><AssetAvatar symbol={m.protocol} src={m.logos?.protocol} className="size-4" />{m.protocol}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5"><AssetAvatar symbol={m.chain} src={m.logos?.chain} className="size-4" />{m.chain}</span>
              <Badge variant="outline" className={RISK_CLASS[m.risk]}><span className="size-1.5 rounded-full bg-current" />{pct(m.utilization, 1)} utilised</Badge>
            </p>
          </div>
        </div>
        <p className="max-w-[72ch] text-sm text-muted-foreground">
          {usd(m.supplied)} supplied, {usd(m.borrowed)} borrowed, {usd(idle)} idle. {m.risk === 'high' ? 'Utilisation is above 85%, so withdrawals may queue and rates are climbing.' : m.risk === 'moderate' ? 'Utilisation is in the healthy band: demand without a withdrawal queue.' : 'Plenty of idle liquidity, so rates are soft.'} As of {d.asOf}.
        </p>
      </div>
      <MarketDetailLayout
        main={<>
          <div className="grid grid-cols-2 gap-4 @2xl/main:grid-cols-4">
            {stat('Supplied', usd(m.supplied), 'in this market')}
            {stat('Borrowed', usd(m.borrowed), `${pct(m.utilization, 1)} of supply`)}
            {stat('Supply APY', pct(m.supply_apy), 'annualised')}
            {stat('Borrow APY', pct(m.borrow_apy), 'annualised')}
          </div>
          <MarketCharts history={d.history} rates={d.rates} asOf={d.asOf} />
          {/* Data cards sit in the main column in a CardRow: the health chart sets the row's height and the
              supplier list scrolls inside it, so the row, and the aside beside it, end on one line. */}
          {d.healthBands.length || d.suppliers.length ? (
            <CardRow>
              {d.healthBands.length ? (
                <Card>
                  <CardHeader><CardTitle>Collateral by health factor</CardTitle><CardDescription>How much collateral sits close to liquidation. The band below 1.05 is what a small price move would clear.{d.healthCoverage ? ` Sampled from the ${count(d.healthCoverage.borrowers)} largest borrowers, ${pct(d.healthCoverage.pct, 0)} of the market's debt.` : ''}</CardDescription></CardHeader>
                  <CardContent className="px-2"><BarChart data={d.healthBands} x="name" series={[{ key: 'value', label: 'Collateral' }]} unit="usd" horizontal labels height={220} categoryWidth={80} /></CardContent>
                </Card>
              ) : null}
              {d.suppliers.length ? <MarketHolders suppliers={d.suppliers} /> : null}
            </CardRow>
          ) : null}
        </>}
        aside={<>
          <Card>
            <CardHeader><CardTitle>Utilisation</CardTitle><CardDescription>Against the 85% line where withdrawals start to queue.</CardDescription></CardHeader>
            <CardContent><RadialChart value={m.utilization} label="utilised" height={180} color={m.risk === 'high' ? 'var(--red)' : m.risk === 'moderate' ? 'var(--yellow)' : 'var(--chart-1)'} /></CardContent>
          </Card>
          <MarketFacts facts={d.facts} />
        </>}
      />
    </>
  );
}
