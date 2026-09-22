// Shared page furniture for the ported pages: a stat row and a chart panel.
//
// Both are thin wrappers over the kit's Card, kept here rather than repeated in each page. They
// are dashboard-owned, so `datum sync` will not touch them.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { count, pct, price, usd } from '@/lib/format';

export interface Stat {
  label: string;
  value: number | null;
  unit: 'usd' | 'pct' | 'count' | 'price';
  caption: string;
  /** Decimals for the headline number. Defaults to the unit's own convention. */
  digits?: number;
}

/** Null renders as n/a, never 0: "not known" and "zero" are different claims. */
function show(v: number | null, unit: Stat['unit'], digits?: number): string {
  if (v === null) return 'n/a';
  if (unit === 'usd') return usd(v);
  if (unit === 'pct') return pct(v, digits ?? 1);
  if (unit === 'price') return price(v, digits ?? 2);
  return count(v, digits ?? 0);
}

export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardHeader>
            <CardDescription>{s.label}</CardDescription>
            <CardTitle className="font-heading text-2xl font-medium tabular-nums">{show(s.value, s.unit, s.digits)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">{s.caption}</CardContent>
        </Card>
      ))}
    </div>
  );
}

export function Panel({
  title,
  caption,
  children,
  footnote,
}: {
  title: string;
  caption: React.ReactNode;
  children: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{caption}</CardDescription>
      </CardHeader>
      <CardContent>
        {children}
        {footnote ? <p className="mt-3 text-xs text-muted-foreground">{footnote}</p> : null}
      </CardContent>
    </Card>
  );
}
