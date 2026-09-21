// Fills the kit's normalised shapes (lib/types.ts) from Spark's own data.
//
// Spark differs from the Euler and Fluid ports. Those repos keep their logic in lib/ builders that
// could simply be copied; this one keeps it inside route handlers, and the buyback route reads
// contracts through viem. Those route handlers were therefore copied into this app (app/api/*,
// plus lib/contracts.ts and lib/spark-config.ts), so it stands alone and the old
// sparklend-dashboard deployment can be retired.
//
// The corrections came with them, which is the point. /api/financials is deliberately first-party
// through Block Analitica: DefiLlama's spark-liquidity-layer fees adapter under-captures its own
// source and turns a positive month negative. Nothing here may reintroduce DefiLlama as a revenue
// source.
//
// When a Spark product lands on the Datum platform, this file and those routes are what change.

import { cache } from 'react';
import { chainLogo, protocolLogo } from './chains';
import type { Market, MarketDetail, Overview, Point, Share } from './types';

/**
 * This app's OWN API routes. The Spark route handlers were copied in so the dashboard stands on
 * its own; it no longer depends on the old sparklend-dashboard deployment.
 *
 * Server-side fetch needs an absolute URL, so the origin comes from VERCEL_URL in a deployment
 * and falls back to the local dev port. SPARK_API_BASE overrides both, which is how you would
 * temporarily point this at another instance.
 */
const SPARK_API =
  process.env.SPARK_API_BASE ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3022');

const risk = (u: number): Market['risk'] => (u > 85 ? 'high' : u > 70 ? 'moderate' : 'safe');
const isoDay = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);
const pctChange = (now: number, then: number) => (then > 0 ? (now / then - 1) * 100 : 0);

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SPARK_API}${path}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface Reserve {
  symbol: string; address: string; price: number;
  totalSupply: number; totalBorrow: number;
  supplyAPY: number; borrowAPY: number; utilization: number;
}

function toMarket(r: Reserve): Market {
  // `totalSupply` and `totalBorrow` are ALREADY in USD, despite sitting next to a `price` column.
  // WETH reads 1.62B and WBTC 172.6M, which are dollar amounts, not token counts. Multiplying by
  // price double-counts and produced a $97,878B headline. The check: summing these raw gives
  // $8.72B, which matches the ecosystem SparkLend line and the supplied series on the chart.
  const supplied = r.totalSupply;
  const borrowed = r.totalBorrow;
  const util = Number.isFinite(r.utilization) ? r.utilization : supplied > 0 ? (borrowed / supplied) * 100 : 0;
  return {
    id: r.symbol.toLowerCase(),
    protocol: 'SparkLend',
    chain: 'Ethereum',
    collateral: r.symbol,
    loan: r.symbol,
    supplied,
    borrowed,
    utilization: util,
    supply_apy: r.supplyAPY ?? 0,
    borrow_apy: r.borrowAPY ?? 0,
    // The markets route serves `ltv` as 0 and `liquidationThreshold` unscaled (DAI reads 0.01),
    // so neither is a publishable risk parameter. Passed undefined so the table reads n/a rather
    // than asserting a 0% liquidation threshold on a live lending market.
    lltv: undefined as unknown as number,
    risk: risk(util),
    address: r.address,
    logos: { protocol: protocolLogo('sparklend'), chain: chainLogo('ethereum') },
  };
}

export const loadOverview = cache(async (): Promise<Overview> => {
  const [reserves, ecosystem, peers] = await Promise.all([
    get<Reserve[]>('/api/markets'),
    get<any>('/api/ecosystem'),
    get<any>('/api/peers'),
  ]);

  const markets = (reserves ?? []).map(toMarket).filter((m) => m.supplied > 0).sort((a, b) => b.supplied - a.supplied);
  const supplied = markets.reduce((a, m) => a + m.supplied, 0);
  const borrowed = markets.reduce((a, m) => a + m.borrowed, 0);

  // History: SparkLend supplied from the ecosystem series, borrows from the peer series. Both are
  // daily and keyed on the same UTC day, so they are joined rather than plotted on two scales.
  const ecoDaily: any[] = Array.isArray(ecosystem?.daily) ? ecosystem.daily : [];
  const peerDaily: any[] = Array.isArray(peers?.daily) ? peers.daily : [];
  const borrowByDay = new Map<string, number>();
  for (const p of peerDaily) borrowByDay.set(isoDay(p.date), p.sparklend ?? 0);

  const history: Point[] = ecoDaily
    .slice(-365)
    .map((p) => ({ day: isoDay(p.date), supply: p.sparklend ?? 0, borrow: borrowByDay.get(isoDay(p.date)) ?? 0 }))
    .filter((p) => p.supply > 0);

  const last = history[history.length - 1];
  const asOf = last?.day ?? new Date().toISOString().slice(0, 10);
  const weekAgo = history[history.length - 8] ?? history[0];

  // The product split is the interesting cut for Spark: Savings, SparkLend and the Liquidity Layer
  // are three different businesses under one name.
  const cur = ecosystem?.current ?? {};
  const byProtocol: Share[] = [
    { name: 'SparkLend', value: cur.sparklend ?? 0 },
    { name: 'Spark Liquidity Layer', value: cur.sll ?? 0 },
    { name: 'Savings', value: cur.savings ?? 0 },
  ].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);

  const byChain: Share[] = [{ name: 'Ethereum', value: supplied }];

  return {
    asOf,
    sample: false,
    kpis: {
      supplied,
      borrowed,
      // Point is indexed as `number | string`, so the series values are narrowed explicitly.
      suppliedChange7d: pctChange(Number(last?.supply ?? 0), Number(weekAgo?.supply ?? 0)),
      borrowedChange7d: pctChange(Number(last?.borrow ?? 0), Number(weekAgo?.borrow ?? 0)),
      markets: markets.length,
      utilization: supplied > 0 ? (borrowed / supplied) * 100 : 0,
      supplyApy: weightedSupplyApy(markets),
    },
    history,
    historyGrain: 'daily',
    rates: [],
    byChain,
    byProtocol,
    markets,
    // Spark's own reconciliation is between its reserve-level book and the whole ecosystem, which
    // includes two product lines SparkLend's reserves do not cover.
    reconciliation: cur.total
      ? {
          ours: supplied,
          theirs: cur.total,
          theirsSource: 'the Spark ecosystem total',
          note: 'Ours counts SparkLend reserves on Ethereum. The ecosystem figure also carries Spark Savings and the Spark Liquidity Layer, which are separate businesses rather than a disagreement.',
        }
      : null,
  };
});

/** Supply APY weighted by supplied value, so a small reserve at a high rate cannot move it. */
function weightedSupplyApy(markets: Market[]): number {
  const total = markets.reduce((a, m) => a + m.supplied, 0);
  if (total <= 0) return 0;
  return markets.reduce((a, m) => a + m.supply_apy * m.supplied, 0) / total;
}

export const loadMarket = cache(async (id: string): Promise<MarketDetail | null> => {
  const o = await loadOverview();
  const market = o.markets.find((m) => m.id === id);
  if (!market) return null;
  return {
    asOf: o.asOf,
    sample: false,
    market,
    // Per-reserve history is not exposed by the markets route, so the charts stay empty rather
    // than showing the protocol aggregate under one reserve's name.
    history: [],
    rates: [],
    facts: [
      { label: 'Reserve', value: market.collateral },
      { label: 'Chain', value: 'Ethereum' },
      { label: 'Address', value: market.address ?? 'n/a' },
      { label: 'Supply APY', value: `${market.supply_apy.toFixed(2)}%` },
      { label: 'Borrow APY', value: `${market.borrow_apy.toFixed(2)}%` },
    ],
    suppliers: [],
    healthBands: [],
  };
});
