'use client';
// The market's own history: supplied and borrowed (area), rates and utilisation (line), one
// native select for the range shared by both.
import * as React from 'react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { AreaChart, LineChart } from '@/components/charts';
import type { Point } from '@/lib/types';

const RANGES = [{ value: 90, label: 'Last 3 months' }, { value: 30, label: 'Last 30 days' }, { value: 7, label: 'Last 7 days' }];
const cut = (rows: Point[], days: number) => {
  if (!rows.length) return rows;
  const last = new Date(String(rows[rows.length - 1].day) + 'T00:00:00Z'); const start = new Date(last); start.setUTCDate(last.getUTCDate() - days);
  return rows.filter((p) => new Date(String(p.day) + 'T00:00:00Z') >= start);
};

export function MarketCharts({ history, rates, asOf }: { history: Point[]; rates: Point[]; asOf: string }) {
  const [days, setDays] = React.useState(90);
  return (
    <>
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Supplied and borrowed</CardTitle>
          <CardDescription>The market&rsquo;s own book. Borrowed climbing towards supplied is utilisation rising, and rates with it. Daily, as of {asOf}.</CardDescription>
          <CardAction>
            <NativeSelect size="sm" aria-label="Time range" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
              {RANGES.map((r) => <NativeSelectOption key={r.value} value={String(r.value)}>{r.label}</NativeSelectOption>)}
            </NativeSelect>
          </CardAction>
        </CardHeader>
        <CardContent className="px-2 sm:px-6"><AreaChart data={cut(history, days)} series={[{ key: 'supply', label: 'Supplied' }, { key: 'borrow', label: 'Borrowed' }]} unit="usd" height={240} legend /></CardContent>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Rates and utilisation</CardTitle>
          <CardDescription>What suppliers earn, what borrowers pay, and the utilisation that drives both. Above 85% withdrawals start to queue.</CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-6"><LineChart data={cut(rates, days)} series={[{ key: 'supply_apy', label: 'Supply APY' }, { key: 'borrow_apy', label: 'Borrow APY' }, { key: 'utilization', label: 'Utilisation', color: 'var(--chart-3)' }]} unit="pct" height={240} legend /></CardContent>
      </Card>
    </>
  );
}
