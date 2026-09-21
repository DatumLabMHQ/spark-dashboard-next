'use client';
/* BarChart: compare categories, or a few periods.
   USE FOR   one value per category (supply by chain, by protocol, by asset); `horizontal` for
             rankings and long labels; `stacked` for composition per period; `labels` to print
             the values when there are few bars.
   NOT FOR   long time series (use AreaChart or LineChart); more than about twelve categories
             (rank and cut, or use a table); shares of a whole with few slices (use DonutChart).
   SHAPE     data: rows with an x key (the category) and one number per series. */
import * as React from 'react';
import * as R from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { Unit } from '@/lib/format';
import { colorOf, fmtX, pickFormat, toConfig, tooltipRows, type Row, type Series } from './chart-utils';

export function BarChart({ data, x = 'name', series, stacked = false, horizontal = false, unit = 'usd', height = 260, legend = false, labels = false, categoryWidth = 96, format }: {
  data: Row[]; x?: string; series: Series[]; stacked?: boolean; horizontal?: boolean; unit?: Unit; height?: number; legend?: boolean; labels?: boolean; categoryWidth?: number; format?: (v: unknown) => string;
}) {
  const config = toConfig(series); const f = pickFormat(unit, format); const last = series.length - 1;
  const radius = (i: number): number | [number, number, number, number] => {
    if (!stacked) return 6;
    if (horizontal) return i === 0 ? [4, 0, 0, 4] : i === last ? [0, 4, 4, 0] : 0;
    return i === 0 ? [0, 0, 4, 4] : i === last ? [4, 4, 0, 0] : 0;
  };
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <R.BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ left: 0, right: labels && horizontal ? 56 : 12, top: labels && !horizontal ? 20 : 8, bottom: 0 }} accessibilityLayer>
        <R.CartesianGrid vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (<>
          <R.XAxis type="number" hide />
          <R.YAxis dataKey={x} type="category" tickLine={false} axisLine={false} tickMargin={8} width={categoryWidth} />
        </>) : (<>
          <R.XAxis dataKey={x} tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} tickFormatter={fmtX} />
          <R.YAxis tickLine={false} axisLine={false} tickMargin={8} tickCount={4} width={56} tickFormatter={(v: number) => f(v)} />
        </>)}
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator={stacked ? 'dot' : 'dashed'} hideLabel={horizontal} labelFormatter={(l) => fmtX(l)} formatter={tooltipRows(config, f, stacked ? series.map((s) => s.key) : undefined)} />} />
        {legend ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {series.map((s, i) => (
          <R.Bar key={s.key} dataKey={s.key} fill={colorOf(s, i)} stackId={stacked ? 'a' : undefined} radius={radius(i)} isAnimationActive={false}>
            {labels ? <R.LabelList dataKey={s.key} position={horizontal ? 'right' : 'top'} offset={8} fontSize={11} className="fill-muted-foreground" formatter={(v: unknown) => f(v)} /> : null}
          </R.Bar>))}
      </R.BarChart>
    </ChartContainer>
  );
}
