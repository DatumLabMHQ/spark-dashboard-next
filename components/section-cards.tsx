// The KPI row: shadcn's section-cards recipe, fed by our normalised data instead of hardcoded
// numbers. No "use client": nothing here has state, so it renders on the server with the data.
import { TrendDownIcon, TrendUpIcon } from '@phosphor-icons/react/ssr';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { count, delta, pct, usd } from '@/lib/format';
import type { Overview } from '@/lib/types';

type Stat = { label: string; value: string; change?: number; headline: string; detail: string };

function Trend({ change }: { change: number }) {
  const Icon = change >= 0 ? TrendUpIcon : TrendDownIcon;
  return <Badge variant="outline"><Icon />{delta(change)}</Badge>;
}

export function SectionCards({ kpis, asOf }: { kpis: Overview['kpis']; asOf: string }) {
  const stats: Stat[] = [
    { label: 'Supplied', value: usd(kpis.supplied), change: kpis.suppliedChange7d,
      headline: kpis.suppliedChange7d >= 0 ? 'Growing over the week' : 'Shrinking over the week', detail: `Across ${count(kpis.markets)} listed markets, as of ${asOf}` },
    { label: 'Borrowed', value: usd(kpis.borrowed), change: kpis.borrowedChange7d,
      headline: kpis.borrowedChange7d >= kpis.suppliedChange7d ? 'Demand outpacing supply' : 'Supply outpacing demand', detail: 'Outstanding debt in listed markets' },
    { label: 'Utilisation', value: pct(kpis.utilization, 1),
      headline: kpis.utilization > 85 ? 'Above the withdrawal-queue line' : kpis.utilization > 70 ? 'Healthy demand for liquidity' : 'Ample idle liquidity', detail: 'Borrowed divided by supplied' },
    { label: 'Supply APY, weighted', value: pct(kpis.supplyApy, 2),
      headline: 'What suppliers earn today', detail: 'Weighted by supplied value' },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {stats.map((s) => (
        <Card key={s.label} className="@container/card">
          <CardHeader>
            <CardDescription>{s.label}</CardDescription>
            <CardTitle className="text-2xl font-medium tracking-tight tabular-nums @[250px]/card:text-3xl">{s.value}</CardTitle>
            {s.change !== undefined ? <CardAction><Trend change={s.change} /></CardAction> : null}
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              {s.headline}
              {s.change !== undefined ? (s.change >= 0 ? <TrendUpIcon className="size-4" /> : <TrendDownIcon className="size-4" />) : null}
            </div>
            <div className="text-muted-foreground">{s.detail}</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
