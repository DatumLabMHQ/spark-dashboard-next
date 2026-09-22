/**
 * Loaders for Spark's ported pages.
 *
 * The source pages are CLIENT components that fetch `/api/*` with `useCachedFetch`. The kit's
 * pages are server components, so the fetching moves here and the pages render on the server.
 * Same routes, same numbers: those routes were copied into this app wholesale (see lib/spark.ts).
 *
 * Shapes are reworked for the kit's charts, which take `Row[]` plus `Series[]` and key their x
 * axis on a date string rather than a unix timestamp.
 */

import { cache } from 'react';
import type { Row } from '@/components/charts';
// This app's own API, origin and basePath resolved at runtime. See lib/api-base.ts.
import { SPARK_API as API } from './api-base';

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// One definition, owned by the component that renders it.
import type { Stat } from '@/components/page-parts';
export type { Stat };

const isoDay = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

// ─── Shared response shapes, narrowed to the fields actually read ─────────

interface MonthlyRow {
  month?: string;
  products?: Record<string, { gross?: number; net?: number }>;
}
interface SllDailyRow {
  date?: string;
  baseRatePct?: number;
  realApyPct?: number;
  spreadPct?: number;
  totalAssetsUsd?: number;
}
interface FinancialsResp {
  monthly?: MonthlyRow[];
  sllDaily?: SllDailyRow[];
  meta?: { latestMonthIsPartial?: boolean };
}
interface EcosystemResp {
  daily?: Array<{ date: number; savings?: number; sparklend?: number; sll?: number; total?: number }>;
  current?: { savings?: number; sparklend?: number; sll?: number; total?: number };
  savingsByChain?: { chains?: string[]; daily?: Array<Record<string, number>> };
  sllByChain?: { chains?: string[]; daily?: Array<Record<string, number>> };
}

const sumProducts = (row: MonthlyRow | undefined, side: 'gross' | 'net'): number =>
  Object.values(row?.products ?? {}).reduce((a, p) => a + (Number(p?.[side]) || 0), 0);

/** Re-key a `{ date, ...chains }` series on an ISO day for the kit's charts. */
const chainRows = (daily: Array<Record<string, number>> | undefined): Row[] =>
  (daily ?? []).map((r) => ({ ...(r as unknown as Row), day: isoDay(Number(r.date)) }));

// ─── Financials ───────────────────────────────────────────────────────────

export interface FinancialsPage {
  asOf: string;
  stats: Stat[];
  /** Per settled month, gross fees split into what Spark keeps and what it pays away. */
  monthlyNet: Array<Row & { name: string; net: number }>;
  /** Revenue by product line for the last settled month. */
  byProduct: Array<{ name: string; value: number }>;
  /** SLL spread: what the book earns against what it pays Sky. */
  spread: Row[];
  settledMonth: string | null;
}

export const loadFinancials = cache(async (): Promise<FinancialsPage> => {
  const f = await get<FinancialsResp>('/api/financials');
  const monthly = f?.monthly ?? [];

  // The newest month is always incomplete: Distribution Rewards settle as a lagging monthly
  // off-chain rebate. Reading it as finished understates revenue, so the reported month is the
  // last SETTLED one.
  const partial = f?.meta?.latestMonthIsPartial !== false;
  const settledIdx = monthly.length - (partial ? 2 : 1);
  const settled = settledIdx >= 0 ? monthly[settledIdx] : undefined;

  const products = settled?.products ?? {};

  return {
    asOf: new Date().toISOString().slice(0, 10),
    settledMonth: settled?.month ?? null,
    stats: [
      { label: 'Net revenue, last settled month', value: sumProducts(settled, 'net'), unit: 'usd', caption: settled?.month ?? 'No settled month' },
      { label: 'Gross, last settled month', value: sumProducts(settled, 'gross'), unit: 'usd', caption: 'Before what Spark pays away' },
      {
        label: 'Cumulative net revenue',
        value: monthly.reduce((a, m) => a + sumProducts(m, 'net'), 0),
        unit: 'usd',
        caption: 'Every month on record',
      },
      {
        label: 'Months on record',
        value: monthly.length,
        unit: 'count',
        caption: 'First-party, via Block Analitica',
      },
    ],
    monthlyNet: monthly.map((m) => ({ name: m.month ?? '', net: sumProducts(m, 'net') })),
    byProduct: Object.entries(products)
      .map(([name, v]) => ({ name, value: Number(v?.net) || 0 }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value),
    spread: (f?.sllDaily ?? [])
      .filter((r) => r.date)
      .map((r) => ({
        day: String(r.date).slice(0, 10),
        earned: Number(r.realApyPct) || 0,
        paid: Number(r.baseRatePct) || 0,
      })),
  };
});

// ─── Liquidity Layer ──────────────────────────────────────────────────────

export interface SllPage {
  asOf: string;
  stats: Stat[];
  /** Where the Liquidity Layer's capital sits, by destination. */
  categories: Array<Row & { name: string; usd: number }>;
  /** Daily AUM split by chain. */
  byChain: { series: Array<{ key: string; label: string }>; rows: Row[] };
  ownShare: number;
  sparkLendShare: number;
  largestPositions: Array<Row & { name: string; usd: number }>;
}

interface SllResp {
  totalUsd?: number;
  asOf?: string;
  change30d?: { pct?: number };
  categories?: Array<{ category: string; usd: number; own: boolean }>;
  positions?: Array<{ label: string; usd: number }>;
  history?: { chains?: string[]; daily?: Array<Record<string, number>> };
  ownShare?: number;
  sparkLendShare?: number;
}

export const loadSll = cache(async (): Promise<SllPage> => {
  const s = await get<SllResp>('/api/sll-venues');

  return {
    asOf: s?.asOf ?? new Date().toISOString().slice(0, 10),
    stats: [
      { label: 'Liquidity Layer AUM', value: s?.totalUsd ?? 0, unit: 'usd', caption: 'Total deployed' },
      { label: 'Change, 30d', value: s?.change30d?.pct ?? null, unit: 'pct', caption: 'Against thirty days ago' },
      { label: 'Deployed into Spark', value: s?.ownShare ?? null, unit: 'pct', caption: "Spark's own venues" },
      { label: 'Into SparkLend alone', value: s?.sparkLendShare ?? null, unit: 'pct', caption: 'The single largest destination' },
    ],
    categories: (s?.categories ?? [])
      .filter((c) => c.usd > 0)
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 12)
      .map((c) => ({ name: c.category, usd: c.usd })),
    byChain: {
      series: (s?.history?.chains ?? []).map((c) => ({ key: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
      rows: chainRows(s?.history?.daily),
    },
    ownShare: s?.ownShare ?? 0,
    sparkLendShare: s?.sparkLendShare ?? 0,
    largestPositions: (s?.positions ?? [])
      .filter((p) => p.usd > 0)
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 12)
      .map((p) => ({ name: p.label, usd: p.usd })),
  };
});

// ─── Savings ──────────────────────────────────────────────────────────────

export interface SavingsPage {
  asOf: string;
  stats: Stat[];
  history: Row[];
  byChain: { series: Array<{ key: string; label: string }>; rows: Row[] };
}

export const loadSavings = cache(async (): Promise<SavingsPage> => {
  const e = await get<EcosystemResp>('/api/ecosystem');
  const daily = e?.daily ?? [];
  const latest = daily[daily.length - 1];
  const monthAgo = daily[daily.length - 31];
  const change30d =
    latest && monthAgo && (monthAgo.savings ?? 0) > 0
      ? (((latest.savings ?? 0) - (monthAgo.savings ?? 0)) / (monthAgo.savings ?? 1)) * 100
      : null;

  return {
    asOf: latest ? isoDay(latest.date) : new Date().toISOString().slice(0, 10),
    stats: [
      { label: 'Savings TVL', value: e?.current?.savings ?? 0, unit: 'usd', caption: 'sUSDS and sDAI' },
      { label: 'Change, 30d', value: change30d, unit: 'pct', caption: 'Against thirty days ago' },
      {
        label: 'Share of ecosystem',
        value: e?.current?.total ? ((e.current.savings ?? 0) / e.current.total) * 100 : null,
        unit: 'pct',
        caption: 'Of Savings plus SparkLend plus SLL',
      },
    ],
    history: daily.map((d) => ({ day: isoDay(d.date), savings: d.savings ?? 0 })),
    byChain: {
      series: (e?.savingsByChain?.chains ?? []).map((c) => ({ key: c, label: c })),
      rows: chainRows(e?.savingsByChain?.daily),
    },
  };
});

// ─── SPK ──────────────────────────────────────────────────────────────────

export interface SpkPage {
  asOf: string;
  stats: Stat[];
  priceHistory: Row[];
  /** Top holders by share of the tracked balance. */
  holders: Array<Row & { name: string; share: number }>;
  categories: Array<{ name: string; value: number }>;
  hhi: number | null;
  buybackSpk: number | null;
  buybackUsds: number | null;
  cushionMonths: number | null;
}

export const loadSpk = cache(async (): Promise<SpkPage> => {
  const [tok, hold, buy] = await Promise.all([
    get<{ daily?: Array<{ date: number; price: number; mcap: number }>; current?: { price?: number; mcap?: number } }>('/api/spk-token'),
    get<{ holders?: Array<{ shortAddress: string; label: string | null; share: number }>; categories?: Array<{ category: string; share: number }>; hhi?: number }>('/api/spk-holders'),
    get<{ threshold?: { cushionMonths?: number | null } }>('/api/buybacks'),
  ]);
  const fin = await get<{ buybackDaily?: Array<{ totalSpkBought?: number; totalUsdsSpent?: number }> }>('/api/financials');
  const lastBuyback = (fin?.buybackDaily ?? []).at(-1);

  return {
    asOf: new Date().toISOString().slice(0, 10),
    stats: [
      { label: 'SPK price', value: tok?.current?.price ?? null, unit: 'price', caption: 'Spot' },
      { label: 'Market cap', value: tok?.current?.mcap ?? null, unit: 'usd', caption: 'Circulating' },
      { label: 'SPK bought back', value: lastBuyback?.totalSpkBought ?? null, unit: 'count', caption: 'Cumulative, in SPK' },
      { label: 'Buyback runway', value: buy?.threshold?.cushionMonths ?? null, unit: 'count', digits: 1, caption: 'Months at the current budget' },
    ],
    priceHistory: (tok?.daily ?? []).map((d) => ({ day: isoDay(d.date), price: d.price })),
    holders: (hold?.holders ?? []).slice(0, 12).map((h) => ({ name: h.label ?? h.shortAddress, share: h.share })),
    categories: (hold?.categories ?? []).map((c) => ({ name: c.category, value: c.share })),
    hhi: hold?.hhi ?? null,
    buybackSpk: lastBuyback?.totalSpkBought ?? null,
    buybackUsds: lastBuyback?.totalUsdsSpent ?? null,
    cushionMonths: buy?.threshold?.cushionMonths ?? null,
  };
});

// ─── Liquidations ─────────────────────────────────────────────────────────

export interface LiquidationsPage {
  asOf: string;
  stats: Stat[];
  /** Events per month, so a spike is visible against a normal month. */
  byMonth: Array<Row & { name: string; events: number }>;
  topLiquidators: Array<Row & { name: string; events: number }>;
  topCollateral: Array<Row & { name: string; events: number }>;
}

interface LiqEvent {
  timestamp: number;
  collateralAsset?: string;
  liquidator?: string;
}

export const loadLiquidations = cache(async (): Promise<LiquidationsPage> => {
  const r = await get<{ events?: LiqEvent[]; totalEvents?: number }>('/api/liquidations');
  const events = r?.events ?? [];

  const monthKey = (t: number) => new Date(t * 1000).toISOString().slice(0, 7);
  const tally = (key: (e: LiqEvent) => string | undefined) => {
    const m = new Map<string, number>();
    for (const e of events) {
      const k = key(e);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };

  const byMonth = [...tally((e) => monthKey(e.timestamp)).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, events]) => ({ name, events }));

  const rank = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, events]) => ({ name, events }));

  const liquidators = tally((e) => e.liquidator);

  return {
    asOf: events.length ? isoDay(events[0].timestamp) : new Date().toISOString().slice(0, 10),
    stats: [
      { label: 'Liquidations on record', value: r?.totalEvents ?? events.length, unit: 'count', caption: 'Since SparkLend launched' },
      { label: 'Distinct liquidators', value: liquidators.size, unit: 'count', caption: 'Addresses that have liquidated' },
      {
        label: 'Busiest month',
        value: byMonth.length ? Math.max(...byMonth.map((m) => m.events)) : 0,
        unit: 'count',
        caption: byMonth.length ? byMonth.reduce((a, b) => (b.events > a.events ? b : a)).name : 'None',
      },
      {
        label: 'Top liquidator share',
        value: liquidators.size ? (Math.max(...liquidators.values()) / events.length) * 100 : null,
        unit: 'pct',
        caption: 'Of all events, by the busiest address',
      },
    ],
    byMonth,
    topLiquidators: rank(liquidators, 10).map((x) => ({ ...x, name: `${x.name.slice(0, 6)}…${x.name.slice(-4)}` })),
    topCollateral: rank(tally((e) => e.collateralAsset), 10),
  };
});

// ─── The book over time ───────────────────────────────────────────────────

export interface BookPage {
  asOf: string;
  stats: Stat[];
  /** Supplied and borrowed on Ethereum, daily. */
  history: Row[];
  /** Latest per-asset supplied and borrowed. */
  byAsset: Array<Row & { name: string; supplied: number; borrowed: number }>;
}

interface TokenPoint {
  date: number;
  tokens: Record<string, number>;
}

export const loadBook = cache(async (): Promise<BookPage> => {
  const b = await get<{ supply?: { tokensInUsd?: TokenPoint[] }; borrow?: { tokensInUsd?: TokenPoint[] } }>('/api/sparklend');
  const sup = b?.supply?.tokensInUsd ?? [];
  const bor = b?.borrow?.tokensInUsd ?? [];

  const total = (p: TokenPoint | undefined) =>
    Object.values(p?.tokens ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);

  const borByDate = new Map(bor.map((p) => [p.date, p]));
  const history: Row[] = sup.slice(-365).map((p) => ({
    day: isoDay(p.date),
    supplied: total(p),
    borrowed: total(borByDate.get(p.date)),
  }));

  const latestSup = sup.at(-1);
  const latestBor = bor.at(-1);
  const symbols = new Set([...Object.keys(latestSup?.tokens ?? {}), ...Object.keys(latestBor?.tokens ?? {})]);
  const byAsset = [...symbols]
    .map((s) => ({
      name: s,
      supplied: Number(latestSup?.tokens?.[s]) || 0,
      borrowed: Number(latestBor?.tokens?.[s]) || 0,
    }))
    .filter((a) => a.supplied > 0 || a.borrowed > 0)
    .sort((a, b) => Math.max(b.supplied, b.borrowed) - Math.max(a.supplied, a.borrowed))
    .slice(0, 12);

  const suppliedNow = total(latestSup);
  const borrowedNow = total(latestBor);

  return {
    asOf: latestSup ? isoDay(latestSup.date) : new Date().toISOString().slice(0, 10),
    stats: [
      { label: 'Supplied', value: suppliedNow, unit: 'usd', caption: 'SparkLend on Ethereum' },
      { label: 'Borrowed', value: borrowedNow, unit: 'usd', caption: 'Outstanding debt' },
      {
        label: 'Utilisation',
        value: suppliedNow > 0 ? (borrowedNow / suppliedNow) * 100 : null,
        unit: 'pct',
        caption: 'Borrowed over supplied',
      },
      { label: 'Assets listed', value: symbols.size, unit: 'count', caption: 'With a balance on either side' },
    ],
    history,
    byAsset,
  };
});
