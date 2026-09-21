'use client';
// Shared pieces for the kit's charts: series to chart config, axis and tooltip formatting.
// Every chart here is a shadcn/ui chart recipe (ChartContainer, ChartTooltipContent,
// ChartLegendContent over Recharts 3) fed with the kit's shapes and formatters.
import * as React from 'react';
import type { ChartConfig } from '@/components/ui/chart';
import { byUnit, shortDay, type Unit } from '@/lib/format';

export type Series = { key: string; label: string; color?: string };
/** A chart row: one category or day key plus one number per series. lib/types Point is one of these. */
export type Row = Record<string, string | number>;
export const colorOf = (s: Series, i: number) => s.color ?? `var(--chart-${(i % 8) + 1})`;
export const toConfig = (series: Series[]): ChartConfig => Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: colorOf(s, i) }]));
export const fmtX = (v: unknown) => { const s = String(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? shortDay(s) : s; };
export const pickFormat = (unit: Unit, format?: (v: unknown) => string) => format ?? byUnit[unit];

/** A tooltip row in shadcn's layout with a formatted value. Pass as ChartTooltipContent's formatter. */
export function tooltipRows(config: ChartConfig, f: (v: unknown) => string, totalKeys?: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function TooltipRows(value: any, name: any, item: any, index: number, payload: any) {
    const last = totalKeys && index === totalKeys.length - 1;
    const sum = last ? totalKeys.reduce((a, k) => a + (Number(payload?.[k]) || 0), 0) : 0;
    const color = item?.payload?.fill ?? item?.color ?? config[String(name)]?.color;
    return (
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
          <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
          <span className="ml-auto font-medium tabular-nums text-foreground">{f(value)}</span>
        </div>
        {last ? <div className="flex items-center justify-between gap-4 border-t pt-1.5 leading-none"><span className="font-medium">Total</span><span className="font-medium tabular-nums">{f(sum)}</span></div> : null}
      </div>
    );
  };
}
