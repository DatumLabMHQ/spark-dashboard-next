'use client';
/* AreaChart: a quantity over time.
   USE FOR   totals that accumulate or drift (supplied, borrowed, TVL, volume). Stacked when the
             series are parts of one whole; `expand` to show the share of each part over time.
   NOT FOR   rates, ratios or anything that can go negative (use LineChart); few points
             (use BarChart); comparing categories (use BarChart).
   SHAPE     data: rows with an x key (ISO day) and one number per series. */
import * as React from 'react';
import * as R from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { Unit } from '@/lib/format';
import { colorOf, fmtX, pickFormat, toConfig, tooltipRows, type Row, type Series } from './chart-utils';

export function AreaChart({ data, x = 'day', series, stacked = false, expand = false, unit = 'usd', height = 260, legend = false, curve = 'natural', format }: {
  data: Row[]; x?: string; series: Series[]; stacked?: boolean; expand?: boolean; unit?: Unit; height?: number; legend?: boolean; curve?: 'natural' | 'monotone' | 'linear' | 'step'; format?: (v: unknown) => string;
}) {
  const config = toConfig(series); const f = pickFormat(unit, format); const id = React.useId().replace(/:/g, '');
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <R.AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }} stackOffset={expand ? 'expand' : 'none'} accessibilityLayer>
        <defs>{series.map((s, i) => (
          <linearGradient key={s.key} id={`f-${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colorOf(s, i)} stopOpacity={0.8} /><stop offset="95%" stopColor={colorOf(s, i)} stopOpacity={0.1} />
          </linearGradient>))}</defs>
        <R.CartesianGrid vertical={false} />
        <R.XAxis dataKey={x} tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={fmtX} />
        <R.YAxis tickLine={false} axisLine={false} tickMargin={8} tickCount={4} width={56} domain={expand ? [0, 1] : undefined} ticks={expand ? [0, 0.25, 0.5, 0.75, 1] : undefined}
          tickFormatter={expand ? (v: number) => `${Math.round(v * 100)}%` : (v: number) => f(v)} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(l) => fmtX(l)} formatter={tooltipRows(config, expand ? (v) => `${(Number(v) * 100).toFixed(1)}%` : f, stacked && !expand ? series.map((s) => s.key) : undefined)} />} />
        {series.map((s, i) => <R.Area key={s.key} dataKey={s.key} type={curve} stroke={colorOf(s, i)} strokeWidth={2} fill={`url(#f-${id}-${i})`} fillOpacity={0.4} stackId={stacked ? 'a' : undefined} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />)}
        {legend ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </R.AreaChart>
    </ChartContainer>
  );
}
