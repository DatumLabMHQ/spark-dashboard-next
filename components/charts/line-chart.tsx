'use client';
/* LineChart: a rate or ratio over time.
   USE FOR   APYs, utilisation, spreads, prices, anything read as a level rather than a volume,
             and anything that can cross zero. Up to four series; `dots` when points are sparse.
   NOT FOR   volumes and totals (use AreaChart); categories (use BarChart).
   AXIS      starts at zero; pass `zero={false}` for a level that never nears zero (a price, a NAV) so the axis fits the data.
   SHAPE     data: rows with an x key (ISO day) and one number per series. */
import * as React from 'react';
import * as R from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { Unit } from '@/lib/format';
import { colorOf, fmtX, pickFormat, toConfig, tooltipRows, type Row, type Series } from './chart-utils';

export function LineChart({ data, x = 'day', series, unit = 'pct', height = 260, legend = false, dots = false, curve = 'monotone', zero = true, format }: {
  data: Row[]; x?: string; series: Series[]; unit?: Unit; height?: number; legend?: boolean; dots?: boolean; curve?: 'natural' | 'monotone' | 'linear' | 'step'; zero?: boolean; format?: (v: unknown) => string;
}) {
  const config = toConfig(series); const f = pickFormat(unit, format);
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <R.LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }} accessibilityLayer>
        <R.CartesianGrid vertical={false} />
        <R.XAxis dataKey={x} tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={fmtX} />
        <R.YAxis tickLine={false} axisLine={false} tickMargin={8} tickCount={4} width={unit === 'price' ? 72 : 56} domain={zero ? [0, 'auto'] : ['auto', 'auto']} tickFormatter={(v: number) => f(v)} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator={series.length === 1 ? 'line' : 'dot'} labelFormatter={(l) => fmtX(l)} formatter={tooltipRows(config, f)} />} />
        {series.map((s, i) => <R.Line key={s.key} dataKey={s.key} type={curve} stroke={colorOf(s, i)} strokeWidth={2} dot={dots ? { fill: colorOf(s, i), r: 3, strokeWidth: 0 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />)}
        {legend ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </R.LineChart>
    </ChartContainer>
  );
}
