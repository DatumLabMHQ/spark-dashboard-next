'use client';
// The markets table: the kit's DataTable with Market columns. Every row opens the market's page;
// the market cell is a real link for keyboards. Assets, protocols and chains render as Avatars.
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { AssetAvatar, MarketPair } from '@/components/asset-avatar';
import { DataTable, defineColumns, SortHeader } from '@/components/data-table';
import { pct, usd } from '@/lib/format';
import type { Market } from '@/lib/types';

const RISK_CLASS: Record<Market['risk'], string> = { safe: 'text-(--green)', moderate: 'text-(--yellow)', high: 'text-(--red)' };
const LABELS: Record<string, string> = { collateral: 'Market', protocol: 'Protocol', chain: 'Chain', supplied: 'Supplied', borrowed: 'Borrowed', utilization: 'Utilisation', lltv: 'LLTV', supply_apy: 'Supply APY', borrow_apy: 'Borrow APY' };
const NUMERIC = ['supplied', 'borrowed', 'utilization', 'lltv', 'supply_apy', 'borrow_apy'];

/**
 * Columns a dashboard may drop. Not every lending protocol has every field: Euler's EVK vaults
 * set a different LTV per accepted collateral so no single LLTV exists, and Fluid publishes
 * rates per asset across venues rather than per vault. Rendering those as n/a is worse than
 * not offering the column, so a dashboard names what it cannot fill.
 *
 * `collateral` is not droppable - it is the row's identity and its link.
 */
export type DroppableColumn = 'protocol' | 'chain' | 'supplied' | 'borrowed' | 'utilization' | 'lltv' | 'supply_apy' | 'borrow_apy';

const allColumns = defineColumns<Market>((col) => [
  col.accessor('collateral', {
    header: 'Market', enableHiding: false,
    cell: ({ row }) => (
      <Link href={`/markets/${row.original.id}`} className="flex items-center gap-2.5 outline-none focus-visible:underline">
        <MarketPair collateral={row.original.collateral} loan={row.original.loan} logos={row.original.logos} />
        <span className="leading-tight"><span className="block font-medium">{row.original.collateral}</span><span className="block text-xs text-muted-foreground">{row.original.loan} loan</span></span>
      </Link>
    ),
  }),
  col.accessor('protocol', { header: 'Protocol', cell: ({ row }) => <span className="inline-flex items-center gap-1.5 text-muted-foreground"><AssetAvatar symbol={row.original.protocol} src={row.original.logos?.protocol} className="size-4" />{row.original.protocol}</span> }),
  col.accessor('chain', { header: 'Chain', cell: ({ row }) => <span className="inline-flex items-center gap-1.5 text-muted-foreground"><AssetAvatar symbol={row.original.chain} src={row.original.logos?.chain} className="size-4" />{row.original.chain}</span> }),
  col.accessor('supplied', { header: ({ column }) => <SortHeader column={column} label="Supplied" />, cell: ({ row }) => <span className="tabular-nums">{usd(row.original.supplied)}</span> }),
  col.accessor('borrowed', { header: ({ column }) => <SortHeader column={column} label="Borrowed" />, cell: ({ row }) => <span className="tabular-nums">{usd(row.original.borrowed)}</span> }),
  col.accessor('utilization', {
    header: ({ column }) => <SortHeader column={column} label="Utilisation" />,
    cell: ({ row }) => <Badge variant="outline" className={`px-1.5 tabular-nums ${RISK_CLASS[row.original.risk]}`}><span className="size-1.5 rounded-full bg-current" />{pct(row.original.utilization, 1)}</Badge>,
  }),
  col.accessor('lltv', { header: 'LLTV', cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{pct(row.original.lltv, 1)}</span> }),
  col.accessor('supply_apy', { header: ({ column }) => <SortHeader column={column} label="Supply APY" />, cell: ({ row }) => <span className="tabular-nums">{pct(row.original.supply_apy)}</span> }),
  col.accessor('borrow_apy', { header: ({ column }) => <SortHeader column={column} label="Borrow APY" />, cell: ({ row }) => <span className="tabular-nums">{pct(row.original.borrow_apy)}</span> }),
]);

const search = (m: Market, q: string) => `${m.collateral} ${m.loan} ${m.protocol} ${m.chain}`.toLowerCase().includes(q);

export function MarketsTable({
  data,
  title,
  caption,
  pageSize = 10,
  hideColumns,
}: {
  data: Market[];
  title: string;
  caption: React.ReactNode;
  pageSize?: number;
  /** Columns this protocol cannot fill. They are removed rather than shown as n/a. */
  hideColumns?: DroppableColumn[];
}) {
  const drop = new Set<string>(hideColumns ?? []);
  // Accessor columns carry `accessorKey`, not `id`, so matching on `id` alone silently drops
  // nothing and the column renders n/a down its whole length.
  const keyOf = (c: (typeof allColumns)[number]) =>
    String(c.id ?? (c as { accessorKey?: string }).accessorKey ?? '');
  const columns = drop.size ? allColumns.filter((c) => !drop.has(keyOf(c))) : allColumns;
  const numeric = NUMERIC.filter((n) => !drop.has(n));
  return (
    <DataTable<Market> rows={data} columns={columns} title={title} caption={caption} getRowId={(m) => m.id} rowHref={(m) => `/markets/${m.id}`}
      search={search} searchPlaceholder="Filter markets" numeric={numeric} labels={LABELS} initialSort={[{ id: 'supplied', desc: true }]} pageSize={pageSize} noun="market" empty="No markets match." />
  );
}
