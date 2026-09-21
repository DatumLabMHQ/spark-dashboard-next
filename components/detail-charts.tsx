// The two trend cards on every detail page: value over time (area) and rates or utilisation over
// time (line). Server component; the charts themselves are client components fed plain rows.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, LineChart, type Series } from '@/components/charts';
import type { Point } from '@/lib/types';
import type { Unit } from '@/lib/format';

export function DetailCharts({ history, historySeries, historyTitle, historyDescription, rates, ratesSeries, ratesTitle, ratesDescription, ratesUnit = 'pct', ratesZero = true, asOf }: {
  history: Point[]; historySeries: Series[]; historyTitle: string; historyDescription: React.ReactNode;
  rates?: Point[]; ratesSeries?: Series[]; ratesTitle?: string; ratesDescription?: React.ReactNode; ratesUnit?: Unit; ratesZero?: boolean; asOf: string;
}) {
  return (
    <>
      <Card>
        <CardHeader><CardTitle>{historyTitle}</CardTitle><CardDescription>{historyDescription} Daily points, as of {asOf}.</CardDescription></CardHeader>
        <CardContent className="px-2">{history.length > 1 ? <AreaChart data={history} series={historySeries} unit="usd" height={260} legend /> : <p className="px-4 py-10 text-center text-sm text-muted-foreground">Not enough history yet.</p>}</CardContent>
      </Card>
      {rates && ratesSeries && rates.length > 1 ? (
        <Card>
          <CardHeader><CardTitle>{ratesTitle}</CardTitle><CardDescription>{ratesDescription}</CardDescription></CardHeader>
          <CardContent className="px-2"><LineChart data={rates} series={ratesSeries} unit={ratesUnit} zero={ratesZero} height={220} legend /></CardContent>
        </Card>
      ) : null}
    </>
  );
}
