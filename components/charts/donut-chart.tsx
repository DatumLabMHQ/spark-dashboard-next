'use client';
/* DonutChart: shares of one whole.
   USE FOR   composition at one moment (share by protocol, by chain, by collateral) with two to
             six slices; the centre carries the total, hover isolates one slice.
   NOT FOR   more than six slices (rank and group the rest as Other, or use a horizontal
             BarChart); change over time (use a stacked AreaChart with `expand`); comparing
             two wholes side by side (use BarChart).
   SHAPE     items: [{ name, value, color? }]. */
import * as React from 'react';
import * as R from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { Share } from '@/lib/types';
import type { Unit } from '@/lib/format';
import { pickFormat, tooltipRows } from './chart-utils';

export function DonutChart({ items, unit = 'usd', height = 220, centerLabel = 'total', legend = true, thickness = 28, format }: {
  items: Share[]; unit?: Unit; height?: number; centerLabel?: string; legend?: boolean; thickness?: number; format?: (v: unknown) => string;
}) {
  const f = pickFormat(unit, format);
  const [hover, setHover] = React.useState<number | null>(null);
  const data = items.filter((d) => d.value > 0).map((d, i) => ({ ...d, fill: d.color ?? `var(--chart-${(i % 8) + 1})` }));
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  const config: ChartConfig = Object.fromEntries(data.map((d) => [d.name, { label: d.name, color: d.fill }]));
  const focus = hover !== null ? data[hover] : null;
  const outer = height / 2 - 8; const inner = Math.max(0, outer - thickness);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <ChartContainer config={config} className="aspect-square shrink-0" style={{ height, width: height }}>
        <R.PieChart>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={tooltipRows(config, f)} />} />
          <R.Pie data={data} dataKey="value" nameKey="name" innerRadius={inner} outerRadius={outer} strokeWidth={4} stroke="var(--card)" isAnimationActive={false}
            onMouseEnter={(_, i) => setHover(i)} onMouseLeave={() => setHover(null)}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activeShape={(p: any) => <R.Sector {...p} outerRadius={(p.outerRadius ?? outer) + 6} />}>
            <R.Label content={({ viewBox }) => {
              if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null;
              const cx = Number(viewBox.cx), cy = Number(viewBox.cy);
              return (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={cx} y={cy - 4} className="fill-foreground text-xl font-medium">{focus ? f(focus.value) : f(total)}</tspan>
                  <tspan x={cx} y={cy + 16} className="fill-muted-foreground text-[11px]">{focus ? `${((focus.value / total) * 100).toFixed(0)}%` : centerLabel}</tspan>
                </text>
              );
            }} />
          </R.Pie>
        </R.PieChart>
      </ChartContainer>
      {legend ? (
        <ul className="flex min-w-36 flex-1 flex-col gap-1 text-sm">
          {data.map((d, i) => (
            <li key={d.name}>
              <button type="button" className={`flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/50 ${hover !== null && hover !== i ? 'opacity-40' : ''}`}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${d.name}, ${f(d.value)}`}>
                <span className="size-2 shrink-0 rounded-[2px]" style={{ background: d.fill }} /><span className="flex-1 truncate">{d.name}</span><span className="tabular-nums text-muted-foreground">{f(d.value)}</span>
              </button>
            </li>))}
        </ul>
      ) : null}
    </div>
  );
}
