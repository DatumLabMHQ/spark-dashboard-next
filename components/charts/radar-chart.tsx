'use client';
/* RadarChart: a profile across several dimensions.
   USE FOR   scoring one or two things on four to eight axes that share a scale (a risk
             profile: liquidity, oracle, governance, collateral quality; a protocol scorecard).
   NOT FOR   values on different scales (normalise first or use a table); time series;
             more than three series (it becomes a tangle); precise reading (use BarChart).
   SHAPE     data: [{ axis, ...one number per series }]. */
import * as React from 'react';
import * as R from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { Unit } from '@/lib/format';
import { colorOf, pickFormat, toConfig, tooltipRows, type Row, type Series } from './chart-utils';

export function RadarChart({ data, axisKey = 'axis', series, unit = 'count', height = 280, grid = 'polygon', dots = false, legend = false, format }: {
  data: Row[]; axisKey?: string; series: Series[]; unit?: Unit; height?: number; grid?: 'polygon' | 'circle'; dots?: boolean; legend?: boolean; format?: (v: unknown) => string;
}) {
  const config = toConfig(series); const f = pickFormat(unit, format);
  return (
    <ChartContainer config={config} className="mx-auto aspect-square" style={{ height, maxWidth: '100%' }}>
      <R.RadarChart data={data} margin={{ top: 12, bottom: 12 }}>
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator={series.length > 1 ? 'line' : 'dot'} formatter={tooltipRows(config, f)} />} />
        <R.PolarAngleAxis dataKey={axisKey} />
        <R.PolarGrid gridType={grid} />
        {series.map((s, i) => <R.Radar key={s.key} dataKey={s.key} fill={colorOf(s, i)} stroke={colorOf(s, i)} fillOpacity={Math.max(0.15, 0.5 - i * 0.15)} dot={dots ? { r: 4, fillOpacity: 1 } : false} isAnimationActive={false} />)}
        {legend ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </R.RadarChart>
    </ChartContainer>
  );
}
