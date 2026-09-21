'use client';
/* RadialChart: one value against a maximum.
   USE FOR   a single progress or capacity figure that has a natural ceiling: utilisation of a
             market, a supply cap that is x% filled, a target reached. The value sits in the centre.
   NOT FOR   comparing several values (use BarChart); anything without a real maximum
             (a total is not a percentage of anything); trends (use LineChart).
   SHAPE     value and max (max defaults to 100). Pass `unit` from server pages, `format` only from
             client components: a function prop cannot cross the server/client boundary. */
import * as React from 'react';
import * as R from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { byUnit, type Unit } from '@/lib/format';

export function RadialChart({ value, max = 100, label, height = 200, color = 'var(--chart-1)', unit = 'pct', format }: {
  value: number; max?: number; label: string; height?: number; color?: string; unit?: Unit; format?: (v: unknown) => string;
}) {
  // `format` is for client callers; server pages pass `unit` (functions cannot cross to a client component).
  const f = format ?? (unit === 'pct' ? (v: unknown) => `${Number(v).toFixed(0)}%` : byUnit[unit]);
  const config: ChartConfig = { value: { label, color } };
  return (
    <ChartContainer config={config} className="mx-auto aspect-square" style={{ height, width: height }}>
      <R.RadialBarChart data={[{ name: label, value, fill: color }]} startAngle={90} endAngle={-270} innerRadius="66%" outerRadius="90%">
        <R.PolarAngleAxis type="number" domain={[0, max]} tick={false} axisLine={false} />
        <R.RadialBar dataKey="value" background cornerRadius={8} isAnimationActive={false} className="[&_.recharts-radial-bar-background-sector]:fill-muted" />
        <R.PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
          <R.Label content={({ viewBox }) => {
            if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null;
            const cx = Number(viewBox.cx), cy = Number(viewBox.cy);
            return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"><tspan x={cx} y={cy - 4} className="fill-foreground text-xl font-medium">{f(value)}</tspan><tspan x={cx} y={cy + 16} className="fill-muted-foreground text-[11px]">{label}</tspan></text>;
          }} />
        </R.PolarRadiusAxis>
      </R.RadialBarChart>
    </ChartContainer>
  );
}
